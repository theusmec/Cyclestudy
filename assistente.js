/* Cycle: assistente local, sem IA e sem internet.
   Entende um conjunto fechado de pedidos em português por "assunto + quando + verbo" e devolve um plano
   no mesmo formato do Assistente com IA: { resposta, acoes: [{ nome, parametros }] }.
   O app valida e executa as ações (pedindo confirmação quando muda dados) e monta as respostas com os dados do próprio aparelho.
   Fora do conjunto de pedidos conhecidos, devolve { fora: true }. */
(function (root) {
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var fmt = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var parseISO = function (s) { var p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var addDays = function (iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return fmt(d); };
  var dow = function (iso) { return parseISO(iso).getDay(); };                   // 0 = domingo

  // normaliza sem mudar o tamanho do texto: cada caractere vira uma letra minúscula sem acento ou um espaço
  function normPos(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      c = c.length ? c.charAt(0) : " ";
      out += /[a-z0-9]/.test(c) ? c : " ";
    }
    return out;
  }
  var DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  var PREP_ANTES = /(?:^|\s)(?:para|pra|pro|ate|em|na|no|dia|de|da|do|a)\s+$/;

  // ---------- datas ----------
  function achaData(Q, N, hoje) {                         // -> { iso, ini, fim } (posições em Q/N) ou null
    var m;
    if ((m = /\bdepois de amanha\b/.exec(N))) return { iso: addDays(hoje, 2), ini: m.index, fim: m.index + m[0].length };
    if ((m = /\b(?:amanha|dia seguinte)\b/.exec(N))) return { iso: addDays(hoje, 1), ini: m.index, fim: m.index + m[0].length };
    if ((m = /\b(?:hoje|hj)\b/.exec(N))) return { iso: hoje, ini: m.index, fim: m.index + m[0].length };
    if ((m = /\b(?:daqui a|em) (\d{1,3}) dias?\b/.exec(N))) return { iso: addDays(hoje, +m[1]), ini: m.index, fim: m.index + m[0].length };
    if ((m = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/.exec(Q))) {
      var dd = +m[1], mm = +m[2], yy = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : parseISO(hoje).getFullYear();
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
        var iso = yy + "-" + pad(mm) + "-" + pad(dd);
        if (!m[3] && iso < hoje) iso = (yy + 1) + "-" + pad(mm) + "-" + pad(dd);
        return { iso: iso, ini: m.index, fim: m.index + m[0].length };
      }
    }
    if ((m = /\bdia (\d{1,2})\b/.exec(N)) && +m[1] >= 1 && +m[1] <= 31) {
      var h = parseISO(hoje), d = new Date(h.getFullYear(), h.getMonth(), +m[1]);
      if (fmt(d) < hoje) d = new Date(h.getFullYear(), h.getMonth() + 1, +m[1]);
      return { iso: fmt(d), ini: m.index, fim: m.index + m[0].length };
    }
    if ((m = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?: feira)?\b/.exec(N))) {
      var alvo = DIAS[m[1]], dif = (alvo - dow(hoje) + 7) % 7; if (dif === 0) dif = 7;
      return { iso: addDays(hoje, dif), ini: m.index, fim: m.index + m[0].length };
    }
    return null;
  }

  // ---------- matéria ----------
  var STOPM = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, a: 1, o: 1, para: 1, com: 1, em: 1 };
  function achaMateria(N, materias) {                      // -> { materia, spans, ambiguas } (materia = id) ou null
    var achados = [];
    materias.forEach(function (m) {
      var nome = normPos(m.name).replace(/\s+/g, " ").trim(), toks = nome.split(" ").filter(function (w) { return w && !STOPM[w]; });
      var score = 0, grande = false, spans = [];
      toks.forEach(function (w) {
        var mm = new RegExp("(?:^|\\s)(" + w + ")(?=\\s|$)").exec(N);
        if (mm) { score += w.length >= 4 ? 2 : 1; if (w.length >= 4) grande = true; var ini = mm.index + mm[0].length - mm[1].length; spans.push([ini, ini + w.length]); }
      });
      if (nome && N.indexOf(" " + nome + " ") >= 0) score += 3;
      if (grande && score > 0) achados.push({ id: m.id, name: m.name, score: score, spans: spans });
    });
    if (!achados.length) return null;
    achados.sort(function (a, b) { return b.score - a.score; });
    var topo = achados.filter(function (a) { return a.score === achados[0].score; });
    if (topo.length > 1) return { materia: null, ambiguas: topo.map(function (a) { return a.name; }), spans: [] };
    return { materia: achados[0].id, nome: achados[0].name, spans: achados[0].spans, ambiguas: null };
  }

  // ---------- intenção ----------
  var R = {
    prova: /\b(prova|provas|exame|avaliacao|avaliacoes|p1|p2|p3|sub|substitutiva)\b/,
    revisao: /\b(revis\w*|rever)\b/,
    trabalho: /\b(trabalho\w*|entrega\w*|relatorio\w*|tarefa\w*|projeto\w*|seminario\w*)\b/,
    nota: /\b(nota\w*|media|medias|aprovad\w*|reprovad\w*|reprovar|aprovar|passar|passando)\b|\b(?:preciso|quanto|que nota) (?:tirar|tiro)\b/,
    estudo: /\b(estud\w*|quantas horas|total de horas|horas de|minutos)\b/,
    aula: /\b(aula\w*|horario\w*)\b/,
    topico: /\b(topico\w*|ementa|assunto\w*|conteudo\w*|materia)\b/,
    agenda: /\b(agenda|compromisso\w*|marcad\w*|dia|dias|semana|rola|panorama|resumo|visao|livre|ocupad\w*)\b/,
    atras: /\b(atras\w*|vencid\w*|pendent\w*|deixei|deixou|perdi|perdeu|devendo|nao fiz|em atraso|para tras)\b/,
    acaoMover: /\b(mov\w*|mande|mandar|passa|passe|joga|jogue|puxa|puxe|traz|traga|reagend\w*|remarc\w*|adiar|adie|coloca|coloque|leva|leve)\b/,
    acaoCriar: /\b(cri\w*|cadastr\w*|adicion\w*|anot\w*|registr\w*|novo|nova|coloca|coloque|incluir|inclua)\b/,
    hoje: /\b(hoje|hj|agora)\b/, amanha: /\b(amanha|seguinte)\b/, semana: /\b(semana|proximos dias|7 dias|sete dias|proximos 7)\b/,
    prox: /\b(proxim\w*|vem|vira|seguir|seguinte|mais perto)\b/,
    quando: /\b(quando|horario|que dia)\b/,
    ajuda: /^\s*(?:ajuda|help|comandos)\s*$|\b(?:o que (?:voce|vc) (?:sabe|faz|pode)|como (?:voce|vc|o cycle|o app|esse app|o assistente) funciona|para que (?:voce|vc|o assistente) serve|me ajuda com o app)\b/,
    saudacao: /^\s*(?:oi|ola|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|eai)\b/
  };

  function parse(texto, ctx) {
    var q = String(texto || "").trim(), hoje = ctx.hoje, materias = ctx.materias || [];
    var Q = " " + q + " ", N0 = " " + normPos(q) + " ";   // N0 tem as posições alinhadas com Q (para recortar o título)
    var N = N0; if (/\baula\b/.test(N)) N = N.replace(/\b(?:a )?que horas\b/g, " horario ");
    var f = {}; Object.keys(R).forEach(function (k) { f[k] = R[k].test(N); });
    var dt = achaData(Q, N0, hoje), mt = achaMateria(N0, materias);
    var matP = mt && mt.materia ? { materia: mt.materia } : {};
    var out = { intent: "fora", fora: true, texto: q };

    if (!q) return out;
    if (f.ajuda || f.saudacao) return { intent: "ajuda", acoes: [{ nome: "ajuda", parametros: { saudacao: !!f.saudacao && !f.ajuda } }] };

    // ação: criar trabalho
    if (f.acaoCriar && f.trabalho) return criarTrabalho(Q, N0, q, dt, mt, materias);
    // ação: mover revisões atrasadas
    if (f.acaoMover && (f.revisao || f.atras)) return { intent: "mover_atrasadas", acoes: [{ nome: "mover_itens", parametros: { seletor: Object.assign({ tipo: "revisao", atrasadas: true }, matP), statusDestino: "hoje" } }] };
    if (mt && mt.ambiguas && (f.revisao || f.nota || f.trabalho || f.topico || f.aula || f.estudo)) return { intent: "ambigua", ambiguas: mt.ambiguas, resposta: "Qual matéria você quer dizer: " + mt.ambiguas.join(" ou ") + "? Repita o pedido com o nome completo." };
    var tipoIntent = null;
    if (f.revisao) tipoIntent = f.atras ? "revisoes_atrasadas" : "revisoes_hoje";
    else if (f.atras && !f.trabalho && !f.prova) tipoIntent = "revisoes_atrasadas";
    else if (f.nota && !f.estudo) tipoIntent = "notas_media";
    else if (f.prova && (f.prox || f.quando || dt || /\b(data|datas|dia|dias|falta|faltam|quanto tempo|calendario|marcad\w*|agenda|cai|acontece|proximas?)\b/.test(N) || N.trim().split(/\s+/).length <= 3)) tipoIntent = "proxima_prova";
    else if (f.prova) return out;
    else if (f.trabalho) tipoIntent = "trabalhos_prazos";
    else if (f.estudo) tipoIntent = "horas_estudadas";
    else if (f.topico && (f.prox || f.aula)) tipoIntent = "proximo_topico";
    else if (f.aula && (f.hoje || f.amanha || (dt && dt.iso !== hoje))) tipoIntent = "agenda";
    else if (f.aula && (f.prox || f.quando)) tipoIntent = f.prox && /\b(o que|qual materia|assunto|conteudo)\b/.test(N) ? "proximo_topico" : "proxima_aula";
    else if (f.topico) tipoIntent = "proximo_topico";
    else if (f.aula) tipoIntent = "proxima_aula";
    else if (f.agenda || /\bo que (tenho|tem|rola|preciso fazer|vem)\b|\bcom o que\b/.test(N)) tipoIntent = "agenda";
    if (!tipoIntent) return out;

    switch (tipoIntent) {
      case "revisoes_atrasadas": return { intent: tipoIntent, acoes: [{ nome: "consultar", parametros: { entidade: "itens", seletor: Object.assign({ tipo: "revisao", atrasadas: true }, matP) } }] };
      case "revisoes_hoje": return { intent: tipoIntent, acoes: [{ nome: "consultar", parametros: { entidade: "itens", seletor: Object.assign({ tipo: "revisao", status: "hoje" }, matP) } }] };
      case "trabalhos_prazos": return { intent: tipoIntent, acoes: [{ nome: "consultar", parametros: { entidade: "itens", seletor: Object.assign({ tipo: "trabalho" }, matP) } }] };
      case "notas_media": return { intent: tipoIntent, acoes: [{ nome: "consultar", parametros: { entidade: "notas", seletor: matP } }] };
      case "proxima_prova": return { intent: tipoIntent, acoes: [{ nome: "proxima_prova", parametros: matP }] };
      case "horas_estudadas": return { intent: tipoIntent, acoes: [{ nome: "horas", parametros: Object.assign({ periodo: f.hoje ? "hoje" : "semana" }, matP) }] };
      case "proximo_topico": return { intent: tipoIntent, acoes: [{ nome: "proximo_topico", parametros: matP }] };
      case "proxima_aula": return { intent: tipoIntent, acoes: [{ nome: "proxima_aula", parametros: matP }] };
      case "agenda": {
        var de = hoje, ate = hoje, nome = "agenda_hoje";
        if (f.semana) { de = hoje; ate = addDays(hoje, f.semana && /\b(proximos dias|7 dias|sete dias|proximos 7)\b/.test(N) ? 6 : 6 - ((dow(hoje) + 6) % 7)); nome = "agenda_semana"; }
        else if (dt) { de = ate = dt.iso; nome = dt.iso === hoje ? "agenda_hoje" : dt.iso === addDays(hoje, 1) ? "agenda_amanha" : "agenda_dia"; }
        return { intent: nome, acoes: [{ nome: "agenda", parametros: { de: de, ate: ate } }] };
      }
    }
    return out;
  }

  function criarTrabalho(Q, N, q, dt, mt, materias) {
    var base = { intent: "criar_trabalho" };
    var sid = mt && mt.materia ? mt.materia : (materias.length === 1 ? materias[0].id : null);
    if (mt && mt.ambiguas) return Object.assign(base, { resposta: "Qual matéria: " + mt.ambiguas.join(" ou ") + "? Repita o pedido com o nome completo da matéria." });
    if (!sid) return Object.assign(base, { resposta: materias.length ? "Para qual matéria é esse trabalho? Diga, por exemplo: \"adiciona trabalho Relatório de " + materias[0].name + " para sexta\"." : "Cadastre uma matéria primeiro (página Matérias) e peça de novo." });
    if (!dt) return Object.assign(base, { resposta: "Para quando é o prazo? Diga, por exemplo: \"... para sexta\", \"... dia 20\" ou \"... 20/10\"." });
    // monta o título: tira o comando, a data, a matéria e palavras soltas
    var marca = []; for (var i = 0; i < Q.length; i++) marca.push(false);
    var gasta = function (a, b) { for (var j = Math.max(0, a); j < Math.min(Q.length, b); j++) marca[j] = true; };
    var antes = function (ini) { var m = PREP_ANTES.exec(N.slice(0, ini)); return m ? ini - m[0].replace(/^\s/, "").length : ini; };
    gasta(antes(dt.ini), dt.fim);
    if (mt && mt.materia) { var spans = mt.spans.slice().sort(function (a, b) { return a[0] - b[0]; }); spans.forEach(function (s, k) { gasta(k === 0 ? antes(s[0]) : s[0], s[1]); }); }
    var s = ""; for (var k = 0; k < Q.length; k++) s += marca[k] ? " " : Q.charAt(k);
    s = s.replace(/^\s*(?:por favor\s*)?(?:adiciona|adicionar|adicione|cria|criar|crie|cadastra|cadastrar|cadastre|anota|anotar|anote|registra|registrar|registre|coloca|colocar|coloque|inclui|incluir|inclua)\b[\s:,\-]*/i, "")
      .replace(/^(?:um|uma|o|a)\s+/i, "").replace(/^(?:novo|nova)\s+/i, "").replace(/^(?:trabalho|tarefa|entrega)\b[\s:,\-]*/i, "")
      .replace(/\s+/g, " ").replace(/^[\s:,\-.]+|[\s:,\-.]+$/g, "");
    for (var r = 0; r < 3; r++) s = s.replace(/\s+(?:para|pra|pro|ate|até|em|na|no|dia|de|da|do|a|que vence|vence)$/i, "").trim();
    var titulo = s ? s.charAt(0).toUpperCase() + s.slice(1) : "Trabalho";
    return Object.assign(base, { acoes: [{ nome: "criar_trabalho", parametros: { materia: sid, titulo: titulo.slice(0, 80), data: dt.iso } }] });
  }

  var EXEMPLOS = ["O que tenho amanhã?", "Quando é a próxima prova?", "Quais revisões estão atrasadas?", "Quanto falta para passar?", "Quantas horas estudei esta semana?", "Qual o próximo tópico da ementa?", "Adiciona trabalho Relatório 3 de [matéria] para sexta", "Move as revisões atrasadas para hoje"];
  root.__cycleAssist = { parse: parse, normPos: normPos, achaData: achaData, achaMateria: achaMateria, EXEMPLOS: EXEMPLOS };
})(typeof window !== "undefined" ? window : globalThis);
