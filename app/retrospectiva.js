/* Cycle: retrospectiva do semestre. Spec: SPEC-retrospectiva.md.
   Mostra o que a pessoa fez (horas, constancia, revisoes, topicos, entregas, notas) e as superacoes, sempre com dados reais:
   nada de IA, nada inventado, nunca compara com outras pessoas nem mostra "pontos fracos".
   calcular() e logica pura; abrir() monta a tela; arquivar() grava um resumo compacto em `retros/` ao confirmar o Fim de semestre. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  // ---------- datas e formatos ----------
  function parse(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function seg(s) { var d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function dm(s) { return s ? s.slice(8) + "/" + s.slice(5, 7) : ""; }
  function hm(min) { var m = Math.round(min), h = Math.floor(m / 60); return h + "h" + String(m % 60).padStart(2, "0"); }
  function n1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(".", ","); }
  var DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var soma = function (a) { return a.reduce(function (t, z) { return t + (z.minutes || 0); }, 0); };
  function nomePadrao(hoje) { var p = String(hoje).split("-"); return p[0] + "." + (+p[1] <= 6 ? 1 : 2); }

  // ---------- período ----------
  function periodoPadrao(d, hoje) {
    var datas = (d.sessions || []).filter(function (z) { return (z.minutes || 0) > 0 && z.date; }).map(function (z) { return z.date; }).sort();
    var ini = datas[0] || (d.settings && d.settings.planStart) || hoje;
    return { ini: ini, fim: hoje, nome: nomePadrao(hoje) };
  }

  // ---------- cálculo (puro) ----------
  function nota10(i) { var max = +i.max > 0 ? +i.max : 10; return i.nota == null || i.nota === "" ? null : (+i.nota / max) * 10; }
  function notaParcial(g) {
    var it = (g && g.itens || []).filter(function (i) { return (i.tipo || "prova") !== "sub" && nota10(i) != null; });
    if (!it.length) return null;
    var pesos = it.reduce(function (t, i) { return t + (+i.peso || 0); }, 0);
    return pesos > 0 ? it.reduce(function (t, i) { return t + (+i.peso || 0) * nota10(i); }, 0) / pesos : it.reduce(function (t, i) { return t + nota10(i); }, 0) / it.length;
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  function calcular(d, per) {
    var ini = per.ini, fim = per.fim, subs = d.subjects || [];
    var sess = (d.sessions || []).filter(function (z) { return z.date >= ini && z.date <= fim && (z.minutes || 0) > 0; });
    var total = soma(sess), manual = soma(sess.filter(function (z) { return z.kind === "manual"; }));
    var porDia = {}; sess.forEach(function (z) { porDia[z.date] = (porDia[z.date] || 0) + z.minutes; });
    var datas = Object.keys(porDia).sort();
    var metaTot = subs.reduce(function (t, s) { return t + (s.metaHoras > 0 ? s.metaHoras * 60 : 0); }, 0);

    // semanas (segunda a domingo) do período
    var semanas = [], w = seg(ini), ate = seg(fim);
    while (w <= ate && semanas.length < 80) {
      var we = addDays(w, 6);
      semanas.push({ ws: w, min: soma(sess.filter(function (z) { return z.date >= w && z.date <= we; })) });
      w = addDays(w, 7);
    }
    var estudadas = semanas.filter(function (x) { return x.min > 0; });
    var melhor = estudadas.reduce(function (b, x) { return !b || x.min > b.min ? x : b; }, null);

    // sequência de dias seguidos
    var seq = null, runIni = null, prev = null, n = 0;
    datas.forEach(function (dt) {
      if (prev && diff(prev, dt) === 1) n++; else { n = 1; runIni = dt; }
      prev = dt; if (!seq || n > seq.n) seq = { n: n, de: runIni, ate: dt };
    });

    // hábitos
    var porSem = [0, 0, 0, 0, 0, 0, 0]; sess.forEach(function (z) { porSem[parse(z.date).getDay()] += z.minutes; });
    var iMax = porSem.indexOf(Math.max.apply(null, porSem));
    var per4 = { "de manhã": 0, "à tarde": 0, "à noite": 0, "de madrugada": 0 };
    sess.filter(function (z) { return z.kind !== "manual" && z.start > 1e11; }).forEach(function (z) {
      var h = new Date(z.start).getHours();
      per4[h >= 5 && h < 12 ? "de manhã" : h >= 12 && h < 18 ? "à tarde" : h >= 18 ? "à noite" : "de madrugada"] += z.minutes;
    });
    var kP = Object.keys(per4).sort(function (a, b) { return per4[b] - per4[a]; })[0];

    // revisões, trabalhos, provas
    var revs = []; (d.contents || []).forEach(function (c) { (c.reviews || []).forEach(function (r) { if (r.done && r.doneOn >= ini && r.doneOn <= fim) revs.push({ c: c, r: r }); }); });
    var revEmDia = revs.filter(function (x) { return x.r.doneOn <= x.r.due; }).length;
    var entregues = (d.tasks || []).filter(function (t) { return t.status === "feita" && t.doneOn >= ini && t.doneOn <= fim; });
    var noPrazo = entregues.filter(function (t) { return t.doneOn <= t.due; }).length;
    var provas = (d.exams || []).filter(function (x) { return x.date >= ini && x.date <= fim; }).length;

    // por matéria
    var meio = addDays(ini, Math.floor(diff(ini, fim) / 2));
    var materias = subs.map(function (s) {
      var mine = sess.filter(function (z) { return z.subjectId === s.id; }), syl = s.syllabus || [];
      var meta = s.metaHoras > 0 ? s.metaHoras * 60 : 0, bateu = 0, primeira = null;
      if (meta) semanas.forEach(function (x) {
        var m = soma(mine.filter(function (z) { return z.date >= x.ws && z.date <= addDays(x.ws, 6); }));
        if (m >= meta) { bateu++; if (!primeira) primeira = x.ws; }
      });
      return { sid: s.id, nome: s.name, cor: s.color, min: soma(mine), metade1: soma(mine.filter(function (z) { return z.date <= meio; })), metade2: soma(mine.filter(function (z) { return z.date > meio; })),
        topVistos: syl.filter(function (t) { return t.seenOn; }).length, topTotal: syl.length,
        revFeitas: revs.filter(function (x) { return x.c.subjectId === s.id; }).length, nota: notaParcial(d.grades && d.grades[s.id]),
        metaSem: meta ? { bateu: bateu, de: semanas.length, primeira: primeira } : null };
    }).filter(function (m) { return m.min > 0 || m.revFeitas > 0 || m.nota != null || m.topVistos > 0; }).sort(function (a, b) { return b.min - a.min; });
    var topVistos = materias.reduce(function (t, m) { return t + m.topVistos; }, 0), topTotal = materias.reduce(function (t, m) { return t + m.topTotal; }, 0);

    var r = { nome: per.nome || nomePadrao(fim), ini: ini, fim: fim, total: total, manual: manual, cronometro: total - manual, dias: datas.length,
      semanasEstudadas: estudadas.length, mediaSemana: estudadas.length ? total / estudadas.length : 0, semanas: semanas, metaTot: metaTot,
      melhorSemana: melhor, sequencia: seq, diaSemana: total ? { nome: DIAS[iMax], min: porSem[iMax] } : null, periodoDia: per4[kP] > 0 ? { nome: kP, min: per4[kP] } : null,
      revisoes: { feitas: revs.length, emDia: revEmDia }, topicos: { vistos: topVistos, total: topTotal }, trabalhos: { entregues: entregues.length, noPrazo: noPrazo }, provas: provas, materias: materias };
    r.superacoes = superacoes(r, d, sess, datas);
    r.mensagem = mensagem(r);
    return r;
  }

  function superacoes(r, d, sess, datas) {
    var out = [], subs = d.subjects || [];
    if (r.semanasEstudadas >= 2 && r.melhorSemana && r.melhorSemana.min >= 60)
      out.push({ id: "melhor-semana", titulo: "Sua melhor semana: " + hm(r.melhorSemana.min), detalhe: "Semana de " + dm(r.melhorSemana.ws) + " a " + dm(addDays(r.melhorSemana.ws, 6)) + "." });
    var pri = null;
    r.materias.forEach(function (m) { if (m.metaSem && m.metaSem.primeira && (!pri || m.metaSem.primeira < pri.ws)) pri = { ws: m.metaSem.primeira, nome: m.nome }; });
    if (pri) out.push({ id: "primeira-meta", titulo: "Primeira meta semanal batida", detalhe: pri.nome + ", na semana de " + dm(pri.ws) + "." });
    if (r.sequencia && r.sequencia.n >= 3) out.push({ id: "sequencia", titulo: r.sequencia.n + " dias seguidos estudando", detalhe: "De " + dm(r.sequencia.de) + " a " + dm(r.sequencia.ate) + "." });
    // recomeço: voltou depois de uma pausa de 7+ dias e estudou em pelo menos 2 dos 7 dias seguintes
    var rec = null;
    for (var i = 1; i < datas.length; i++) {
      if (diff(datas[i - 1], datas[i]) - 1 < 7) continue;
      var volta = datas[i], seguintes = datas.filter(function (x) { return x >= volta && x <= addDays(volta, 6); }).length;
      if (seguintes >= 2 && (!rec || diff(datas[i - 1], volta) > rec.gap)) rec = { volta: volta, n: seguintes, gap: diff(datas[i - 1], volta) };
    }
    if (rec) out.push({ id: "recomeco", titulo: "Você retomou o ritmo", detalhe: "Voltou em " + dm(rec.volta) + " e estudou em " + rec.n + " dos 7 dias seguintes." });
    // nota que subiu
    var nb = null;
    subs.forEach(function (s) {
      var it = ((d.grades && d.grades[s.id] && d.grades[s.id].itens) || []).filter(function (i) { return (i.tipo || "prova") !== "sub" && nota10(i) != null; });
      for (var k = 1; k < it.length; k++) { var dl = nota10(it[k]) - nota10(it[k - 1]); if (dl >= 1 && (!nb || dl > nb.dl)) nb = { dl: dl, s: s, a: it[k - 1], b: it[k] }; }
    });
    if (nb) out.push({ id: "nota-subiu", titulo: "Nota que subiu: " + n1(nota10(nb.a)) + " → " + n1(nota10(nb.b)), detalhe: nb.s.name + ", de " + (nb.a.nome || "uma avaliação") + " para " + (nb.b.nome || "a seguinte") + "." });
    // crescimento
    var cr = null;
    r.materias.forEach(function (m) { if (m.metade1 > 0 && m.metade2 >= m.metade1 * 1.3 && m.metade2 - m.metade1 >= 120 && (!cr || m.metade2 - m.metade1 > cr.metade2 - cr.metade1)) cr = m; });
    if (cr) out.push({ id: "crescimento", titulo: "Mais tempo na segunda metade", detalhe: cr.nome + ": " + hm(cr.metade1) + " na primeira metade do período e " + hm(cr.metade2) + " na segunda." });
    if (r.revisoes.feitas >= 10 && r.revisoes.emDia / r.revisoes.feitas >= 0.8)
      out.push({ id: "revisoes-em-dia", titulo: Math.round(r.revisoes.emDia / r.revisoes.feitas * 100) + "% das revisões em dia", detalhe: r.revisoes.emDia + " de " + r.revisoes.feitas + " revisões feitas no dia previsto ou antes." });
    var tp = null;
    r.materias.forEach(function (m) { if (m.topTotal >= 5 && m.topVistos / m.topTotal >= 0.8 && (!tp || m.topVistos / m.topTotal > tp.topVistos / tp.topTotal)) tp = m; });
    if (tp) out.push({ id: "topicos", titulo: "Ementa quase toda vista", detalhe: tp.nome + ": " + tp.topVistos + " de " + tp.topTotal + " tópicos (" + Math.round(tp.topVistos / tp.topTotal * 100) + "%)." });
    if (r.trabalhos.entregues >= 3 && r.trabalhos.noPrazo === r.trabalhos.entregues) out.push({ id: "entregas", titulo: r.trabalhos.entregues + " trabalhos entregues, todos no prazo", detalhe: "" });
    return out;
  }

  function mensagem(r) {
    if (!r.total) return "Ainda não há tempo registrado neste período. Quando você começar, o Cycle conta cada hora.";
    if (r.total < 600) return "Foram " + hm(r.total) + " registradas: um começo. Cada hora conta, e o Cycle guarda tudo para o próximo semestre.";
    var v = [
      "Você estudou " + hm(r.total) + " em " + r.dias + " dias, ao longo de " + r.semanasEstudadas + " semanas. Foi trabalho de verdade.",
      hm(r.total) + " de estudo e " + r.dias + " dias dedicados: constância construída semana a semana.",
      "Em " + r.dias + " dias você somou " + hm(r.total) + " de estudo. Vale olhar para trás com orgulho."
    ];
    var t = v[hash(r.ini + r.fim + r.total) % v.length], h1 = r.materias.reduce(function (a, m) { return a + m.metade1; }, 0), h2 = r.materias.reduce(function (a, m) { return a + m.metade2; }, 0);
    if (h1 > 0 && h2 >= h1 * 1.1) t += " Na segunda metade do período você estudou " + Math.round((h2 / h1 - 1) * 100) + "% mais do que na primeira.";
    return t;
  }

  // ---------- leitura dos dados do aparelho (todas as sessões, não só os 120 dias da tela) ----------
  function ler() {
    var dump = window.__cycleDb ? window.__cycleDb.dump() : {}, d = { subjects: [], sessions: [], contents: [], tasks: [], exams: [], grades: {}, settings: dump["settings/main"] || {}, retros: [] };
    Object.keys(dump).forEach(function (k) {
      var i = k.indexOf("/"), col = k.slice(0, i), id = k.slice(i + 1), v = dump[k];
      if (col === "grades") d.grades[id] = v;
      else if (d[col] && Array.isArray(d[col])) { var o = {}; for (var p in v) o[p] = v[p]; o.id = id; d[col].push(o); }
    });
    return d;
  }

  // ---------- arquivo do semestre ----------
  var ULTIMO = null;   // nome e datas que a pessoa escolheu na tela; o arquivo usa os mesmos
  function arquivar(api) {
    var d = ler(), per = ULTIMO || periodoPadrao(d, api.today()), r = calcular(d, per), S = api.S;
    var cont = { provas: S.exams.length, trabalhos: S.tasks.length, aulasSemanais: Object.keys(S.settings.classes || {}).reduce(function (t, k) { return t + ((S.settings.classes[k] || []).length); }, 0), compromissos: (S.events || []).length };
    if (!r.total && !cont.provas && !cont.trabalhos) return Promise.resolve(null);
    var id = "sem-" + r.fim + "-" + Math.random().toString(36).slice(2, 6);
    return S.db.doc("retros/" + id).set({ id: id, nome: r.nome, ini: r.ini, fim: r.fim, criadoEm: Date.now(), resultado: r, contagens: cont }).then(function () { ULTIMO = null; return id; });
  }

  // ---------- texto (.md) e cartão (PNG) ----------
  function md(r) {
    var L = ["# Retrospectiva " + r.nome, "", "Período: " + dm(r.ini) + " a " + dm(r.fim) + " (" + r.ini.slice(0, 4) + ").", "", r.mensagem, ""];
    if (r.total) {
      L.push("## Em números", "", "- Tempo estudado: " + hm(r.total) + (r.manual ? " (" + hm(r.cronometro) + " no cronômetro e " + hm(r.manual) + " lançados à mão)" : ""), "- Dias estudados: " + r.dias);
      if (r.revisoes.feitas) L.push("- Revisões feitas: " + r.revisoes.feitas + " (" + r.revisoes.emDia + " no dia previsto ou antes)");
      if (r.topicos.vistos) L.push("- Tópicos da ementa vistos: " + r.topicos.vistos + " de " + r.topicos.total);
      if (r.trabalhos.entregues) L.push("- Trabalhos entregues: " + r.trabalhos.entregues);
      if (r.provas) L.push("- Provas feitas: " + r.provas);
      L.push("");
    }
    if (r.superacoes.length) { L.push("## Superações", ""); r.superacoes.forEach(function (s) { L.push("- **" + s.titulo + "**" + (s.detalhe ? ": " + s.detalhe : "")); }); L.push(""); }
    if (r.materias.length) {
      L.push("## Por matéria", "", "| Matéria | Horas | Tópicos vistos | Revisões feitas | Nota parcial |", "|---|---|---|---|---|");
      r.materias.forEach(function (m) { L.push("| " + m.nome + " | " + hm(m.min) + " | " + m.topVistos + " de " + m.topTotal + " | " + m.revFeitas + " | " + (m.nota != null ? n1(m.nota) : "-") + " |"); });
      L.push("");
    }
    if (r.semanas.some(function (x) { return x.min > 0; })) { L.push("## Horas por semana", ""); r.semanas.forEach(function (x) { L.push("- Semana de " + dm(x.ws) + ": " + hm(x.min)); }); L.push(""); }
    return L.join("\n");
  }
  function baixar(nome, dados) { return window.claude.use("downloads").then(function (dl) { return dl.save({ filename: nome, data: dados }); }); }
  function quebra(ctx, texto, x, y, larg, alt) {
    var pal = String(texto).split(" "), lin = "", n = 0;
    pal.forEach(function (p) { var t = lin ? lin + " " + p : p; if (ctx.measureText(t).width > larg && lin) { ctx.fillText(lin, x, y + n * alt); n++; lin = p; } else lin = t; });
    if (lin) { ctx.fillText(lin, x, y + n * alt); n++; }
    return n;
  }
  function cartao(r, comNomes) {
    var c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
    var g = c.getContext("2d"), F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
    g.fillStyle = "#1B2430"; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = "#D99A00"; g.fillRect(80, 90, 90, 8);
    g.fillStyle = "#F4F1E4"; g.font = "600 40px " + F; g.fillText("Meu semestre " + r.nome, 80, 160);
    g.font = "700 190px " + F; g.fillStyle = "#D99A00"; g.fillText(hm(r.total), 80, 380);
    g.font = "400 44px " + F; g.fillStyle = "#F4F1E4"; g.fillText("de estudo, " + dm(r.ini) + " a " + dm(r.fim), 80, 450);
    var tiles = [[r.dias, "dias estudados"], [r.revisoes.feitas, "revisões feitas"], [r.topicos.vistos, "tópicos vistos"], [r.trabalhos.entregues, "trabalhos entregues"]].filter(function (t) { return t[0] > 0; }).slice(0, 3);
    tiles.forEach(function (t, i) { var x = 80 + i * 320; g.font = "700 84px " + F; g.fillStyle = "#F4F1E4"; g.fillText(String(t[0]), x, 600); g.font = "400 30px " + F; g.fillStyle = "#B8C0CC"; g.fillText(t[1], x, 645); });
    var y = 740; g.font = "600 34px " + F;
    r.superacoes.slice(0, 3).forEach(function (s) { g.fillStyle = "#D99A00"; g.fillText("★", 80, y); g.fillStyle = "#F4F1E4"; y += quebra(g, s.titulo, 135, y, 860, 44) * 44 + 24; });
    if (comNomes && r.materias.length) {
      y += 10; g.font = "400 32px " + F; g.fillStyle = "#B8C0CC";
      r.materias.slice(0, 5).forEach(function (m) { g.fillText(m.nome.slice(0, 34) + ": " + hm(m.min), 80, y); y += 46; });
    }
    g.font = "600 36px " + F; g.fillStyle = "#D99A00"; g.fillText("Cycle", 80, 1270);
    return new Promise(function (ok) { c.toBlob(ok, "image/png"); });
  }

  // ---------- tela ----------
  var modal = null, ctx = null, teclaEsc = null;
  function monta() {
    if (modal) return;
    modal = document.createElement("div"); modal.className = "qz-back rt-back"; modal.id = "rtBack"; modal.hidden = true;
    modal.innerHTML = '<div class="qz rt-box" role="dialog" aria-modal="true" aria-labelledby="rtTitulo" id="rtBox" tabindex="-1"></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) fecha(); });
    modal.addEventListener("click", clique);
    modal.addEventListener("change", muda);
  }
  function fecha() {
    if (!modal) return; modal.hidden = true;
    if (teclaEsc) { document.removeEventListener("keydown", teclaEsc, true); teclaEsc = null; }
  }
  function tile(v, l) { return '<div class="rt-tile"><b>' + esc(v) + "</b><span>" + esc(l) + "</span></div>"; }
  function grafico(r) {
    var mostra = r.metaTot > 0 && r.semanas.some(function (x) { return x.min >= r.metaTot; });   // a linha da meta só aparece se alguma semana chegou nela
    var max = Math.max(60, mostra ? r.metaTot : 0, Math.max.apply(null, r.semanas.map(function (x) { return x.min; })));
    return '<div class="rt-graf" role="img" aria-label="Horas estudadas por semana">' + (mostra ? '<i class="rt-meta" style="bottom:' + (r.metaTot / max * 100) + '%" title="Soma das metas semanais: ' + hm(r.metaTot) + '"></i>' : "") +
      r.semanas.map(function (x) { return '<div class="rt-col" title="Semana de ' + dm(x.ws) + ": " + hm(x.min) + '"><i class="' + (mostra && x.min >= r.metaTot ? "hit" : "") + '" style="height:' + Math.max(2, x.min / max * 100) + '%"></i></div>'; }).join("") + "</div>" +
      '<div class="rt-eixo"><span>' + dm(r.semanas[0].ws) + "</span><span>" + dm(r.semanas[r.semanas.length - 1].ws) + "</span></div>";
  }
  function corpo(r) {
    var h = '<p class="rt-msg">' + esc(r.mensagem) + "</p>";
    if (!r.total) return h;
    var t = [tile(hm(r.total), "de estudo"), tile(r.dias, "dias estudados"), tile(hm(r.mediaSemana), "por semana estudada")];
    if (r.revisoes.feitas) t.push(tile(r.revisoes.feitas, "revisões feitas"));
    if (r.topicos.vistos) t.push(tile(r.topicos.vistos + " de " + r.topicos.total, "tópicos vistos"));
    if (r.trabalhos.entregues) t.push(tile(r.trabalhos.entregues, "trabalhos entregues"));
    if (r.provas) t.push(tile(r.provas, r.provas === 1 ? "prova feita" : "provas feitas"));
    h += '<div class="rt-tiles">' + t.join("") + "</div>";
    if (r.manual) h += '<p class="plan" style="margin:0">Inclui ' + hm(r.manual) + " lançados à mão; " + hm(r.cronometro) + " vieram do cronômetro.</p>";
    if (r.superacoes.length) h += '<h3 class="rt-h">Superações</h3><ul class="rt-sup">' + r.superacoes.map(function (s) { return '<li data-sup="' + esc(s.id) + '"><b>★ ' + esc(s.titulo) + "</b>" + (s.detalhe ? "<span>" + esc(s.detalhe) + "</span>" : "") + "</li>"; }).join("") + "</ul>";
    h += '<h3 class="rt-h">Ao longo do período</h3>' + grafico(r);
    var hab = []; if (r.sequencia && r.sequencia.n >= 2) hab.push("Maior sequência: <b>" + r.sequencia.n + " dias</b> seguidos (" + dm(r.sequencia.de) + " a " + dm(r.sequencia.ate) + ")");
    if (r.diaSemana) hab.push("Dia em que mais estudou: <b>" + esc(r.diaSemana.nome) + "</b>");
    if (r.periodoDia) hab.push("Período preferido: <b>" + esc(r.periodoDia.nome) + "</b>");
    if (hab.length) h += '<h3 class="rt-h">Hábitos</h3><ul class="rt-hab"><li>' + hab.join("</li><li>") + "</li></ul>";
    if (r.materias.length) h += '<h3 class="rt-h">Por matéria</h3><div class="rt-mats">' + r.materias.map(function (m) {
      var b = []; if (m.topTotal) b.push(m.topVistos + " de " + m.topTotal + " tópicos"); if (m.revFeitas) b.push(m.revFeitas + " revisões"); if (m.nota != null) b.push("nota parcial " + n1(m.nota)); if (m.metaSem && m.metaSem.bateu) b.push("meta batida em " + m.metaSem.bateu + (m.metaSem.bateu === 1 ? " semana" : " semanas"));
      return '<div class="rt-mat"><i style="background:' + esc(m.cor) + '"></i><div><b>' + esc(m.nome) + '</b><span class="num">' + hm(m.min) + "</span><small>" + esc(b.join(" · ")) + "</small></div></div>";
    }).join("") + "</div>";
    return h;
  }
  function tela() {
    var r = ctx.r, ed = !ctx.arquivado;
    $("rtBox").innerHTML = '<div class="qz-head"><div><div class="eyebrow">' + (ctx.arquivado ? "Semestre arquivado" : "Retrospectiva") + '</div><h2 id="rtTitulo">' + esc(r.nome) + '</h2></div><button class="btn small ghost" data-rt="fechar" type="button" aria-label="Fechar">✕</button></div>' +
      (ed ? '<div class="rt-per"><label class="field"><span>Nome</span><input id="rtNome" maxlength="30" value="' + esc(r.nome) + '"></label><label class="field"><span>De</span><input type="date" id="rtIni" value="' + r.ini + '"></label><label class="field"><span>Até</span><input type="date" id="rtFim" value="' + r.fim + '"></label></div>'
        : '<p class="plan" style="margin:0">Período: ' + dm(r.ini) + " a " + dm(r.fim) + " de " + r.ini.slice(0, 4) + ". Guardado ao terminar o semestre.</p>") +
      '<div id="rtCorpo">' + corpo(r) + "</div>" +
      '<div class="rt-acoes"><button class="btn" data-rt="md" type="button">Baixar resumo (.md)</button><button class="btn" data-rt="png" type="button">Salvar como imagem (PNG)</button><label class="check"><input type="checkbox" id="rtNomes"> Mostrar nomes das matérias no cartão</label></div>' +
      '<div class="cw-rodape"><button class="btn primary" data-rt="fechar" type="button">Fechar</button></div>';
  }
  function recalcula() {
    var ini = $("rtIni").value, fim = $("rtFim").value, nome = ($("rtNome").value || "").trim() || nomePadrao(fim || ctx.hoje);
    if (!ini || !fim || ini > fim) { $("rtCorpo").innerHTML = '<p class="rt-msg" role="alert">Escolha um período em que a data inicial vem antes da final.</p>'; return; }
    ULTIMO = { ini: ini, fim: fim, nome: nome }; ctx.r = calcular(ctx.d, ULTIMO);
    $("rtCorpo").innerHTML = corpo(ctx.r); $("rtTitulo").textContent = nome;
  }
  function muda(e) { if (e.target.id === "rtIni" || e.target.id === "rtFim" || e.target.id === "rtNome") recalcula(); }
  function clique(e) {
    var b = e.target.closest("[data-rt]"); if (!b) return; var k = b.dataset.rt;
    if (k === "fechar") fecha();
    else if (k === "md") baixar("cycle-retrospectiva-" + ctx.r.nome.replace(/[^\w.-]+/g, "-") + ".md", md(ctx.r)).then(function () { ctx.api.toast("Resumo baixado."); });
    else if (k === "png") cartao(ctx.r, $("rtNomes").checked).then(function (blob) { return baixar("cycle-retrospectiva-" + ctx.r.nome.replace(/[^\w.-]+/g, "-") + ".png", blob); }).then(function () { ctx.api.toast("Imagem salva."); });
  }
  // abrir(api): retrospectiva do semestre em andamento; abrir(api, { arquivo }) reabre um semestre arquivado
  function abrir(api, op) {
    monta(); var d = ler(), hoje = api.today();
    if (op && op.arquivo) ctx = { api: api, arquivado: true, r: op.arquivo.resultado, hoje: hoje };
    else { var per = ULTIMO || periodoPadrao(d, hoje); ctx = { api: api, d: d, hoje: hoje, r: calcular(d, per) }; }
    tela(); modal.hidden = false;
    if (!teclaEsc) { teclaEsc = function (e) { if (e.key === "Escape" && !modal.hidden) { e.stopPropagation(); fecha(); } }; document.addEventListener("keydown", teclaEsc, true); }
    $("rtBox").focus({ preventScroll: true }); $("rtBox").scrollTop = 0;
  }

  window.__cycleRetro = { abrir: abrir, arquivar: arquivar, calcular: calcular, md: md, periodoPadrao: periodoPadrao, ler: ler, _t: { cartao: cartao, nomePadrao: nomePadrao } };
})();
