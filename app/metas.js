/* Cycle: contas da aba Metas (estudo liquido por semana e por materia). Logica pura, sem acesso ao DOM. */
(function () {
  "use strict";
  var LIM_LONGA = 240;   // minutos: acima disso a sessao e gravada e o app avisa

  function parse(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function soma(arr) { return arr.reduce(function (a, z) { return a + (z.minutes || 0); }, 0); }

  // sessions: [{subjectId, date, minutes, kind}]; subjects: [{id, name, metaHoras}]; ws: segunda da semana (yyyy-mm-dd)
  // rodando: {sid, min} (tempo do cronometro ainda aberto, so conta na semana de hoje) ou null
  function semana(sessions, subjects, ws, rodando) {
    var we = addDays(ws, 6), doSem = sessions.filter(function (z) { return z.date >= ws && z.date <= we; });
    var extra = rodando && rodando.min > 0 ? rodando : null;
    var dias = [];
    for (var k = 0; k < 7; k++) {
      var d = addDays(ws, k);
      dias.push({ d: d, min: soma(doSem.filter(function (z) { return z.date === d; })) + (extra && extra.dia === d ? extra.min : 0) });
    }
    var linhas = subjects.map(function (s) {
      var mine = doSem.filter(function (z) { return z.subjectId === s.id; });
      var man = soma(mine.filter(function (z) { return z.kind === "manual"; }));
      var min = soma(mine) + (extra && extra.sid === s.id ? extra.min : 0);
      var meta = s.metaHoras > 0 ? s.metaHoras * 60 : 0;
      var sem8 = [];
      for (var j = 7; j >= 0; j--) {
        var a = addDays(ws, -7 * j), b = addDays(a, 6);
        sem8.push({ a: a, min: soma(sessions.filter(function (z) { return z.subjectId === s.id && z.date >= a && z.date <= b; })) + (j === 0 && extra && extra.sid === s.id ? extra.min : 0) });
      }
      return { sid: s.id, nome: s.name, min: min, manual: man, meta: meta, pct: meta ? Math.min(100, min / meta * 100) : 0, falta: meta ? Math.max(0, meta - min) : 0, bateu: !!meta && min >= meta, sem8: sem8 };
    });
    linhas.sort(function (p, q) { return q.min - p.min || String(p.nome).localeCompare(String(q.nome), "pt-BR"); });
    var total = soma(doSem) + (extra ? extra.min : 0), manual = soma(doSem.filter(function (z) { return z.kind === "manual"; }));
    var comMeta = linhas.filter(function (l) { return l.meta > 0; });
    return { ws: ws, we: we, total: total, manual: manual, cronometro: total - manual, dias: dias, linhas: linhas, comMeta: comMeta.length, batidas: comMeta.filter(function (l) { return l.bateu; }).length };
  }

  // sessoes longas ainda nao conferidas pela pessoa
  function longas(sessions) {
    return sessions.filter(function (z) { return z.longa && !z.conferida && (z.minutes || 0) > LIM_LONGA; })
      .sort(function (p, q) { return String(q.date).localeCompare(String(p.date)); });
  }

  window.__cycleMetas = { semana: semana, longas: longas, LIM_LONGA: LIM_LONGA, addDays: addDays };
})();
