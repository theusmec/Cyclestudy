/* Cycle: montar a ementa a partir de um PDF, no próprio aparelho (sem enviar o arquivo para lugar nenhum).
   extract(file): lê o texto do PDF com o pdf.js (lib/pdf.min.js, carregado só quando você usa).
   toSyllabus(texto): acha a parte do conteúdo programático e devolve a lista no formato da ementa do app
   (um tópico por linha; "# Título" para unidades). O resultado é só uma sugestão: você revisa antes de salvar. */
(function () {
  var MAX = 80;
  var norm = function (s) { return s.replace(/[ \t]+/g, " ").replace(/ {2,}/g, " ").trim(); };
  var fail = function (code, msg) { var e = new Error(msg); e.code = code; return e; };

  // ---------- ler o PDF ----------
  function extract(file) {
    return import("./lib/pdf.min.js").then(function (pdfjs) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("lib/pdf.worker.min.js", document.baseURI).href;
      return file.arrayBuffer().then(function (buf) { return pdfjs.getDocument({ data: new Uint8Array(buf) }).promise; });
    }).then(function (doc) {
      var out = [], chain = Promise.resolve();
      for (var n = 1; n <= doc.numPages; n++) (function (num) {
        chain = chain.then(function () { return doc.getPage(num); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { out.push(pageLines(tc.items)); });
      })(n);
      return chain.then(function () {
        var text = out.map(function (p) { return p.join("\n"); }).join("\n");
        if (!/[A-Za-zÀ-ÿ]{3}/.test(text)) throw fail("sem-texto", "Esse PDF não tem texto que dê para ler (parece uma imagem escaneada). Copie os tópicos à mão ou use um PDF com texto selecionável.");
        return { text: text, pages: doc.numPages };
      });
    }, function (e) {
      if (e && e.code) throw e;
      if (e && e.name === "PasswordException") throw fail("senha", "Esse PDF tem senha. Abra-o, salve uma cópia sem senha e tente de novo.");
      throw fail("pdf", "Não consegui abrir esse PDF.");
    });
  }
  function pageLines(items) {            // junta os pedaços de texto da página em linhas, de cima para baixo
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.transform) return;
      var y = it.transform[5], x = it.transform[4], r = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) <= 3) { r = rows[i]; break; }
      if (!r) { r = { y: y, parts: [] }; rows.push(r); }
      r.parts.push({ x: x, s: it.str, w: it.width || 0 });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var s = "", end = null;
      r.parts.forEach(function (p) { if (end != null && p.x - end > 1.5 && !/ $/.test(s) && !/^ /.test(p.s)) s += " "; s += p.s; end = p.x + p.w; });
      return norm(s);
    }).filter(Boolean);
  }

  // ---------- achar os tópicos no texto ----------
  // título de seção: a palavra sozinha na linha, ou seguida de ":" e do texto (assim um tópico como "Conteúdo de física" não conta como título)
  var START = /^(?:conte[úu]do\s+program[áa]tico|programa(?:\s+(?:da\s+disciplina|resumido|detalhado|da\s+mat[ée]ria))?|ementa|t[óo]picos(?:\s+abordados)?|unidades?\s+did[áa]ticas?|conte[úu]dos?)\s*(?:[:\-–.]+\s*(.*))?$/i;
  var END_RE = /^(?:bibliografia|refer[êe]ncias?|avalia[çc][ãa]o|crit[ée]rios?|metodologia|cronograma|objetivos?|pr[ée]-?requisitos?|carga\s+hor[áa]ria|sistema\s+de\s+avalia|recursos|observa[çc][õo]es|hor[áa]rio|docente|professor)\b/i;
  var END = { test: function (l) { return l.length <= 40 && END_RE.test(l); } };
  var UNIT = /^(unidade|m[óo]dulo|cap[íi]tulo|parte)\s+(\d+|[ivxl]+)\b[\s:.\-–]*(.*)$/i;
  var NUMBER = /^(\d{1,2}(?:\.\d{1,2})*)[.)\-–]?\s+(\S.*)$/;
  var BULLET = /^(?:[-•*·▪●■◦►>]|[a-z]\))\s+(\S.*)$/;

  function parseItems(lines) {
    var starts = lines.filter(function (l) { return NUMBER.test(l) || BULLET.test(l) || UNIT.test(l); }).length;
    var items = [], cur = null;
    if (starts < 2 && lines.length) {                      // texto corrido: divide por numeração no meio da frase, por ponto e vírgula ou por frases
      var joined = lines.join(" ").replace(/(\w)- (?=[a-zà-ÿ])/g, "$1");
      var parts = joined.split(/\s(?=\d{1,2}[.)]\s+[A-ZÀ-Ý])/);
      if (parts.length < 3) parts = joined.split(/\s*;\s*/);
      if (parts.length < 3) parts = joined.split(/\.\s+(?=[A-ZÀ-Ý])/);
      return parts.map(function (p) { return { depth: 1, text: norm(p.replace(/^\d{1,2}[.)]\s*/, "")).replace(/[.;,]+$/, ""), unit: false }; }).filter(function (i) { return i.text.length > 2; });
    }
    lines.forEach(function (l) {
      var m = UNIT.exec(l), n = NUMBER.exec(l), b = BULLET.exec(l);
      if (m) { cur = { depth: 0, text: norm(m[1] + " " + m[2] + (m[3] ? " – " + m[3] : "")), unit: true }; items.push(cur); }
      else if (n) { cur = { depth: n[1].split(".").length, text: n[2], unit: false }; items.push(cur); }
      else if (b) { cur = { depth: 9, text: b[1], unit: false }; items.push(cur); }
      else if (cur && !cur.unit && (/^[a-zà-ÿ(]/.test(l) || /[-,]$/.test(cur.text))) cur.text = (/-$/.test(cur.text) && /^[a-zà-ÿ]/.test(l) ? cur.text.slice(0, -1) : cur.text + " ") + l;
      else if (cur && cur.unit && /^[a-zà-ÿ]/.test(l)) cur.text += " " + l;
      else if (l.length <= 70 && l === l.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(l)) { cur = { depth: 0, text: l.charAt(0) + l.slice(1).toLowerCase(), unit: true }; items.push(cur); }
      else { cur = { depth: 1, text: l, unit: false }; items.push(cur); }
    });
    items.forEach(function (i) { i.text = norm(i.text).replace(/[.;,]+$/, ""); });
    return items.filter(function (i) { return i.text.length > 2; });
  }
  function build(items) {                                  // "1." com "1.1" por baixo vira unidade; senão cada item é um tópico
    var hasSub = items.some(function (i) { return i.depth === 2; });
    var out = [], units = 0, topics = 0, last = "";
    items.forEach(function (i) {
      var asUnit = i.unit || (hasSub && i.depth === 1);
      var line = asUnit ? "# " + i.text : i.text;
      if (line === last) return; last = line;
      if (asUnit) units++; else topics++;
      out.push(line);
    });
    // unidade sem nenhum tópico embaixo vira tópico comum
    for (var k = 0; k < out.length; k++) if (/^# /.test(out[k]) && (k === out.length - 1 || /^# /.test(out[k + 1]))) { out[k] = out[k].slice(2); units--; topics++; }
    var cut = [], t = 0;
    for (var j = 0; j < out.length; j++) { if (!/^# /.test(out[j])) { if (++t > MAX) break; } cut.push(out[j]); }
    return { lines: cut, units: units, topics: Math.min(topics, MAX), truncated: topics > MAX };
  }
  function toSyllabus(raw) {
    var lines = raw.split(/\r?\n/).map(norm).filter(Boolean), best = null, cands = [];
    lines.forEach(function (l, i) { var m = START.exec(l); if (m) cands.push({ i: i, rest: m[1] || "" }); });
    cands.forEach(function (c) {
      var sec = c.rest ? [c.rest] : [];
      for (var k = c.i + 1; k < lines.length; k++) {
        if (END.test(lines[k]) && sec.length) break;
        if (START.test(lines[k])) { if (sec.length) break; continue; }       // outro título: encerra a seção (ou é um título seguido de título, e é pulado)
        sec.push(lines[k]);
      }
      var r = build(parseItems(sec)); r.from = c.i;
      if (!best || r.topics > best.topics) best = r;
    });
    if (!best || best.topics < 2) { best = build(parseItems(lines.filter(function (l) { return !END.test(l); }))); best.whole = true; }
    best.text = best.lines.join("\n");
    return best;
  }

  // ---------- Plano de Ensino (UNESP): campos do cabeçalho, seções e tópicos ----------
  // Rodapé oficial repetido em toda página do plano, às vezes no meio de uma seção (formato real visto em planos da UNESP):
  //   "ATENÇÃO: Este é um documento oficial da Graduação…" / "https://sistemas.unesp.br/…" / "<Unidade> - Câmpus de X - Avenida …" / "Paulo. E-mail: … Página de Internet: …" / "Câmpus de X" / "PLANO DE ENSINO"
  var RODAPE = [/^ATEN[ÇC][ÃA]O:\s*Este é um documento oficial/i, /sistemas\.unesp\.br/i, /C[âa]mpus de .+ - (?:Avenida|Av\.|Rua|Rodovia|Pra[çc]a)/i,
    /E-mail:.*P[áa]gina de Internet/i, /^C[âa]mpus de [^-]+$/i, /^PLANO DE ENSINO$/i];
  function limpaRodape(lines) { return lines.filter(function (l) { return !RODAPE.some(function (r) { return r.test(l); }); }); }

  // títulos de seção do plano (a linha é só o título)
  var SECAO = [["objetivos", /^objetivos?$/i], ["conteudo", /^conte[úu]do$/i], ["metodologia", /^metodologia$/i], ["bibliografia", /^bibliografia$/i],
    ["criterios", /^crit[ée]rios de avalia/i], ["ementa", /^ementa\b/i], ["aprovacao", /^aprova[çc][ãa]o$/i]];
  var ehTitulo = function (l) { for (var i = 0; i < SECAO.length; i++) if (SECAO[i][1].test(l)) return SECAO[i][0]; return null; };
  var num = function (s) { return parseFloat(String(s).replace(",", ".")); };

  function cabecalho(lines) {   // rótulo numa linha, valor na seguinte; créditos e horas numa linha de valores abaixo de "Créditos Carga Horária C.H.Total Seriação"
    var c = {}, i;
    for (i = 0; i < lines.length - 1; i++) {
      if (/^Curso$/i.test(lines[i]) && !c.curso) c.curso = lines[i + 1];
      else if (/^Disciplina$/i.test(lines[i]) && !c.nome) {
        var m = /^(.+?)\s+-\s+(.+)$/.exec(lines[i + 1]);
        if (m) { c.codigo = m[1].trim(); c.nome = m[2].trim(); } else c.nome = lines[i + 1];
      } else if (/^Cr[ée]ditos\b.*Carga/i.test(lines[i]) && c.creditos == null) {
        var v = /^(\d+(?:[.,]\d+)?)\s+T:\s*[\d.,]+;\s*P:\s*[\d.,]+;.*?([\d.,]+)\s*h\b/i.exec(lines[i + 1]);
        if (v) { c.creditos = num(v[1]); c.cargaHoraria = num(v[2]); }
      }
    }
    return c;
  }
  function secoes(lines) {      // { conteudo: [linhas], … }; a seção "aprovacao" e o que vem depois (nomes, código de autenticidade) é descartada sem ser lida
    var out = {}, cur = null;
    lines.forEach(function (l) {
      var t = ehTitulo(l);
      if (t) { cur = t === "aprovacao" ? null : t; if (cur && !out[cur]) out[cur] = []; return; }
      if (cur) out[cur].push(l);
    });
    return out;
  }
  var CAPS = function (l) { return l.length <= 70 && l === l.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(l); };
  var MARCA = function (l) { return NUMBER.test(l) || BULLET.test(l) || UNIT.test(l); };
  // "Título: explicação longa" vira só o título (item numerado muito longo)
  function encurta(line) {
    var m = /^(.{3,70}?):\s+(\S.{30,})$/.exec(line);
    return m && !/^# /.test(line) ? m[1] : line;
  }
  // tópicos de uma seção; devolve null se não achar nada que preste
  function topicosDe(sec) {
    var avisos = [], lines = sec.slice(), n, i, cut = -1;
    for (i = 0; i < lines.length; i++) if (/^(?:fontes?|refer[êe]ncias?)\s*:?$/i.test(lines[i])) { cut = i; break; }
    if (cut >= 0) lines = lines.slice(0, cut);
    // introdução em prosa antes da lista ("A disciplina contempla…", "Assim o conteúdo contempla:"): a lista começa no "1-" que tem "2-" depois, ou na primeira marca
    var ini = -1, vistoDois = false;
    for (i = 0; i < lines.length; i++) { var m1 = /^1\s*[-.)–]\s*\S/.exec(lines[i]); if (m1) { for (var k = i + 1; k < lines.length; k++) if (/^2\s*[-.)–]\s*\S/.test(lines[k])) { vistoDois = true; break; } if (vistoDois) { ini = i; break; } } }
    if (ini < 0) { for (i = 0; i < lines.length; i++) if (MARCA(lines[i])) { ini = i; break; } if (ini >= 0) while (ini > 0 && CAPS(lines[ini - 1])) ini--; }
    var marcas = lines.filter(MARCA).length;
    if (ini > 0 && marcas >= 2) { avisos.push("texto introdutório descartado"); lines = lines.slice(ini); }
    var built = build(parseItems(lines)), feitos = built.lines;
    if (marcas < 2 && built.topics < 2 && lines.length) {   // parágrafo corrido numa frase só: separa por vírgulas
      var joined = norm(lines.join(" ")).replace(/\.$/, ""), partes = joined.split(/\s*,\s*/).filter(function (p) { return p.length > 2; });
      if (partes.length >= 3) { built = build(partes.map(function (p) { return { depth: 1, text: p.charAt(0).toUpperCase() + p.slice(1), unit: false }; })); avisos.push("tópicos separados por vírgula: confira"); }
    }
    n = built.topics; if (n < 2) return null;
    if (vistoDois) built.lines = built.lines.map(encurta);   // só em lista numerada ("1- Título: explicação…"); em lista com "-" o texto depois do ":" é parte do tópico
    built.text = built.lines.join("\n"); built.avisos = avisos;
    return built;
  }
  function parsePlano(raw) {
    var linhas = limpaRodape(String(raw || "").split(/\r?\n/).map(norm).filter(Boolean));
    var c = cabecalho(linhas), padrao = !!(c.nome && (c.curso || c.codigo)), sec = secoes(linhas), r = { avisos: [] };
    Object.keys(c).forEach(function (k) { r[k] = c[k]; });
    r.padrao = padrao; r.confianca = padrao ? "alta" : "baixa";
    var t = sec.conteudo ? topicosDe(sec.conteudo) : null;
    if (!t && sec.ementa) { t = topicosDe(sec.ementa); if (t) t.avisos.push("tópicos tirados da seção Ementa"); }
    if (!t && !padrao) { var g = toSyllabus(raw); if (g && !g.whole && g.topics >= 2) { t = g; t.avisos = []; } }
    if (t) { r.topicos = t.text; r.nTopicos = t.topics; r.nUnidades = t.units; r.truncado = !!t.truncated; r.avisos = r.avisos.concat(t.avisos || []); }
    else { r.topicos = ""; r.nTopicos = 0; r.nUnidades = 0; r.avisos.push("não consegui achar os tópicos: cole a lista à mão"); }
    if (!padrao) { r.avisos.push("não parece um Plano de Ensino da UNESP: confira com atenção"); r.confianca = "baixa"; }
    else if (r.avisos.some(function (a) { return /vírgula|Ementa|descartado/.test(a); })) r.confianca = "media";
    if (sec.criterios && sec.criterios.length) r.criterios = sec.criterios.join("\n").slice(0, 4000);
    if (sec.bibliografia && sec.bibliografia.length) r.bibliografia = sec.bibliografia.join("\n").slice(0, 4000);
    return r;
  }

  window.__cycleEmenta = { extract: extract, toSyllabus: toSyllabus, parsePlano: parsePlano };
})();
