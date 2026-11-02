/* Reorganizar revisões atrasadas: espalha o que está atrasado pelos dias que sobram antes de cada prova.
   A conta (plano) é pura e testável; a janela de confirmação mostra tudo antes de gravar. */
(function () {
  "use strict";
  var DIAS_C = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var LIMITE_DIA = 3;       // até 3 revisões por dia é a carga confortável; passando disso só se não houver outro jeito
  var SEM_PROVA_DIAS = 6;   // matéria sem prova à vista: entra nos próximos 7 dias, depois das que têm prova

  var soma = function (d, n) { var p = d.split("-"), x = new Date(+p[0], +p[1] - 1, +p[2] + n); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };

  // entrada: { hoje, revs:[{key,cid,i,sid,title,stage,due,done,skipped}], provas:[{sid,date,kind}] }
  // saída:   { moves:[{key,cid,i,sid,title,stage,from,to}], grupos:[{sid,prova,limite,total,movidas}], atrasadas }
  function plano(e) {
    var hoje = e.hoje, load = {};
    var abertas = e.revs.filter(function (r) { return !r.done && !r.skipped; });
    var atrasadas = abertas.filter(function (r) { return r.due < hoje; });
    abertas.forEach(function (r) { if (r.due >= hoje) load[r.due] = (load[r.due] || 0) + 1; });   // o que já estava marcado pesa nos dias
    var proxProva = function (sid) {
      var ps = e.provas.filter(function (p) { return p.sid === sid && p.date >= hoje; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      return ps[0] || null;
    };
    var prazo = function (sid) { var p = proxProva(sid); return p ? { fim: p.date === hoje ? hoje : soma(p.date, -1), prova: p, ord: p.date } : { fim: soma(hoje, SEM_PROVA_DIAS), prova: null, ord: "9999-99-99" }; };
    var itens = atrasadas.map(function (r) { var z = prazo(r.sid); return { r: r, fim: z.fim, prova: z.prova, ord: z.ord }; });
    itens.sort(function (a, b) { return a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : a.r.sid < b.r.sid ? -1 : a.r.sid > b.r.sid ? 1 : a.r.cid < b.r.cid ? -1 : a.r.cid > b.r.cid ? 1 : a.r.stage - b.r.stage; });
    var ultimo = {}, moves = [], gmap = {}, grupos = [];
    itens.forEach(function (it) {
      var r = it.r, ini = hoje;
      if (ultimo[r.cid]) ini = ultimo[r.cid] < it.fim ? soma(ultimo[r.cid], 1) : ultimo[r.cid];   // as etapas de um conteúdo seguem em ordem
      if (ini > it.fim) ini = it.fim;
      var melhor = null, melhorN = 1e9, livre = null;   // atrasada é para fazer logo: o primeiro dia com folga; se todos estiverem cheios, o menos cheio
      for (var d = ini; d <= it.fim; d = soma(d, 1)) { var n = load[d] || 0; if (livre === null && n < LIMITE_DIA) livre = d; if (n < melhorN) { melhorN = n; melhor = d; } }
      if (livre !== null) melhor = livre;
      if (!melhor) melhor = it.fim;
      load[melhor] = (load[melhor] || 0) + 1; ultimo[r.cid] = melhor;
      var g = gmap[r.sid]; if (!g) { g = gmap[r.sid] = { sid: r.sid, prova: it.prova, limite: it.fim, total: 0, movidas: 0, dias: {} }; grupos.push(g); }
      g.total++; g.dias[melhor] = (g.dias[melhor] || 0) + 1;
      if (melhor !== r.due) { g.movidas++; moves.push({ key: r.key, cid: r.cid, i: r.i, sid: r.sid, title: r.title, stage: r.stage, from: r.due, to: melhor }); }
    });
    return { moves: moves, grupos: grupos, atrasadas: atrasadas.length };
  }

  // ---------- janela ----------
  var modal = null, tecla = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var br = function (d) { var p = d.split("-"); return p[2] + "/" + p[1]; };
  function fecha() { if (!modal) return; modal.hidden = true; if (tecla) { document.removeEventListener("keydown", tecla); tecla = null; } }
  function abre() {
    if (!modal) {
      modal = document.createElement("div"); modal.className = "qz-back"; modal.hidden = true;
      modal.innerHTML = '<div class="qz" role="dialog" aria-modal="true" aria-labelledby="rgTitle" id="rgBox"></div>';
      document.body.appendChild(modal);
      modal.addEventListener("click", function (e) { if (e.target === modal) fecha(); });
    }
    modal.hidden = false;
    if (!tecla) { tecla = function (e) { if (e.key === "Escape") fecha(); }; document.addEventListener("keydown", tecla); }
    return document.getElementById("rgBox");
  }
  var head = function (t) { return '<div class="qz-head"><div><div class="eyebrow">Revisões atrasadas</div><h2 id="rgTitle">' + t + '</h2></div><button class="btn small ghost" data-rg="fechar" type="button" aria-label="Fechar">✕</button></div>'; };

  function abrir(api) {
    var hoje = api.today();
    var res = plano({ hoje: hoje, provas: api.S.exams.map(function (x) { return { sid: x.subjectId, date: x.date, kind: x.kind }; }), revs: api.revisoes() });
    var box = abre(), mv = res.moves;
    if (!res.atrasadas) { box.innerHTML = head("Nada atrasado") + '<div class="cw-form"><p style="margin:0">Você não tem revisões atrasadas. 👏</p><button class="btn" data-rg="fechar" type="button">Fechar</button></div>'; box.onclick = function (e) { if (e.target.closest("[data-rg]")) fecha(); }; return; }
    var porSid = {}; mv.forEach(function (m) { (porSid[m.sid] = porSid[m.sid] || []).push(m); });
    var corpo = res.grupos.map(function (g) {
      var s = api.subj(g.sid), dias = Object.keys(g.dias).sort(), lista = (porSid[g.sid] || []).slice().sort(function (a, b) { return a.to < b.to ? -1 : a.to > b.to ? 1 : 0; });
      var quando = g.prova ? esc(g.prova.kind || "Prova") + " em " + esc(br(g.prova.date)) + (g.prova.date === hoje ? " (hoje)" : "") : "sem prova marcada";
      return '<div class="rg-g"><div class="rg-gh"><i class="dot" style="background:' + esc(s.color) + '"></i><b>' + esc(s.name) + '</b><span class="plan">' + quando + "</span></div>" +
        '<p style="margin:2px 0 4px">' + g.total + (g.total === 1 ? " revisão atrasada" : " revisões atrasadas") + (dias.length ? ", distribuídas de " + esc(br(dias[0])) + " a " + esc(br(dias[dias.length - 1])) + (g.prova ? ", antes da prova" : "") : "") + ".</p>" +
        (lista.length ? '<details><summary>Ver cada uma</summary><ul class="rg-l">' + lista.map(function (m) { return "<li><b>R" + m.stage + "</b> " + esc(m.title) + ' <span class="plan">' + esc(br(m.from)) + " → " + DIAS_C[api.parseYmd(m.to).getDay()] + " " + esc(br(m.to)) + "</span></li>"; }).join("") + "</ul></details>" : '<p class="plan" style="margin:0">Já estão em boas datas.</p>') + "</div>";
    }).join("");
    box.innerHTML = head("Reorganizar antes das provas") + '<div class="cw-form"><p class="plan" style="margin:0">Cada revisão atrasada vai para um dia entre hoje e a véspera da prova da matéria, no primeiro dia com folga (até 3 revisões por dia, contando o que você já tem marcado). As etapas de um mesmo conteúdo seguem em ordem. Nada é gravado antes de você confirmar.</p>' + corpo +
      (mv.length ? '<button class="btn primary" data-rg="ok" type="button">Reorganizar ' + mv.length + (mv.length === 1 ? " revisão" : " revisões") + "</button>" : "") + '<button class="btn" data-rg="fechar" type="button">' + (mv.length ? "Cancelar" : "Fechar") + "</button></div>";
    var bt = box.querySelector('[data-rg="ok"]'); if (bt) bt.focus();
    box.onclick = function (e) {
      var b = e.target.closest("[data-rg]"); if (!b) return;
      if (b.dataset.rg === "fechar") return fecha();
      if (b.dataset.rg === "ok") { b.disabled = true; api.aplicar(mv).then(function () { fecha(); }, function (err) { api.toast("Não consegui reorganizar: " + ((err && err.message) || err)); b.disabled = false; }); }
    };
  }

  var api = { plano: plano, abrir: abrir };
  if (typeof window !== "undefined") window.__cycleReorg = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
