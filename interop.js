/* Cycle: importar e exportar agenda. Spec: SPEC-agenda-interop.md.
   Importar: Google (.zip), Apple/Outlook/outros (.ics) viram itens de verdade do cronograma (aula semanal, prova, trabalho, compromisso),
   editáveis e sincronizados pela conta. Reimportar só acrescenta o que é novo (registro em settings.importKeys).
   Exportar: um só .ics com TODOS os itens marcados; a pessoa desmarca um a um o que não quer levar.
   O cycle.html passa as ferramentas dele em `api`. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var DIAS_C = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MAX_EVENTOS = 200, MAX_CHAVES = 3000;

  // ---------- janelas (modal) ----------
  var abertos = [], teclaEsc = null;
  function modal(id, rotulo) {
    var m = $(id + "Back");
    if (!m) {
      m = document.createElement("div"); m.className = "qz-back in-back"; m.id = id + "Back"; m.hidden = true;
      m.innerHTML = '<div class="qz in-box" role="dialog" aria-modal="true" aria-label="' + esc(rotulo) + '" id="' + id + 'Box" tabindex="-1"></div>';
      document.body.appendChild(m);
      m.addEventListener("click", function (e) { if (e.target === m) fecha(id); });
    }
    return m;
  }
  function abre(id, rotulo) {
    var m = modal(id, rotulo); m.hidden = false; if (abertos.indexOf(id) < 0) abertos.push(id);
    if (!teclaEsc) { teclaEsc = function (e) { if (e.key === "Escape" && abertos.length) { e.stopPropagation(); fecha(abertos[abertos.length - 1]); } }; document.addEventListener("keydown", teclaEsc, true); }
    $(id + "Box").focus({ preventScroll: true }); $(id + "Box").scrollTop = 0;
  }
  function fecha(id) {
    var m = $(id + "Back"); if (m) m.hidden = true;
    abertos = abertos.filter(function (x) { return x !== id; });
    if (!abertos.length && teclaEsc) { document.removeEventListener("keydown", teclaEsc, true); teclaEsc = null; }
  }
  function cab(rotulo, titulo, id) {
    return '<div class="qz-head"><div><div class="eyebrow">' + esc(rotulo) + "</div><h2>" + esc(titulo) + '</h2></div><button class="btn small ghost" data-in="fechar" data-m="' + id + '" type="button" aria-label="Fechar">✕</button></div>';
  }

  // =====================================================================================
  // EXPORTAR
  // =====================================================================================
  var GRUPOS = [["aulas", "Aulas semanais"], ["provas", "Provas"], ["trabalhos", "Trabalhos"], ["compromissos", "Compromissos e aulas avulsas"], ["revisoes", "Revisões"]];
  var EX = null;

  function ultimaData(api) {
    var S = api.S, m = api.today();
    S.exams.forEach(function (x) { if (x.date > m) m = x.date; });
    S.tasks.forEach(function (x) { if (x.due > m) m = x.due; });
    S.events.forEach(function (e) { var d = (e.repeat && e.repeat.until) || e.date; if (d > m) m = d; });
    return m;
  }
  function aulasAte(api) { var min = api.addDays(api.today(), 28), l = ultimaData(api); return l > min ? l : min; }

  function itensExport(api) {
    var S = api.S, t = api.today(), out = [];
    S.subjects.forEach(function (s) {
      api.classSlots(s.id).forEach(function (sl) {
        out.push({ key: "aula|" + s.id + "|" + sl[0] + "|" + sl[1], grupo: "aulas", titulo: "Aula · " + s.name, quando: DIAS_C[sl[0]] + " " + sl[1] + ", toda semana", tipo: "aula", s: s, wd: sl[0], tm: sl[1] });
      });
    });
    S.exams.forEach(function (x) {
      if (!x.date || x.date < t) return;
      var s = api.subj(x.subjectId);
      out.push({ key: "prova|" + x.id, grupo: "provas", titulo: (x.kind || "Prova") + " · " + s.name, quando: api.fmtShort(x.date) + (x.time ? " " + x.time : ""), tipo: "prova", x: x });
    });
    S.tasks.forEach(function (k) {
      if (k.status === "feita" || !k.due || k.due < t) return;
      out.push({ key: "trabalho|" + k.id, grupo: "trabalhos", titulo: "Entrega: " + k.title + " · " + api.subj(k.subjectId).name, quando: "prazo " + api.fmtShort(k.due), tipo: "trabalho", k: k });
    });
    S.events.forEach(function (e) {
      if (!e.date) return;
      var fim = (e.repeat && e.repeat.until) || e.date; if (fim < t) return;
      var s = e.sid ? api.subj(e.sid) : null, nome = e.type === "aula" ? "Aula" + (s ? " · " + s.name : "") + (e.title ? " · " + e.title : "") : (e.title || "(sem título)");
      out.push({ key: "evento|" + e.id, grupo: "compromissos", titulo: nome, quando: api.fmtShort(e.date) + (e.start ? " " + e.start : "") + (e.repeat ? ", toda semana até " + api.fmtShort(e.repeat.until) : ""), tipo: "evento", e: e, nome: nome });
    });
    api.allReviews().forEach(function (o) {
      var r = o.r; if (r.done || r.skipped || !r.due || r.due < t) return;
      out.push({ key: "revisao|" + o.c.id + "|" + o.i, grupo: "revisoes", titulo: "R" + (o.i + 1) + ": " + o.c.title + " · " + api.subj(o.c.subjectId).name, quando: api.fmtShort(r.due), tipo: "revisao", c: o.c, i: o.i, r: r });
    });
    return out;
  }

  // texto do .ics a partir dos itens escolhidos; ate = última data das aulas semanais
  function montaICS(api, itens, ate) {
    var TZ = api.TZ, t = api.today(), nowZ = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""), out = [];
    var d8 = function (s) { return s.replace(/-/g, ""); }, hm = function (s) { return s.replace(":", "") + "00"; };
    var tx = function (s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); };
    var enc = new TextEncoder();
    var fold = function (l) { var o = "", cur = "", chars = Array.from(l); chars.forEach(function (ch) { if (enc.encode(cur + ch).length > (o ? 74 : 75)) { o += (o ? "\r\n " : "") + cur; cur = ch; } else cur += ch; }); return o + (o ? "\r\n " : "") + cur; };
    var ev = function (uid, summary, lines, desc) { out.push("BEGIN:VEVENT", "UID:" + uid + "@cycle", "DTSTAMP:" + nowZ, "SUMMARY:" + tx(summary)); lines.forEach(function (l) { out.push(l); }); if (desc) out.push("DESCRIPTION:" + tx(desc)); out.push("END:VEVENT"); };
    var allDay = function (day) { return ["DTSTART;VALUE=DATE:" + d8(day), "DTEND;VALUE=DATE:" + d8(api.addDays(day, 1)), "TRANSP:TRANSPARENT"]; };
    var timed = function (day, ini, fim) { return ["DTSTART;TZID=" + TZ + ":" + d8(day) + "T" + hm(ini), "DTEND;TZID=" + TZ + ":" + d8(day) + "T" + hm(fim)]; };
    var somaMin = function (hhmm, min) { var p = hhmm.split(":").map(Number), e = p[0] * 60 + p[1] + min; return e >= 1440 ? "23:59" : pad(Math.floor(e / 60)) + ":" + pad(e % 60); };
    var untilUtc = function (day) { return new Date(api.parseYmd(day).getTime() + (23 * 60 + 59) * 60000).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); };
    var n = { aulas: 0, provas: 0, trabalhos: 0, compromissos: 0, revisoes: 0 };
    itens.forEach(function (it) {
      if (it.tipo === "prova") { var x = it.x; ev("prova-" + x.id, it.titulo, x.time ? timed(x.date, x.time, somaMin(x.time, 120)) : allDay(x.date)); n.provas++; }
      else if (it.tipo === "trabalho") { ev("trabalho-" + it.k.id, it.titulo, allDay(it.k.due)); n.trabalhos++; }
      else if (it.tipo === "revisao") { ev("revisao-" + it.c.id + "-" + it.i, it.titulo, allDay(it.r.due)); n.revisoes++; }
      else if (it.tipo === "aula") {
        var day = t; for (var k = 0; k < 7 && api.parseYmd(day).getDay() !== it.wd; k++) day = api.addDays(day, 1);
        if (day > ate) return;
        var ex = [], pular = (it.s.skipLectures || []).concat(api.S.exams.filter(function (x2) { return x2.subjectId === it.s.id; }).map(function (x2) { return x2.date; }));
        pular.forEach(function (d) { if (d >= day && d <= ate && api.parseYmd(d).getDay() === it.wd && ex.indexOf(d) < 0) ex.push(d); });
        ex.sort();
        var lines = timed(day, it.tm, somaMin(it.tm, 100)); lines.push("RRULE:FREQ=WEEKLY;UNTIL=" + untilUtc(ate));
        if (ex.length) lines.push("EXDATE;TZID=" + TZ + ":" + ex.map(function (d) { return d8(d) + "T" + hm(it.tm); }).join(","));
        ev("aula-" + it.s.id + "-" + it.wd + "-" + it.tm, "Aula: " + it.s.name, lines); n.aulas++;
      } else if (it.tipo === "evento") {
        var e = it.e, ln;
        if (e.allDay || !e.start) { ln = allDay(e.date); if (e.repeat && e.repeat.until) ln.push("RRULE:FREQ=WEEKLY;UNTIL=" + d8(e.repeat.until)); }
        else { ln = timed(e.date, e.start, e.end || somaMin(e.start, 60)); if (e.repeat && e.repeat.until) ln.push("RRULE:FREQ=WEEKLY;UNTIL=" + untilUtc(e.repeat.until)); }
        if (e.loc) ln.push("LOCATION:" + tx(e.loc));
        ev("evento-" + e.id, it.nome, ln, e.notes); n.compromissos++;
      }
    });
    var head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cycle//Agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Cycle", "X-WR-TIMEZONE:" + TZ,
      "BEGIN:VTIMEZONE", "TZID:" + TZ, "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0300", "TZOFFSETTO:-0300", "TZNAME:-03", "END:STANDARD", "END:VTIMEZONE"];
    return { n: n, text: head.concat(out, ["END:VCALENDAR"]).map(fold).join("\r\n") + "\r\n" };
  }

  function exTela() {
    var h = cab("Agenda", "Exportar para o seu calendário", "ex");
    if (!EX.itens.length) return h + '<div class="in-form"><p style="margin:0">Não há nada para levar: sem aulas, provas, trabalhos, compromissos ou revisões pela frente.</p><div class="cw-rodape"><button class="btn primary" data-in="fechar" data-m="ex" type="button">Fechar</button></div></div>';
    h += '<div class="in-form"><p class="plan" style="margin:0">Tudo vem marcado. <b>Desmarque o que você não quer levar.</b> O arquivo .ics abre no Google Agenda, no Apple Calendário e no Outlook.</p>' +
      '<label class="field"><span>As aulas semanais repetem até</span><input type="date" id="exAte" value="' + EX.ate + '"></label><div class="ex-grupos">';
    GRUPOS.forEach(function (g) {
      var its = EX.itens.map(function (it, i) { return [it, i]; }).filter(function (p) { return p[0].grupo === g[0]; });
      if (!its.length) return;
      h += '<details class="ex-g"' + (g[0] === "revisoes" ? "" : " open") + '><summary class="ex-sum"><input type="checkbox" data-exg="' + g[0] + '" checked aria-label="Marcar ou desmarcar todos: ' + esc(g[1]) + '"> <b>' + esc(g[1]) + '</b> <span class="plan" data-exc="' + g[0] + '"></span></summary><div class="ex-its">' +
        its.map(function (p) { return '<label class="check ex-it"><input type="checkbox" data-exi="' + p[1] + '" checked> <span>' + esc(p[0].titulo) + '<small>' + esc(p[0].quando) + "</small></span></label>"; }).join("") + "</div></details>";
    });
    h += '</div><div class="cw-erro" role="alert" id="exErro"></div><div class="cw-rodape"><button class="btn" data-in="fechar" data-m="ex" type="button">Cancelar</button><button class="btn primary" id="exOk" data-in="exportar" type="button">Baixar</button></div></div>';
    return h;
  }
  function exConta() {
    var box = $("exBox"), tot = 0;
    GRUPOS.forEach(function (g) {
      var all = box.querySelectorAll('[data-exi]'), mine = [].filter.call(all, function (c) { return EX.itens[+c.dataset.exi].grupo === g[0]; });
      if (!mine.length) return;
      var on = mine.filter(function (c) { return c.checked; }).length, gc = box.querySelector('[data-exg="' + g[0] + '"]');
      gc.checked = on === mine.length; gc.indeterminate = on > 0 && on < mine.length;
      var sp = box.querySelector('[data-exc="' + g[0] + '"]'); if (sp) sp.textContent = on + " de " + mine.length;
      tot += on;
    });
    var b = $("exOk"); if (b) { b.textContent = tot ? "Baixar (" + tot + (tot === 1 ? " item)" : " itens)") : "Marque ao menos um item"; b.disabled = !tot; }
    EX.total = tot;
  }
  function exportar(api) {
    EX = { api: api, itens: itensExport(api), ate: aulasAte(api), total: 0 };
    abre("ex", "Exportar agenda"); $("exBox").innerHTML = exTela(); if (EX.itens.length) exConta();
    var box = $("exBox");
    box.onclick = function (e) { var b = e.target.closest("[data-in]"); if (!b) return; if (b.dataset.in === "fechar") fecha(b.dataset.m); else if (b.dataset.in === "exportar") exBaixa(); };
    box.onchange = function (e) {
      var t = e.target;
      if (t.dataset.exg) box.querySelectorAll("[data-exi]").forEach(function (c) { if (EX.itens[+c.dataset.exi].grupo === t.dataset.exg) c.checked = t.checked; });
      if (t.id === "exAte") { EX.ate = t.value; return; }
      exConta();
    };
  }
  function exBaixa() {
    var api = EX.api, box = $("exBox"), erro = $("exErro");
    var ate = $("exAte").value; if (!ate || ate < api.today()) { erro.textContent = "Escolha uma data de hoje em diante para o fim das aulas."; return; }
    var sel = [].filter.call(box.querySelectorAll("[data-exi]"), function (c) { return c.checked; }).map(function (c) { return EX.itens[+c.dataset.exi]; });
    if (!sel.length) return;
    var r = montaICS(api, sel, ate), total = r.n.aulas + r.n.provas + r.n.trabalhos + r.n.compromissos + r.n.revisoes;
    window.__lastICS = r.text;
    api.saveFile("cycle-agenda-" + api.today() + ".ics", r.text).then(function () {
      api.toast("Agenda pronta: " + total + (total === 1 ? " item" : " itens") + ". Google Agenda: Configurações > Importar e exportar. Apple: abra o arquivo e escolha Adicionar tudo.");
      fecha("ex");
    });
  }

  // =====================================================================================
  // IMPORTAR
  // =====================================================================================
  var W = null;
  var KINDS = [["aula", "Aula"], ["prova", "Prova"], ["trabalho", "Trabalho"], ["compromisso", "Compromisso"], ["ignorar", "Ignorar"]];
  var AG_COLORS = ["#3B82C4", "#D9534F", "#2E9E6B", "#B7791F", "#8E5BD0", "#D1568C", "#14899E", "#E2762B", "#5B6BC0", "#7A9A2E"];
  var mapKind = function (k) { return k === "aula" || k === "prova" || k === "trabalho" ? k : k === "revisao" || k === "ignorar" ? "ignorar" : "compromisso"; };
  var oldKind = function (k) { return k === "compromisso" ? "evento" : k; };

  function achaMateria(api, nome, extra) {
    var n = api.norm(nome); if (n.length < 3) return null;
    var all = api.S.subjects.concat(extra || []);
    return all.find(function (s) { return api.norm(s.name) === n; }) || all.find(function (s) { var m = api.norm(s.name); return m.length >= 5 && n.length >= 5 && (m.indexOf(n) >= 0 || n.indexOf(m) >= 0); }) || null;
  }
  function nomeDoGrupo(g, kind) { var A = window.__cycleAgenda; return A.deriveName(g.title, oldKind(kind)) || (kind === "aula" ? g.title : ""); }
  function sidPadrao(api, g, kind) {
    var nome = nomeDoGrupo(g, kind), s = achaMateria(api, nome);
    if (s) return s.id;
    return (kind === "aula" || kind === "prova" || kind === "trabalho") && nome ? "novo:" + nome : "";
  }
  function grupos() {
    var A = window.__cycleAgenda, evs = [];
    W.fonte.calendars.forEach(function (c) { if (c.sel) evs = evs.concat(c.events); });
    return A.groups(evs, { cls: {}, map: {} }, W.ini, W.fim);
  }
  function linha(api, g) {
    if (!W.rows[g.key]) {
      var k = mapKind(W.cls && W.cls[g.key] || g.kind);
      W.rows[g.key] = { kind: k, sid: (W.map && W.map[g.key]) || sidPadrao(api, g, k) };
    }
    return W.rows[g.key];
  }

  // "Entrega: Relatório 3 · Matéria" -> "Relatório 3"
  function tituloTrabalho(sum, materia) {
    var t = String(sum || "").replace(/^\s*(?:entrega|trabalho|tarefa)\s*[:\-–·]\s*/i, "").trim();
    if (materia) { var i = t.toLowerCase().lastIndexOf(materia.toLowerCase()); if (i > 0 && /[·|\-–:]\s*$/.test(t.slice(0, i))) t = t.slice(0, i).replace(/\s*[·|\-–:]\s*$/, "").trim(); }
    return t || String(sum || "Trabalho");
  }
  function localHM(iso) { var d = new Date(iso); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function localYmd(api, iso) { return api.ymd(new Date(iso)); }

  // plano: o que seria criado, sem gravar nada
  function planejar(api) {
    var A = window.__cycleAgenda, S = api.S, ledger = new Set(S.settings.importKeys || []), P = { materias: [], classes: {}, provas: [], tarefas: [], eventos: [], chaves: [], ja: 0, ign: 0, semMateria: 0, avisos: [] };
    var novas = [], base = function () { return S.subjects.length + novas.length; };
    var garante = function (nome) {
      var s = achaMateria(api, nome, novas); if (s) return s;
      var id = "ag-" + (api.norm(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || api.hash36(nome));
      s = { id: id, name: nome.trim(), color: AG_COLORS[base() % AG_COLORS.length], order: base() };
      novas.push(s); P.materias.push(s); return s;
    };
    var resolve = function (row, g, kind) {
      if (row.sid && row.sid.indexOf("novo:") === 0) return garante(row.sid.slice(5));
      return row.sid ? S.subjects.find(function (s) { return s.id === row.sid; }) || null : null;
    };
    var jaSlot = function (sid, wd, tm) { return api.classSlots(sid).some(function (x) { return x[0] === wd && x[1] === tm; }) || (P.classes[sid] || []).some(function (x) { return x.d === wd && x.t === tm; }); };
    var fimEx = api.addDays(W.fim, 1);
    grupos().forEach(function (g) {
      var row = linha(api, g), kind = row.kind;
      if (kind === "ignorar") { P.ign += g.count; return; }
      var precisa = kind === "aula" || kind === "prova" || kind === "trabalho", sObj = null;
      var pode = precisa && !!row.sid && (row.sid.indexOf("novo:") === 0 || S.subjects.some(function (x) { return x.id === row.sid; }));
      if (precisa && !pode) { kind = "compromisso"; P.semMateria += g.count; precisa = false; }
      var getS = function () { return sObj || (sObj = resolve(row, g, kind)); };    // só cria a matéria nova se algum item dela for mesmo importado
      g.events.forEach(function (ev) {
        if (/@cycle$/.test(ev.u || "")) { P.ja++; return; }       // arquivo exportado pelo próprio Cycle: já está aqui
        if (ledger.has(api.hash36(ev.u + "|rep")) || ledger.has(api.hash36(ev.u + "|slot"))) { P.ja++; return; }
        if (kind === "aula") {
          var sl = A.slotsOf(ev);
          if (sl.length) { var s0 = getS(); sl.forEach(function (x) { if (!jaSlot(s0.id, x.d, x.t)) (P.classes[s0.id] = P.classes[s0.id] || []).push({ d: x.d, t: x.t }); }); P.chaves.push(api.hash36(ev.u + "|slot")); return; }
        }
        var simples = ev.rr && /FREQ=WEEKLY/i.test(ev.rr) && !/INTERVAL=([2-9]|\d\d)/i.test(ev.rr) && !/BYDAY=[^;]*,/i.test(ev.rr) && !(ev.x && ev.x.length);
        var occ = A.expand([ev], W.ini, fimEx, { cls: {}, map: {} });
        if (!occ.length) return;
        var porDia = function (e) { return e.start.date || localYmd(api, e.start.dateTime); };
        var feitos = function (key, doc, lista, id) { if (ledger.has(key)) { P.ja++; return; } lista.push({ id: "ag-" + key, doc: doc }); P.chaves.push(key); };
        if ((kind === "compromisso" || kind === "aula") && simples && occ.length > 1) {
          var e0 = occ[0], e9 = occ[occ.length - 1], key = api.hash36(ev.u + "|rep");
          var doc = { type: kind === "aula" ? "aula" : "compromisso", title: ev.s || "(sem título)", date: porDia(e0), origem: key, createdAt: Date.now(), repeat: { until: porDia(e9) } };
          if (sObj || (kind === "aula" && precisa)) doc.sid = getS().id;
          if (e0.start.date) doc.allDay = true; else { doc.start = localHM(e0.start.dateTime); doc.end = localHM(e0.end.dateTime); }
          if (ev.l) doc.loc = ev.l; if (ev.d) doc.notes = ev.d;
          if (P.eventos.length < MAX_EVENTOS) feitos(key, doc, P.eventos); else P.avisos.push("limite");
          return;
        }
        occ.forEach(function (e) {
          var dia = porDia(e), key = api.hash36(e.id);
          if (kind === "prova") {
            var time = e.start.dateTime ? localHM(e.start.dateTime) : "10:00";
            var sp = getS();
            if (S.exams.some(function (x) { return x.subjectId === sp.id && x.date === dia; }) || P.provas.some(function (p) { return p.doc.subjectId === sp.id && p.doc.date === dia; })) { P.ja++; return; }
            feitos(key, { subjectId: sp.id, kind: api.examKindOf(g.title), date: dia, time: time, src: "agenda", origem: key }, P.provas);
          } else if (kind === "trabalho") {
            var st = getS(), tt = tituloTrabalho(ev.s, st.name);
            if (S.tasks.some(function (k) { return k.subjectId === st.id && k.due === dia && api.norm(k.title) === api.norm(tt); })) { P.ja++; return; }
            feitos(key, { subjectId: st.id, title: tt, due: dia, status: "aberta", hoje: false, createdAt: Date.now(), origem: key }, P.tarefas);
          } else {
            var doc2 = { type: kind === "aula" ? "aula" : "compromisso", title: ev.s || "(sem título)", date: dia, origem: key, createdAt: Date.now() };
            if (kind === "aula") doc2.sid = getS().id;
            if (e.start.date) { doc2.allDay = true; var dias = Math.round((api.parseYmd(e.end.date) - api.parseYmd(e.start.date)) / 86400000); if (dias > 1) doc2.notes = "Até " + api.fmtShort(api.addDays(e.end.date, -1)) + ". "; }
            else { doc2.start = localHM(e.start.dateTime); doc2.end = localHM(e.end.dateTime); }
            if (ev.l) doc2.loc = ev.l;
            if (ev.d) doc2.notes = (doc2.notes || "") + ev.d;
            if (P.eventos.length < MAX_EVENTOS) feitos(key, doc2, P.eventos); else if (P.avisos.indexOf("limite") < 0) P.avisos.push("limite");
          }
        });
      });
    });
    P.nAulas = Object.keys(P.classes).reduce(function (t, k) { return t + P.classes[k].length; }, 0);
    P.total = P.materias.length + P.nAulas + P.provas.length + P.tarefas.length + P.eventos.length;
    return P;
  }

  function aplicar(api, P) {
    var S = api.S, db = S.db, jobs = [];
    P.materias.forEach(function (m) { jobs.push(function () { return db.doc("subjects/" + m.id).set({ name: m.name, color: m.color, order: m.order }); }); });
    P.provas.forEach(function (x) { jobs.push(function () { return db.doc("exams/" + x.id).set(x.doc); }); });
    P.tarefas.forEach(function (x) { jobs.push(function () { return db.doc("tasks/" + x.id).set(x.doc); }); });
    P.eventos.forEach(function (x) { jobs.push(function () { return db.doc("events/" + x.id).set(x.doc); }); });
    jobs.push(function () {
      var classes = JSON.parse(JSON.stringify(S.settings.classes || {}));
      Object.keys(P.classes).forEach(function (sid) { classes[sid] = (classes[sid] || []).concat(P.classes[sid]); });
      var chaves = (S.settings.importKeys || []).concat(P.chaves).slice(-MAX_CHAVES), patch = { importKeys: chaves };
      if (P.nAulas) patch.classes = classes;
      return api.patchSettings(patch);
    });
    if (W.migrar) jobs.push(function () { return db.doc("agenda/main").delete(); });
    return jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve());
  }

  // ---------- telas ----------
  function passo1(api) {
    var h = cab("Agenda", "Importar a sua agenda", "im") + '<div class="in-form"><p class="plan" style="margin:0">Escolha de onde vem a agenda. O arquivo é lido neste aparelho; nada é enviado para fora.</p>' +
      '<div class="im-fontes">' +
      '<div class="im-f"><b>Google Agenda</b><p>No computador: abra a <a href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noopener">exportação do Google</a>, clique em <b>Exportar</b> e guarde o <b>.zip</b>. No celular o Google não deixa exportar.</p></div>' +
      '<div class="im-f"><b>Apple Calendário</b><p>No Mac: <b>Calendário > Arquivo > Exportar > Exportar…</b> (gera um .ics). <b>iPhone e iPad não exportam arquivo</b>: use um Mac ou, se a conta da Apple já está no Google Agenda, exporte por lá.</p></div>' +
      '<div class="im-f"><b>Outlook ou outro</b><p>Qualquer arquivo <b>.ics</b> serve.</p></div></div>' +
      '<div class="hnav"><button class="btn primary" data-in="escolher" type="button">Escolher arquivo(s) .zip ou .ics</button></div><input type="file" id="imFile" accept=".zip,.ics,text/calendar,application/zip" multiple hidden>' +
      '<div class="cw-erro" role="alert" id="imErro"></div><div class="cw-rodape"><button class="btn" data-in="fechar" data-m="im" type="button">Cancelar</button></div></div>';
    $("imBox").innerHTML = h;
  }
  function optsKind(sel) { return KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === sel ? " selected" : "") + ">" + k[1] + "</option>"; }).join(""); }
  function optsSid(api, row, g) {
    var nome = nomeDoGrupo(g, row.kind), o = '<option value="">(sem matéria)</option>';
    o += api.S.subjects.map(function (s) { return '<option value="' + esc(s.id) + '"' + (row.sid === s.id ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("");
    var novo = row.sid && row.sid.indexOf("novo:") === 0 ? row.sid.slice(5) : (nome && !achaMateria(api, nome) ? nome : "");
    if (novo) o += '<option value="novo:' + esc(novo) + '"' + (row.sid === "novo:" + novo ? " selected" : "") + ">Criar matéria “" + esc(novo) + "”</option>";
    return o;
  }
  function passo2(api) {
    var gs = grupos(), h = cab("Importar · passo 2 de 3", W.migrar ? "Converter a agenda importada" : "O que trazer", "im") + '<div class="in-form">';
    if (W.fonte.calendars.length > 1) h += '<div class="im-cals"><b>Agendas encontradas</b>' + W.fonte.calendars.map(function (c, i) { return '<label class="check"><input type="checkbox" data-imc="' + i + '"' + (c.sel ? " checked" : "") + "> " + esc(c.name) + " (" + c.events.length + " compromissos)</label>"; }).join("") + "</div>";
    h += '<div class="im-per"><label class="field"><span>De</span><input type="date" id="imIni" value="' + W.ini + '"></label><label class="field"><span>Até</span><input type="date" id="imFim" value="' + W.fim + '"></label>' +
      '<label class="check"><input type="checkbox" id="imPassado"' + (W.passado ? " checked" : "") + "> Incluir o que já passou</label></div>";
    var ord = { aula: 0, prova: 1, trabalho: 2, compromisso: 3, ignorar: 4 };
    var rows = gs.map(function (g) { return { g: g, r: linha(api, g) }; }).sort(function (a, b) { return ord[a.r.kind] - ord[b.r.kind] || b.g.count - a.g.count || a.g.title.localeCompare(b.g.title); });
    h += rows.length ? '<p class="plan" style="margin:0">' + rows.length + (rows.length === 1 ? " título" : " títulos") + " no período. Confira o tipo de cada um; o Cycle sugeriu pelo nome.</p><div class='im-rows'>" +
      rows.slice(0, 300).map(function (o) {
        var g = o.g, r = o.r, mostra = r.kind === "aula" || r.kind === "prova" || r.kind === "trabalho";
        return '<div class="im-row"><div class="im-t"><b>' + esc(g.title) + "</b><small>" + g.count + "× no período" + (g.next ? " · primeiro " + api.fmtShort(g.next) : "") + '</small></div><select data-imk="' + esc(g.key) + '" aria-label="Tipo de ' + esc(g.title) + '">' + optsKind(r.kind) + "</select>" +
          (mostra ? '<select data-ims="' + esc(g.key) + '" aria-label="Matéria de ' + esc(g.title) + '">' + optsSid(api, r, g) + "</select>" : "") + "</div>";
      }).join("") + "</div>" + (rows.length > 300 ? '<p class="plan">Mostrando 300 de ' + rows.length + " títulos.</p>" : "") : '<p class="plan" style="margin:0">Não há compromissos neste período. Aumente o período ou inclua o que já passou.</p>';
    h += '<div class="cw-erro" role="alert" id="imErro">' + esc(W.erro || "") + '</div><div class="cw-rodape"><button class="btn" data-in="' + (W.migrar ? "fechar" : "voltar") + '" data-m="im" type="button">' + (W.migrar ? "Cancelar" : "Voltar") + '</button><button class="btn primary" data-in="resumo" type="button"' + (rows.length ? "" : " disabled") + ">Continuar</button></div></div>";
    $("imBox").innerHTML = h;
  }
  function passo3(api) {
    var P = W.plano = planejar(api), li = function (n, a, b) { return n ? "<li>" + n + " " + (n === 1 ? a : b) + "</li>" : ""; };
    var h = cab("Importar · passo 3 de 3", "Resumo antes de salvar", "im") + '<div class="in-form"><div class="cw-resumo" role="status"><b>Vai ser criado:</b><ul style="margin:6px 0 0;padding-left:18px">' +
      li(P.materias.length, "matéria nova", "matérias novas") + li(P.nAulas, "horário semanal de aula", "horários semanais de aula") + li(P.provas.length, "prova", "provas") + li(P.tarefas.length, "trabalho", "trabalhos") + li(P.eventos.length, "compromisso ou aula avulsa", "compromissos e aulas avulsas") +
      (P.total ? "" : "<li>nada de novo</li>") + "</ul>" +
      (P.ja ? '<p class="plan" style="margin:8px 0 0">' + P.ja + " já estavam no Cycle (importados antes ou iguais ao que existe) e ficam como estão.</p>" : "") +
      (P.ign ? '<p class="plan" style="margin:4px 0 0">' + P.ign + " ocorrência(s) marcadas como Ignorar não entram.</p>" : "") +
      (P.semMateria ? '<p class="plan" style="margin:4px 0 0">' + P.semMateria + " ocorrência(s) sem matéria entram como compromisso.</p>" : "") +
      (P.avisos.indexOf("limite") >= 0 ? '<p class="plan" style="margin:4px 0 0">Passou do limite de ' + MAX_EVENTOS + " compromissos avulsos: o resto ficou de fora. Reduza o período para trazer tudo.</p>" : "") +
      (W.migrar ? '<p class="plan" style="margin:8px 0 0">Ao concluir, a agenda importada antiga é removida (os itens ficam no cronograma).</p>' : "") + "</div>" +
      '<p class="plan" style="margin:0">Depois de importar, tudo pode ser editado ou apagado no cronograma. Importar o mesmo arquivo de novo só acrescenta o que for novo.</p>' +
      '<div class="cw-erro" role="alert" id="imErro">' + esc(W.erro || "") + '</div><div class="cw-rodape"><button class="btn" data-in="editar" type="button">Voltar</button><button class="btn primary" data-in="importar" type="button"' + (P.total || W.migrar ? "" : " disabled") + ">" + (W.migrar && !P.total ? "Concluir" : "Importar") + "</button></div></div>";
    $("imBox").innerHTML = h;
  }
  function desenha(api) { if (W.passo === 1) passo1(api); else if (W.passo === 2) passo2(api); else passo3(api); }

  function ligaImportar(api) {
    var box = $("imBox");
    box.onclick = function (e) {
      var b = e.target.closest("[data-in]"); if (!b) return; var k = b.dataset.in;
      if (k === "fechar") { fecha("im"); W = null; }
      else if (k === "escolher") $("imFile").click();
      else if (k === "voltar") { W.passo = 1; W.erro = ""; desenha(api); }
      else if (k === "editar") { W.passo = 2; W.erro = ""; desenha(api); }
      else if (k === "resumo") { W.passo = 3; W.erro = ""; desenha(api); }
      else if (k === "importar") {
        b.disabled = true; b.textContent = "Importando…";
        var P = W.plano;
        aplicar(api, P).then(function () {
          api.toast("Agenda importada: " + (P.total ? [P.materias.length ? P.materias.length + " matéria(s)" : "", P.nAulas ? P.nAulas + " horário(s) de aula" : "", P.provas.length ? P.provas.length + " prova(s)" : "", P.tarefas.length ? P.tarefas.length + " trabalho(s)" : "", P.eventos.length ? P.eventos.length + " compromisso(s)" : ""].filter(Boolean).join(", ") + "." : "nada de novo."));
          fecha("im"); W = null; if (api.renderCrono) api.renderCrono();
        }, function (err) { W.erro = "Não consegui importar: " + ((err && err.message) || err); b.disabled = false; b.textContent = "Importar"; var el = $("imErro"); if (el) el.textContent = W.erro; });
      }
    };
    box.onchange = function (e) {
      var t = e.target;
      if (t.id === "imFile") { lerArquivos(api, [].slice.call(t.files)); t.value = ""; return; }
      if (t.dataset.imc != null) { W.fonte.calendars[+t.dataset.imc].sel = t.checked; W.rows = W.migrar ? W.rows : {}; desenha(api); return; }
      if (t.id === "imIni" || t.id === "imFim") { if (t.id === "imIni") W.ini = t.value; else W.fim = t.value; if (W.ini && W.fim && W.ini <= W.fim) { W.erro = ""; desenha(api); } else { var el = $("imErro"); if (el) el.textContent = "A data inicial precisa vir antes da final."; } return; }
      if (t.id === "imPassado") { W.passado = t.checked; W.ini = t.checked ? api.addDays(api.today(), -365) : api.today(); desenha(api); return; }
      if (t.dataset.imk) { var r = W.rows[t.dataset.imk]; r.kind = t.value; var g = grupos().find(function (x) { return x.key === t.dataset.imk; }); if (g) r.sid = sidPadrao(api, g, r.kind); desenha(api); return; }
      if (t.dataset.ims) { W.rows[t.dataset.ims].sid = t.value; }
    };
  }
  function lerArquivos(api, files) {
    if (!files.length) return;
    var pronto = window.__cycleAgenda ? Promise.resolve() : api.loadScript("agenda.js");
    api.toast("Lendo a agenda…");
    pronto.then(function () {
      var A = window.__cycleAgenda, known = api.S.subjects.map(function (s) { return A.norm(s.name); }), cals = [], erros = [];
      return files.reduce(function (p, f) {
        return p.then(function () { return A.load(f).then(function (r) { r.calendars.forEach(function (c) { c.events.forEach(function (ev) { ev.k = A.guess(ev, known); }); c.sel = true; cals.push(c); }); }, function (e) { erros.push(f.name + ": " + ((e && e.code && e.message) || "não consegui ler")); }); });
      }, Promise.resolve()).then(function () {
        if (!cals.length) { var el = $("imErro"); if (el) el.textContent = erros[0] || "Não encontrei compromissos nesse arquivo."; return; }
        W.fonte = { calendars: cals }; W.rows = {}; W.passo = 2; W.erro = erros.length ? "Alguns arquivos não foram lidos: " + erros.join("; ") : ""; desenha(api);
      });
    }, function () { var el = $("imErro"); if (el) el.textContent = "Não consegui carregar o leitor de agenda."; });
  }
  function novoW(api) { var t = api.today(); return { passo: 1, fonte: null, ini: t, fim: api.addDays(t, 200), passado: false, rows: {}, erro: "", migrar: false, plano: null, cls: null, map: null }; }
  function importar(api) { W = novoW(api); abre("im", "Importar agenda"); ligaImportar(api); desenha(api); }
  // converte a agenda importada antiga (agenda/main) em itens de verdade
  function converter(api) {
    var a = api.S.agenda; if (!a || !a.events) return;
    W = novoW(api); W.migrar = true; W.cls = a.cls || {}; W.map = a.map || {};
    W.fonte = { calendars: [{ name: a.name || "Agenda importada", events: a.events, sel: true }] };
    W.passo = 2; abre("im", "Converter agenda importada"); ligaImportar(api); desenha(api);
  }

  window.__cycleInterop = { importar: importar, converter: converter, exportar: exportar, _t: { montaICS: montaICS, itensExport: itensExport, aulasAte: aulasAte } };
})();
