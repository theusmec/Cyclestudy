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

  window.__cycleEmenta = { extract: extract, toSyllabus: toSyllabus };
})();
