/* Cycle: cronograma da Agenda. Uma lista com TUDO do semestre (aulas, provas, trabalhos, compromissos), um passo a passo para adicionar,
   editar e apagar, e o botão Fim de semestre. Spec: SPEC-agenda-cronograma.md.
   O cronograma é uma visão sobre o que o app já tem: provas (exams), trabalhos (tasks), horários semanais (settings.classes) e a agenda importada
   (só leitura). Só aula avulsa e compromisso vão para a coleção nova `events`. O cycle.html passa as ferramentas dele em `api`. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var TIPOS = {
    aula: { nome: "Aula", ico: "#i-materias", ajuda: "Toda semana ou só uma vez" },
    prova: { nome: "Prova", ico: "#i-provas", ajuda: "Entra na cobertura da ementa" },
    trabalho: { nome: "Trabalho", ico: "#i-nota", ajuda: "Entrega com prazo" },
    compromisso: { nome: "Compromisso", ico: "#i-hoje", ajuda: "Reunião, monitoria, o que for" }
  };
  var ORDEM = ["aula", "prova", "trabalho", "compromisso"];
  var DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var DIAS_C = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var DUR_AULA = 100, DUR_PROVA = 120;
  var F = { tipos: { aula: 1, prova: 1, trabalho: 1, compromisso: 1 }, sid: "", passados: false };
  var lerModo = function () { try { return localStorage.getItem("cycle.agenda.modo") === "semana" ? "semana" : "lista"; } catch (e) { return "lista"; } };
  var MODO = lerModo();

  // ---------- dados ----------
  // ocorrências de eventos entre de e ate (inclusive); evento que repete toda semana vale até repeat.until
  function ocorrencias(events, de, ate, H) {
    var out = [];
    (events || []).forEach(function (ev) {
      if (!ev || !ev.date) return;
      if (ev.repeat && ev.repeat.until) {
        var fim = ev.repeat.until < ate ? ev.repeat.until : ate, d = ev.date, guarda = 0;
        while (d <= fim && guarda++ < 600) { if (d >= de) out.push({ date: d, ev: ev }); d = H.addDays(d, 7); }
      } else if (ev.date >= de && ev.date <= ate) out.push({ date: ev.date, ev: ev });
    });
    return out;
  }
  function itens(api, de, ate) {
    var S = api.S, H = { addDays: api.addDays, parseYmd: api.parseYmd, ymd: api.ymd }, out = [];
    var sj = function (id) { return S.subjects.find(function (s) { return s.id === id; }); };
    S.exams.forEach(function (x) {
      if (!x.date || x.date < de || x.date > ate) return;
      var a = api.toMin(x.time || "10:00");
      out.push({ date: x.date, ini: a, fim: a + DUR_PROVA, tipo: "prova", titulo: x.kind || "Prova", sid: x.subjectId, o: { k: "prova", id: x.id } });
    });
    S.tasks.forEach(function (k) {
      if (!k.due || k.due < de || k.due > ate) return;
      out.push({ date: k.due, diaTodo: true, tipo: "trabalho", titulo: k.title, sid: k.subjectId, feito: k.status === "feita", o: { k: "trabalho", id: k.id } });
    });
    var importados = [];
    if (S.agenda && api.agendaEvents) {
      api.agendaEvents(de, api.addDays(ate, 1)).forEach(function (e) {
        if (e.status === "cancelled" || e.kind === "revisao" || /^R\d+\s*·/.test(e.summary || "") || api.isBlock(e)) return;
        var allDay = !!(e.start && e.start.date), d = allDay ? e.start.date : api.ymd(new Date(e.start.dateTime));
        if (d < de || d > ate || api.dupOfCycle(e, d)) return;
        var ini = null, fim = null;
        if (!allDay) { var s0 = new Date(e.start.dateTime), e0 = new Date(e.end.dateTime); ini = s0.getHours() * 60 + s0.getMinutes(); fim = api.ymd(e0) > d ? 1440 : e0.getHours() * 60 + e0.getMinutes(); }
        var s2 = e.sid ? sj(e.sid) : null;
        var it = { date: d, ini: ini, fim: fim, diaTodo: allDay, tipo: e.kind === "prova" ? "prova" : e.kind === "trabalho" ? "trabalho" : s2 ? "aula" : "compromisso", titulo: e.summary || "(sem título)", sid: s2 ? s2.id : null, local: e.location || "", importado: true, o: { k: "importado" } };
        importados.push(it); out.push(it);
      });
    }
    S.subjects.forEach(function (s) {
      api.classSlots(s.id).forEach(function (sl) {
        var wd = sl[0], tm = sl[1], d = de;
        while (d <= ate) {
          if (api.parseYmd(d).getDay() === wd && !(s.skipLectures || []).includes(d) && !S.exams.some(function (e) { return e.subjectId === s.id && e.date === d; })) {
            var a = api.toMin(tm);
            if (!importados.some(function (m) { return m.sid === s.id && m.date === d && m.ini != null && Math.abs(m.ini - a) <= 30; }))
              out.push({ date: d, ini: a, fim: a + DUR_AULA, tipo: "aula", titulo: s.name, sid: s.id, semanal: true, o: { k: "aula-semana", sid: s.id, slot: [wd, tm], date: d } });
          }
          d = api.addDays(d, 1);
        }
      });
    });
    ocorrencias(S.events, de, ate, H).forEach(function (oc) {
      var ev = oc.ev;
      out.push({ date: oc.date, ini: ev.allDay || !ev.start ? null : api.toMin(ev.start), fim: ev.allDay || !ev.end ? null : api.toMin(ev.end), diaTodo: !!ev.allDay || !ev.start,
        tipo: ev.type === "aula" ? "aula" : "compromisso", titulo: ev.title || (ev.type === "aula" && ev.sid && sj(ev.sid) ? sj(ev.sid).name : "(sem título)"), sid: ev.sid || null, local: ev.loc || "", repete: !!(ev.repeat && ev.repeat.until), o: { k: "evento", id: ev.id } });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.diaTodo ? -1 : 0) - (b.diaTodo ? -1 : 0) || (a.ini || 0) - (b.ini || 0); });
    return out;
  }
  function faixa(api) {   // de hoje até o último evento cadastrado (no mínimo 4 semanas); sem nada cadastrado, 8 semanas. Com "passados", desde o primeiro
    var S = api.S, t = api.today(), ultimo = "", menor = t;
    var vê = function (d) { if (!d) return; if (d > ultimo) ultimo = d; if (d < menor) menor = d; };
    S.exams.forEach(function (x) { vê(x.date); }); S.tasks.forEach(function (k) { vê(k.due); });
    S.events.forEach(function (e) { vê(e.date); if (e.repeat && e.repeat.until) vê(e.repeat.until); });
    var minimo = api.addDays(t, ultimo ? 28 : 56), limite = api.addDays(t, 400), ate = ultimo > minimo ? ultimo : minimo, min = api.addDays(t, -400);
    return { de: F.passados ? (menor < min ? min : menor) : t, ate: ate > limite ? limite : ate, ultimo: ultimo };
  }

  // ---------- lista ----------
  var tmpl = function (api, it) {
    var T = TIPOS[it.tipo], S = api.S, s = it.sid && S.subjects.find(function (x) { return x.id === it.sid; });
    var hora = it.diaTodo ? (it.tipo === "trabalho" ? "prazo" : "dia todo") : api.fromMin(it.ini) + (it.fim != null ? "–" + api.fromMin(Math.min(it.fim, 1439)) : "");
    var rotulo = T.nome + ": " + it.titulo + (s ? ", " + s.name : "") + ", " + hora + (it.importado ? " (importado, só leitura)" : "");
    return '<button type="button" class="crev t-' + it.tipo + (it.feito ? " feito" : "") + '" data-cr="item" data-i="' + it.idx + '"' + (it.importado ? " disabled" : "") + ' aria-label="' + esc(rotulo) + '">' +
      '<span class="hora">' + esc(hora) + '</span><span class="tipo"><svg class="ico" aria-hidden="true"><use href="' + T.ico + '"/></svg>' + T.nome + "</span>" +
      '<span class="tt">' + esc(it.titulo) + (it.feito ? " (feito)" : "") + "</span>" +
      (s ? '<span class="mat" style="--c:' + esc(s.color) + '">' + esc(s.name) + "</span>" : "") +
      (it.local ? '<span class="loc">' + esc(it.local) + "</span>" : "") + (it.importado ? '<span class="imp">importado</span>' : "") + (it.repete ? '<span class="imp">toda semana</span>' : "") + "</button>";
  };
  var ITENS = [];
  function montaFiltros(api) {
    var box = $("cronoFiltros"); if (!box) return;
    if (!box.dataset.pronto) {
      box.dataset.pronto = "1";
      box.innerHTML = ORDEM.map(function (k) { return '<button type="button" class="crchip t-' + k + '" data-cr="tipo" data-k="' + k + '" aria-pressed="true"><svg class="ico" aria-hidden="true"><use href="' + TIPOS[k].ico + '"/></svg>' + TIPOS[k].nome + "</button>"; }).join("") +
        '<select id="cronoMat" data-cr="mat" aria-label="Filtrar por matéria"></select><label class="plan" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="cronoPass" data-cr="pass" style="width:auto;margin:0"> Mostrar passados</label>';
    }
    box.querySelectorAll(".crchip").forEach(function (b) { b.setAttribute("aria-pressed", String(!!F.tipos[b.dataset.k])); });
    var sel = $("cronoMat"), ops = '<option value="">Todas as matérias</option>' + api.S.subjects.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>"; }).join("");
    if (sel.dataset.ops !== ops) { sel.innerHTML = ops; sel.dataset.ops = ops; }
    sel.value = F.sid;
  }
  function render(api) {
    var painel = $("cronoPanel"); if (!painel) return;
    MODO = lerModo();
    $("cronoModoLista").setAttribute("aria-pressed", String(MODO === "lista")); $("cronoModoSemana").setAttribute("aria-pressed", String(MODO === "semana"));
    $("cronoLista").hidden = MODO !== "lista"; $("cronoFiltros").hidden = MODO !== "lista"; $("viewGrade").hidden = MODO !== "semana";
    ligar(api);
    if (MODO !== "lista") { $("cronoCount").textContent = ""; return; }
    montaFiltros(api);
    var fx = faixa(api), t = api.today(), todos = itens(api, fx.de, fx.ate);
    ITENS = todos.filter(function (it) { return F.tipos[it.tipo] && (!F.sid || it.sid === F.sid); });
    ITENS.forEach(function (it, i) { it.idx = i; });
    $("cronoCount").textContent = ITENS.length + (ITENS.length === 1 ? " evento" : " eventos");
    if (!ITENS.length) {
      $("cronoLista").innerHTML = '<div class="empty">' + (todos.length ? "Nenhum evento com esses filtros." : "Seu cronograma está vazio. Toque em <b>+ Adicionar</b> para cadastrar suas aulas, provas, trabalhos e compromissos.") + "</div>";
      return;
    }
    var html = "", semAtual = null, diaAtual = null;
    ITENS.forEach(function (it) {
      var d = api.parseYmd(it.date), seg = api.addDays(it.date, -((d.getDay() + 6) % 7));
      if (seg !== semAtual) { semAtual = seg; diaAtual = null; html += '<h3 class="crsem">Semana de ' + esc(api.fmtShort(seg)) + " a " + esc(api.fmtShort(api.addDays(seg, 6))) + "</h3>"; }
      if (it.date !== diaAtual) { diaAtual = it.date; html += '<h4 class="crdia' + (it.date === t ? " hoje" : "") + '">' + DIAS[d.getDay()] + ", " + api.fmtShort(it.date).split(" ")[1] + (it.date === t ? " · hoje" : "") + "</h4>"; }
      html += tmpl(api, it);
    });
    $("cronoLista").innerHTML = html + '<p class="plan" style="margin:12px 0 0">Aulas semanais aparecem até ' + esc(api.fmtShort(fx.ate)) + (fx.ultimo ? " (a última prova, prazo ou compromisso cadastrado)." : " (8 semanas; cadastre provas e prazos para ver mais).") + "</p>";
  }
  var ligado = false;
  function ligar(api) {
    if (ligado) return; ligado = true;
    $("cronoPanel").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cr]"); if (!b) return;
      var k = b.dataset.cr, a = window.__cycleCrono._api;
      if (k === "tipo") { F.tipos[b.dataset.k] = !F.tipos[b.dataset.k]; render(a); }
      else if (k === "item") abrirItem(a, ITENS[+b.dataset.i]);
    });
    $("cronoPanel").addEventListener("change", function (e) {
      var b = e.target.closest("[data-cr]"); if (!b) return; var a = window.__cycleCrono._api;
      if (b.dataset.cr === "mat") { F.sid = b.value; render(a); } else if (b.dataset.cr === "pass") { F.passados = b.checked; render(a); }
    });
  }
  function modo(m, api) { try { localStorage.setItem("cycle.agenda.modo", m); } catch (e) {} MODO = m; render(api); if (m === "semana" && api.refreshLocalCal) api.refreshLocalCal(); }

  // ---------- modal (passo a passo e Fim de semestre) ----------
  var modal = null, teclaEsc = null, W = null;
  function monta() {
    if (modal) return;
    modal = document.createElement("div"); modal.className = "qz-back"; modal.id = "cwBack"; modal.hidden = true;
    modal.innerHTML = '<div class="qz" role="dialog" aria-modal="true" aria-labelledby="cwTitle" id="cwBox"></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) fecha(); });
  }
  function abre() { monta(); modal.hidden = false; if (!teclaEsc) { teclaEsc = function (e) { if (e.key === "Escape") fecha(); }; document.addEventListener("keydown", teclaEsc); } }
  function fecha() { if (!modal) return; modal.hidden = true; W = null; if (teclaEsc) { document.removeEventListener("keydown", teclaEsc); teclaEsc = null; } }
  var cab = function (titulo, passo) {
    return '<div class="qz-head"><div><div class="eyebrow">' + (passo ? "Passo " + passo + " de 3" : "Cronograma") + '</div><h2 id="cwTitle">' + titulo + '</h2></div><button class="btn small ghost" data-cw="fechar" type="button" aria-label="Fechar">✕</button></div>';
  };

  // ---------- passo a passo ----------
  function novoW(api) { return { edit: null, passo: 1, tipo: "aula", titulo: "", sid: "", modo: "semanal", dias: [], inicio: "08:00", fim: "09:40", data: api.today(), diaTodo: false, repete: false, ate: "", hora: "10:00", prazo: "", local: "", notas: "", erro: "" }; }
  function novo(api, tipo) { window.__cycleCrono._api = api; W = novoW(api); if (tipo) W.tipo = tipo; abre(); passo(api); }
  function abrirItem(api, it) {
    if (!it || it.importado) return;
    var S = api.S, o = it.o; W = novoW(api); W.edit = o; W.tipo = it.tipo; W.sid = it.sid || "";
    if (o.k === "prova") { var x = S.exams.find(function (e) { return e.id === o.id; }); if (!x) return; W.titulo = x.kind || ""; W.data = x.date; W.hora = x.time || "10:00"; }
    else if (o.k === "trabalho") { var k = S.tasks.find(function (e) { return e.id === o.id; }); if (!k) return; W.titulo = k.title; W.prazo = k.due; }
    else if (o.k === "aula-semana") { W.modo = "semanal"; W.dias = [o.slot[0]]; W.inicio = o.slot[1]; W.data = o.date; }
    else if (o.k === "evento") {
      var ev = S.events.find(function (e) { return e.id === o.id; }); if (!ev) return;
      W.titulo = ev.title || ""; W.modo = "avulsa"; W.data = ev.date; W.diaTodo = !!ev.allDay; W.inicio = ev.start || "08:00"; W.fim = ev.end || "09:00"; W.local = ev.loc || ""; W.notas = ev.notes || "";
      W.repete = !!(ev.repeat && ev.repeat.until); W.ate = W.repete ? ev.repeat.until : "";
    } else return;
    window.__cycleCrono._api = api; abre(); passo(api);
  }
  function opcoesMateria(api, sel, opcional) {
    return '<select data-w="sid" id="cwSid" aria-label="Matéria">' + '<option value="">' + (opcional ? "Nenhuma (opcional)" : "Escolha a matéria") + "</option>" +
      api.S.subjects.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sel ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select>";
  }
  function passo(api) {
    var h, w = W, e = !!w.edit;
    if (w.passo === 1) {
      h = cab(e ? "Editar " + TIPOS[w.tipo].nome.toLowerCase() : "O que você quer adicionar?", 1) + '<div class="cw-form">' +
        '<div class="cw-tipos" role="radiogroup" aria-label="Tipo">' + ORDEM.map(function (k) {
          return '<button type="button" class="cw-tipo t-' + k + '" role="radio" aria-checked="' + (w.tipo === k) + '" data-cw="tipo" data-k="' + k + '"' + (e && w.tipo !== k ? " disabled" : "") + '><svg class="ico" aria-hidden="true"><use href="' + TIPOS[k].ico + '"/></svg><span>' + TIPOS[k].nome + '<br><small class="plan">' + TIPOS[k].ajuda + "</small></span></button>";
        }).join("") + "</div>" +
        '<label class="field"><span>' + (w.tipo === "prova" ? "Qual prova (ex.: P1, P2, Sub)" : w.tipo === "aula" ? "Título (opcional)" : "Título") + '</span><input type="text" id="cwTitulo" data-w="titulo" maxlength="120" autocomplete="off" value="' + esc(w.titulo) + '"' + (w.tipo === "prova" ? ' list="cwKinds"' : "") + "></label>" +
        (w.tipo === "prova" ? '<datalist id="cwKinds">' + api.examKinds().map(function (k) { return '<option value="' + esc(k) + '"></option>'; }).join("") + "</datalist>" : "") +
        '<label class="field"><span>Matéria' + (w.tipo === "compromisso" ? " (opcional)" : "") + "</span>" + opcoesMateria(api, w.sid, w.tipo === "compromisso") + "</label>" +
        (w.tipo === "aula" && !e ? '<p class="plan" style="margin:0">Aula toda semana usa os horários da matéria (e distribui os tópicos da ementa). Aula só desta vez não consome tópico.</p>' : "") +
        '<div class="cw-erro" role="alert" id="cwErro">' + esc(w.erro) + "</div></div>";
    } else if (w.passo === 2) {
      h = cab("Quando?", 2) + '<div class="cw-form">';
      if (w.tipo === "aula") {
        h += (e && w.edit.k === "aula-semana") ? '<p class="plan" style="margin:0">Você está mudando o horário semanal desta matéria.</p>' :
          '<div class="cw-dias" role="radiogroup" aria-label="Frequência"><label><input type="radio" name="cwm" data-w="modo" value="semanal"' + (w.modo === "semanal" ? " checked" : "") + '> Toda semana</label><label><input type="radio" name="cwm" data-w="modo" value="avulsa"' + (w.modo === "avulsa" ? " checked" : "") + "> Só desta vez</label></div>";
        if (w.modo === "semanal") h += '<div class="field"><span>Dias da semana</span><div class="cw-dias" id="cwDias">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<label><input type="checkbox" data-dia="' + d + '"' + (w.dias.indexOf(d) >= 0 ? " checked" : "") + "> " + DIAS_C[d] + "</label>"; }).join("") + '</div></div><label class="field"><span>Início da aula</span><input type="time" data-w="inicio" value="' + esc(w.inicio) + '"></label>';
        else h += camposData(w);
      } else if (w.tipo === "prova") h += '<label class="field"><span>Data</span><input type="date" data-w="data" value="' + esc(w.data) + '"></label><label class="field"><span>Horário</span><input type="time" data-w="hora" value="' + esc(w.hora) + '"></label>';
      else if (w.tipo === "trabalho") h += '<label class="field"><span>Prazo de entrega</span><input type="date" data-w="prazo" value="' + esc(w.prazo) + '"></label>';
      else h += camposData(w) + '<label class="plan" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-w="repete" style="width:auto;margin:0"' + (w.repete ? " checked" : "") + '> Repete toda semana</label>' +
        (w.repete ? '<label class="field"><span>Repete até</span><input type="date" data-w="ate" value="' + esc(w.ate) + '"></label>' : "");
      h += '<div class="cw-erro" role="alert" id="cwErro">' + esc(w.erro) + "</div></div>";
    } else {
      h = cab(e ? "Confirmar mudanças" : "Detalhes e resumo", 3) + '<div class="cw-form">';
      if ((w.tipo === "compromisso" || (w.tipo === "aula" && w.modo === "avulsa"))) h += '<label class="field"><span>Local (opcional)</span><input type="text" data-w="local" maxlength="120" value="' + esc(w.local) + '"></label><label class="field"><span>Observações (opcional)</span><textarea data-w="notas" rows="3" maxlength="500">' + esc(w.notas) + "</textarea></label>";
      h += '<div class="cw-resumo" role="status"><b>Vai ser salvo:</b><br>' + esc(resumo(api)) + "</div>" + '<div class="cw-erro" role="alert" id="cwErro">' + esc(w.erro) + "</div></div>";
    }
    h += '<div class="cw-rodape"><span>' + (e ? '<button class="btn small" data-cw="excluir" type="button" style="color:var(--late)">Excluir</button>' : "") + "</span><span style=\"display:flex;gap:8px\">" +
      (w.passo > 1 ? '<button class="btn" data-cw="voltar" type="button">Voltar</button>' : '<button class="btn" data-cw="fechar" type="button">Cancelar</button>') +
      (w.passo < 3 ? '<button class="btn primary" data-cw="avancar" type="button">Avançar</button>' : '<button class="btn primary" data-cw="salvar" type="button">' + (e ? "Salvar mudanças" : "Salvar") + "</button>") + "</span></div>";
    $("cwBox").innerHTML = h; ligaModal(api);
    var f = $("cwBox").querySelector("input[type=text],input[type=date],input[type=time],select,button.cw-tipo[aria-checked=true]"); if (f) f.focus();
  }
  function camposData(w) {
    return '<label class="field"><span>Data</span><input type="date" data-w="data" value="' + esc(w.data) + '"></label>' +
      '<label class="plan" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-w="diaTodo" style="width:auto;margin:0"' + (w.diaTodo ? " checked" : "") + "> Dia inteiro</label>" +
      (w.diaTodo ? "" : '<div style="display:flex;gap:10px"><label class="field" style="flex:1"><span>Início</span><input type="time" data-w="inicio" value="' + esc(w.inicio) + '"></label><label class="field" style="flex:1"><span>Fim</span><input type="time" data-w="fim" value="' + esc(w.fim) + '"></label></div>');
  }
  function nomeMat(api, sid) { var s = api.S.subjects.find(function (x) { return x.id === sid; }); return s ? s.name : ""; }
  var br = function (d) { var p = d.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; };
  function resumo(api) {
    var w = W, m = nomeMat(api, w.sid), T = TIPOS[w.tipo].nome;
    if (w.tipo === "aula" && w.modo === "semanal") return "Aula de " + m + ", toda " + w.dias.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }).map(function (d) { return DIAS[d]; }).join(", toda ") + " às " + w.inicio + ". Entra nos horários da matéria e distribui os tópicos da ementa.";
    if (w.tipo === "aula") return "Aula avulsa de " + m + (w.titulo ? " (" + w.titulo + ")" : "") + " em " + br(w.data) + (w.diaTodo ? ", dia inteiro" : ", " + w.inicio + " às " + w.fim) + ". Não consome tópico da ementa.";
    if (w.tipo === "prova") return (w.titulo || "Prova") + " de " + m + " em " + br(w.data) + " às " + w.hora + ". Aparece em Provas e conta para a cobertura da ementa.";
    if (w.tipo === "trabalho") return "Trabalho \"" + w.titulo + "\" de " + m + ", prazo " + br(w.prazo) + ".";
    return "Compromisso \"" + w.titulo + "\"" + (m ? " (" + m + ")" : "") + " em " + br(w.data) + (w.diaTodo ? ", dia inteiro" : ", " + w.inicio + " às " + w.fim) + (w.repete ? ", toda semana até " + br(w.ate) : "") + ".";
  }
  function valida(passoN) {
    var w = W;
    if (passoN === 1) {
      if (w.tipo !== "compromisso" && !w.sid) return "Escolha a matéria.";
      if (w.tipo !== "aula" && !w.titulo.trim()) return w.tipo === "prova" ? "Diga qual prova é (ex.: P1)." : "Dê um título.";
      return "";
    }
    if (w.tipo === "prova") return w.data ? "" : "Escolha a data da prova.";
    if (w.tipo === "trabalho") return w.prazo ? "" : "Escolha o prazo de entrega.";
    if (w.tipo === "aula" && w.modo === "semanal") return !w.dias.length ? "Marque pelo menos um dia da semana." : !w.inicio ? "Informe o início da aula." : "";
    if (!w.data) return "Escolha a data.";
    if (!w.diaTodo) { if (!w.inicio || !w.fim) return "Informe o início e o fim."; if (w.fim <= w.inicio) return "O fim precisa ser depois do início."; }
    if (w.repete && (!w.ate || w.ate < w.data)) return "Escolha até quando repete (depois da data inicial).";
    return "";
  }
  function ligaModal(api) {
    var box = $("cwBox");
    if (!box._ok) {
      box._ok = true;
      box.addEventListener("click", function (e) {
        var b = e.target.closest("[data-cw]"); if (!b || !W) return; var a = window.__cycleCrono._api, k = b.dataset.cw;
        if (k === "fechar") fecha();
        else if (k === "tipo") { if (!W.edit) { W.tipo = b.dataset.k; if (W.tipo === "aula") W.modo = "semanal"; W.erro = ""; passo(a); } }
        else if (k === "voltar") { W.passo--; W.erro = ""; passo(a); }
        else if (k === "avancar") { W.erro = valida(W.passo); if (W.erro) { $("cwErro").textContent = W.erro; return; } W.passo++; if (W.passo === 3 && W.tipo !== "compromisso") W.erro = ""; passo(a); }
        else if (k === "salvar") { W.erro = valida(1) || valida(2); if (W.erro) { W.passo = valida(1) ? 1 : 2; passo(a); return; } salvar(a); }
        else if (k === "excluir") excluir(a);
        else if (k === "esc") fecha();
      });
      box.addEventListener("input", function (e) {
        var t = e.target; if (!W) return;
        if (t.dataset.w) { var v = t.type === "checkbox" ? t.checked : t.value; W[t.dataset.w] = v; if (t.dataset.w === "diaTodo" || t.dataset.w === "repete" || t.dataset.w === "modo") passo(window.__cycleCrono._api); }
        else if (t.dataset.dia != null) { var d = +t.dataset.dia, i = W.dias.indexOf(d); if (t.checked && i < 0) W.dias.push(d); if (!t.checked && i >= 0) W.dias.splice(i, 1); }
      });
      box.addEventListener("keydown", function (e) { if (e.key === "Enter" && W && e.target.tagName === "INPUT" && e.target.type !== "checkbox" && e.target.type !== "radio") { e.preventDefault(); var b = box.querySelector('[data-cw="avancar"],[data-cw="salvar"]'); if (b) b.click(); } });
    }
  }
  function salvar(api) {
    var w = W, S = api.S, db = S.db; if (!db) { api.toast("Abra pelo app para salvar."); return Promise.resolve(); }
    var e = w.edit, p;
    var btn = $("cwBox").querySelector('[data-cw="salvar"]'); if (btn) btn.disabled = true;
    if (w.tipo === "prova") {
      var dados = { subjectId: w.sid, kind: w.titulo.trim(), date: w.data, time: w.hora || "10:00" };
      p = e ? db.doc("exams/" + e.id).update(dados) : db.collection("exams").add(dados);
    } else if (w.tipo === "trabalho") {
      p = e ? db.doc("tasks/" + e.id).update({ subjectId: w.sid, title: w.titulo.trim(), due: w.prazo }) : db.collection("tasks").add({ subjectId: w.sid, title: w.titulo.trim(), due: w.prazo, status: "aberta", hoje: false, createdAt: Date.now() });
    } else if (w.tipo === "aula" && w.modo === "semanal") {
      if (e && e.k === "aula-semana" && e.sid !== w.sid) { /* mudou de matéria: o horário antigo sai da matéria antiga */
        var velhos = api.classSlots(e.sid).filter(function (x) { return !(x[0] === e.slot[0] && x[1] === e.slot[1]); });
        p = api.saveClasses(e.sid, velhos);
      } else p = Promise.resolve();
      p = p.then(function () {
        var atuais = api.classSlots(w.sid).filter(function (x) { return !(e && e.k === "aula-semana" && e.sid === w.sid && x[0] === e.slot[0] && x[1] === e.slot[1]); });
        w.dias.forEach(function (d) { if (!atuais.some(function (x) { return x[0] === d && x[1] === w.inicio; })) atuais.push([d, w.inicio]); });
        return api.saveClasses(w.sid, atuais);
      });
    } else {
      var ev = { type: w.tipo === "aula" ? "aula" : "compromisso", title: w.titulo.trim(), sid: w.sid || null, date: w.data, allDay: !!w.diaTodo, start: w.diaTodo ? null : w.inicio, end: w.diaTodo ? null : w.fim,
        repeat: w.tipo === "compromisso" && w.repete ? { until: w.ate } : null, loc: w.local.trim(), notes: w.notas.trim() };
      p = e && e.k === "evento" ? db.doc("events/" + e.id).update(ev) : db.collection("events").add(Object.assign(ev, { createdAt: Date.now() }));
    }
    return p.then(function () { api.toast(e ? "Mudanças salvas." : TIPOS[w.tipo].nome + (w.tipo === "compromisso" || w.tipo === "trabalho" ? " adicionado" : " adicionada") + " ao cronograma."); fecha(); }, function (err) { if (btn) btn.disabled = false; W.erro = "Não consegui salvar: " + ((err && err.message) || err); passo(api); });
  }
  function excluir(api) {
    var w = W, e = w.edit, db = api.S.db; if (!e || !db) return;
    if (e.k === "aula-semana") { escolhaAula(api, e); return; }
    if (!window.confirm("Excluir este item do cronograma?")) return;
    var cam = e.k === "prova" ? "exams/" : e.k === "trabalho" ? "tasks/" : "events/";
    db.doc(cam + e.id).delete().then(function () { api.toast("Excluído."); fecha(); });
  }
  function escolhaAula(api, e) {
    var s = nomeMat(api, e.sid);
    $("cwBox").innerHTML = cab("Excluir aula de " + esc(s), 0) + '<div class="cw-form"><p style="margin:0">Esta aula acontece toda semana (' + DIAS[e.slot[0]] + " às " + esc(e.slot[1]) + "). O que você quer fazer?</p>" +
      '<button class="btn" data-cw="so-esta" type="button">Só a aula de ' + esc(br(e.date)) + "</button>" +
      '<button class="btn" data-cw="todas" type="button" style="color:var(--late)">Tirar este horário da grade (todas as semanas)</button>' +
      '<button class="btn" data-cw="fechar" type="button">Cancelar</button></div>';
    $("cwBox").onclick = function (ev) {
      var b = ev.target.closest("[data-cw]"); if (!b) return;
      if (b.dataset.cw === "so-esta") { var sj = api.subj(e.sid), skip = (sj.skipLectures || []).concat([e.date]); api.S.db.doc("subjects/" + e.sid).update({ skipLectures: skip.filter(function (x, i) { return skip.indexOf(x) === i; }).sort() }).then(function () { api.toast("Aula de " + br(e.date) + " removida."); fecha(); }); }
      else if (b.dataset.cw === "todas") { api.saveClasses(e.sid, api.classSlots(e.sid).filter(function (x) { return !(x[0] === e.slot[0] && x[1] === e.slot[1]); })).then(function () { api.toast("Horário removido da grade."); fecha(); }); }
      else if (b.dataset.cw === "fechar") fecha();
    };
  }

  // ---------- Fim de semestre ----------
  function contagens(api) {
    var S = api.S, horarios = 0; Object.keys(S.settings.classes || {}).forEach(function (k) { horarios += (S.settings.classes[k] || []).length; });
    return { horarios: horarios, provas: S.exams.length, trabalhos: S.tasks.length, compromissos: S.events.length, importada: S.agenda ? S.agenda.n || 1 : 0 };
  }
  function resumoMd(api) {
    var S = api.S, L = ["# Resumo do semestre", "", "Gerado em " + new Date().toLocaleDateString("pt-BR") + ". O tempo estudado considera os últimos 120 dias guardados.", "", "| Matéria | Horas estudadas | Tópicos vistos |", "|---|---|---|"];
    S.subjects.forEach(function (s) {
      var min = S.sessions.filter(function (x) { return x.subjectId === s.id; }).reduce(function (t, x) { return t + (x.minutes || 0); }, 0), syl = s.syllabus || [], vistos = syl.filter(function (t) { return t.seenOn; }).length;
      L.push("| " + s.name + " | " + (min / 60).toFixed(1).replace(".", ",") + " h | " + vistos + " de " + syl.length + " |");
    });
    return L.join("\n") + "\n";
  }
  function baixar(nome, texto) { return window.claude.use("downloads").then(function (d) { return d.save({ filename: nome, data: texto }); }); }
  function fim(api) {
    window.__cycleCrono._api = api; W = { fim: true }; abre();
    var c = contagens(api), total = c.horarios + c.provas + c.trabalhos + c.compromissos + c.importada;
    $("cwBox").innerHTML = cab("Fim de semestre", 0) + '<div class="cw-form">' +
      '<p style="margin:0">Apaga os eventos do cronograma para você montar outro semestre. <b>Antes</b>, você pode rever o semestre.</p>' +
      (window.__cycleRetro && window.__cycleRetro.abrir ? '<button class="btn" data-cf="retro" type="button">Ver a retrospectiva do semestre</button>' : '<button class="btn" data-cf="resumo" type="button">Baixar o resumo do semestre (.md)</button>') +
      '<div class="cw-resumo"><b>Será apagado:</b><ul style="margin:6px 0 0;padding-left:18px"><li>' + c.horarios + " horário(s) semanais de aula</li><li>" + c.provas + " prova(s)</li><li>" + c.trabalhos + " trabalho(s)</li><li>" + c.compromissos + " compromisso(s) e aula(s) avulsa(s)</li><li>" + (c.importada ? "a agenda importada (" + c.importada + " compromissos)" : "agenda importada: nenhuma") + "</li></ul>" +
      '<b style="display:block;margin-top:8px">Fica:</b> matérias, ementas e tópicos, revisões, tempo estudado, anotações e notas.</div>' +
      '<p class="plan" style="margin:0">Um <b>arquivo de segurança</b> com tudo o que for apagado é baixado automaticamente antes.</p>' +
      '<div class="cw-erro" role="alert" id="cfErro"></div>' +
      '<div class="cw-rodape"><button class="btn" data-cf="fechar" type="button">Cancelar</button><button class="btn primary" data-cf="seguir" type="button"' + (total ? "" : " disabled") + ">" + (total ? "Continuar" : "Nada para apagar") + "</button></div></div>";
    $("cwBox").onclick = function (ev) {
      var b = ev.target.closest("[data-cf],[data-cw]"); if (!b) return; var k = b.dataset.cf || b.dataset.cw;
      if (k === "fechar") fecha();
      else if (k === "retro") window.__cycleRetro.abrir(api);
      else if (k === "resumo") baixar("cycle-resumo-semestre.md", resumoMd(api)).then(function () { api.toast("Resumo baixado."); });
      else if (k === "seguir") confirmaFim(api, c);
      else if (k === "apagar") apagaTudo(api, c);
      else if (k === "voltar") fim(api);
    };
    var cb = $("cwBox").querySelector("[data-cf=seguir]"); if (cb && !cb.disabled) cb.focus();
  }
  function confirmaFim(api, c) {
    $("cwBox").innerHTML = cab("Apagar e começar outro semestre?", 0) + '<div class="cw-form"><p style="margin:0">Isto apaga <b>' + (c.horarios + c.provas + c.trabalhos + c.compromissos + c.importada) + " itens</b> do cronograma e não dá para desfazer pelo app. O arquivo de segurança será baixado primeiro.</p>" +
      '<div class="cw-erro" role="alert" id="cfErro"></div><div class="cw-rodape"><button class="btn" data-cw="voltar" type="button">Voltar</button><button class="btn primary" data-cf="apagar" type="button" style="background:var(--late);border-color:var(--late)">Apagar e começar outro semestre</button></div></div>';
  }
  function apagaTudo(api, c) {
    var S = api.S, db = S.db, b = $("cwBox").querySelector('[data-cf="apagar"]'); if (b) b.disabled = true;
    var copia = { app: "Cycle", tipo: "fim-de-semestre", em: new Date().toISOString(), horariosSemanais: S.settings.classes || {}, provas: S.exams, trabalhos: S.tasks, eventos: S.events, agendaImportada: S.agenda || null };
    baixar("cycle-fim-de-semestre-" + api.today() + ".json", JSON.stringify(copia, null, 1)).then(function () {
      return window.__cycleRetro && window.__cycleRetro.arquivar ? window.__cycleRetro.arquivar(api) : null;   // guarda o resumo do semestre antes de apagar
    }).then(function () {
      var jobs = [];
      S.exams.forEach(function (x) { jobs.push(function () { return db.doc("exams/" + x.id).delete(); }); });
      S.tasks.forEach(function (x) { jobs.push(function () { return db.doc("tasks/" + x.id).delete(); }); });
      S.events.forEach(function (x) { jobs.push(function () { return db.doc("events/" + x.id).delete(); }); });
      if (S.agenda) jobs.push(function () { return db.doc("agenda/main").delete(); });
      jobs.push(function () { return api.patchSettings({ classes: {} }); });
      return jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve());
    }).then(function () { api.toast("Pronto: cronograma limpo. O arquivo de segurança foi baixado."); fecha(); novo(api); },
      function (err) { if (b) b.disabled = false; var el = $("cfErro"); if (el) el.textContent = "Não consegui apagar: " + ((err && err.message) || err); });
  }

  window.__cycleCrono = { render: function (api) { this._api = api; render(api); }, modo: modo, novo: novo, fim: fim, ocorrencias: ocorrencias, _api: null,
    _t: { itens: itens, contagens: contagens, resumoMd: resumoMd } };
})();
