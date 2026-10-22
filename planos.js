/* Cycle: importar Planos de Ensino (PDF). Cada pessoa carrega os planos das matérias que cursa; o PDF é lido no aparelho (ementa.js)
   e nada é enviado para fora nem guardado: só os campos extraídos. Mostra uma prévia por arquivo e só cria ou altera matérias depois da confirmação.
   Matéria que já existe é mesclada: entram só os tópicos que faltam, sem mexer nos já vistos. Carregado sob demanda pelo cycle.html. */
(function () {
  var MAX_TOP = 80;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var api = null, modal = null, rows = [], fechaTecla = null;

  // ---------- casar com matérias que já existem ----------
  var ROMANOS = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
  function chaveNome(n) {   // "Matéria II" = "MATERIA 2"
    return api.norm(n).replace(/[^a-z0-9]+/g, " ").trim().split(" ").map(function (w) { return ROMANOS[w] || w; }).join(" ");
  }
  var chaveCodigo = function (c) { return String(c || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
  function acha(nome, codigo) {
    var subs = api.subjects(), cc = chaveCodigo(codigo), cn = chaveNome(nome), i;
    if (cc.length >= 4) for (i = 0; i < subs.length; i++) if (chaveCodigo(subs[i].codigo) === cc) return subs[i];
    if (cn.length >= 3) for (i = 0; i < subs.length; i++) if (chaveNome(subs[i].name) === cn) return subs[i];
    return null;
  }
  function cursoLimpo(c) { return String(c || "").replace(/^[A-Z0-9]{3,}\s+-\s+/, "").replace(/\s+-\s+(integral|noturno|matutino|vespertino|diurno)\s*$/i, "").trim(); }

  // tópicos (texto da ementa) -> lista { title, group }; "# unidade" começa um grupo
  function linhas(texto) { return api.parseSyllabus(texto || ""); }
  function novosTopicos(existente, lista) {
    var tem = {}; (existente.syllabus || []).forEach(function (t) { tem[api.norm(t.title)] = 1; });
    return lista.filter(function (t) { if (tem[api.norm(t.title)]) return false; tem[api.norm(t.title)] = 1; return true; });
  }

  // ---------- interface ----------
  function estilo() {
    if ($("plCss")) return;
    var s = document.createElement("style"); s.id = "plCss";
    s.textContent = "#plBack .qz{max-width:760px;width:100%}.pl-rows{display:flex;flex-direction:column;gap:10px}.pl-row{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--card)}" +
      ".pl-row.off{opacity:.6}.pl-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pl-top input[type=checkbox]{width:auto;flex:none;margin:0}.pl-top input[type=text]{flex:1;min-width:180px;font:600 15px var(--body);padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink)}" +
      ".pl-badge{font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--ink)}.pl-badge.ex{background:var(--paper);border:1px solid var(--line)}" +
      ".pl-warn{font-size:13px;color:var(--late)}.pl-row textarea{width:100%;min-height:150px;font:13px var(--mono);padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);box-sizing:border-box}" +
      ".pl-drop{border:2px dashed var(--line);border-radius:12px;padding:18px;text-align:center}";
    document.head.appendChild(s);
  }
  function monta() {
    estilo();
    if (modal) return;
    modal = document.createElement("div"); modal.className = "qz-back"; modal.id = "plBack"; modal.hidden = true;
    modal.innerHTML = '<div class="qz" role="dialog" aria-modal="true" aria-labelledby="plTitle" id="plBox"></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) fecha(); });
  }
  function fecha() { if (!modal) return; modal.hidden = true; if (fechaTecla) { document.removeEventListener("keydown", fechaTecla); fechaTecla = null; } }

  function telaEscolher() {
    rows = [];
    $("plBox").innerHTML = '<div class="qz-head"><div><div class="eyebrow">Matérias</div><h2 id="plTitle">Ementas</h2></div><button class="btn small ghost" data-pl="fechar" type="button" aria-label="Fechar">✕</button></div>' +
      '<p class="plan" style="margin:0">Escolha os <b>Planos de Ensino</b> (PDF) das matérias que <b>você</b> cursa. O Cycle lê os arquivos aqui no seu aparelho, mostra o que achou e <b>só cria ou altera matérias depois que você confirmar</b>. O PDF não é guardado nem enviado a ninguém.</p>' +
      '<div class="pl-drop"><button class="btn primary" data-pl="escolher" type="button">Escolher PDFs</button><p class="plan" style="margin:8px 0 0">Pode escolher vários de uma vez.</p></div>' +
      '<p class="plan" id="plMsg" role="status" style="margin:0"></p>';
    var f = $("plBox").querySelector('[data-pl="escolher"]'); if (f) f.focus();
  }

  function lerArquivos(files) {
    var lista = Array.prototype.slice.call(files || []);
    if (!lista.length) return;
    $("plBox").innerHTML = '<div class="qz-head"><div><div class="eyebrow">Matérias</div><h2 id="plTitle">Ementas</h2></div></div><p class="plan" id="plProg" role="status">Lendo os PDFs…</p>';
    rows = [];
    var cadeia = Promise.resolve();
    lista.forEach(function (f, n) {
      cadeia = cadeia.then(function () {
        $("plProg").textContent = "Lendo " + (n + 1) + " de " + lista.length + ": " + f.name;
        if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { rows.push({ arquivo: f.name, erro: "Esse arquivo não é um PDF." }); return; }
        return window.__cycleEmenta.extract(f).then(function (e) { rows.push({ arquivo: f.name, r: window.__cycleEmenta.parsePlano(e.text), paginas: e.pages }); },
          function (err) { rows.push({ arquivo: f.name, erro: (err && err.code && err.message) || "Não consegui ler esse PDF." }); });
      });
    });
    cadeia.then(function () { preparaLinhas(); telaPrevia(); });
  }
  function preparaLinhas() {
    var vistos = {};
    rows.forEach(function (x) {
      if (x.erro) return;
      var r = x.r; x.nome = r.nome || x.arquivo.replace(/\.pdf$/i, ""); x.codigo = r.codigo || ""; x.texto = r.topicos || ""; x.inc = true;
      var chave = chaveCodigo(x.codigo) || chaveNome(x.nome);
      if (vistos[chave]) { x.inc = false; x.dup = true; } vistos[chave] = 1;
      if (!r.nome) x.inc = true;
    });
  }
  function resumoLinha(x) {
    var ex = acha(x.nome, x.codigo), partes = [];
    if (x.codigo) partes.push(esc(x.codigo));
    if (x.r.cargaHoraria) partes.push(x.r.cargaHoraria + " h");
    if (x.r.creditos) partes.push(x.r.creditos + " créditos");
    var lst = linhas(x.texto), novos = ex ? novosTopicos(ex, lst).length : lst.length;
    var w = [];
    if (x.dup) w.push("Outro arquivo deste lote é da mesma matéria: este ficou desmarcado.");
    x.r.avisos.forEach(function (a) { w.push(a.charAt(0).toUpperCase() + a.slice(1) + "."); });
    var sc = api.settings && api.settings().curso, cp = cursoLimpo(x.r.curso);
    if (sc && cp && api.norm(cp).indexOf(api.norm(sc)) < 0 && api.norm(sc).indexOf(api.norm(cp)) < 0) w.push("Este plano parece ser de outro curso (" + cp + ").");
    return { ex: ex, html: (ex ? '<span class="pl-badge ex">Já existe: ' + esc(ex.name) + "</span>" : '<span class="pl-badge">Nova</span>') +
      ' <span class="plan">' + partes.join(" · ") + "</span>", info: lst.length + " tópicos" + (ex ? " no arquivo · " + novos + " novo(s) para acrescentar" : "") + (lst.length > MAX_TOP ? " (só os primeiros " + MAX_TOP + " entram)" : ""), warn: w, novos: novos, total: lst.length };
  }
  function telaPrevia() {
    var ok = rows.filter(function (x) { return !x.erro; }).length;
    var h = '<div class="qz-head"><div><div class="eyebrow">Matérias</div><h2 id="plTitle">Confira antes de aplicar</h2></div><button class="btn small ghost" data-pl="fechar" type="button" aria-label="Fechar">✕</button></div>' +
      '<p class="plan" style="margin:0">' + ok + " de " + rows.length + " arquivo(s) lido(s). Desmarque o que não quer, corrija o nome ou a lista de tópicos (um por linha; <b>#</b> começa uma unidade). Nada foi criado ainda.</p>" +
      '<div class="pl-rows" id="plRows">' + rows.map(function (x, i) {
        if (x.erro) return '<div class="pl-row off"><div class="pl-top"><b>' + esc(x.arquivo) + '</b></div><div class="pl-warn" role="alert">' + esc(x.erro) + "</div></div>";
        return '<div class="pl-row ' + (x.inc ? "" : "off") + '" data-i="' + i + '"></div>';
      }).join("") + "</div>" +
      '<p class="plan" id="plMsg" role="status" style="margin:0"></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" data-pl="outros" type="button">Escolher outros</button><button class="btn" data-pl="fechar" type="button">Cancelar</button><button class="btn primary" data-pl="aplicar" type="button" id="plAplicar"></button></div>';
    $("plBox").innerHTML = h;
    rows.forEach(function (x, i) { if (!x.erro) desenhaLinha(i); });
    atualizaBotao();
    var p = $("plAplicar"); if (p && !p.disabled) p.focus();
  }
  function desenhaLinha(i) {
    var x = rows[i], el = $("plRows").querySelector('[data-i="' + i + '"]'), s = resumoLinha(x);
    var aberto = el.querySelector("details") && el.querySelector("details").open;
    el.className = "pl-row " + (x.inc ? "" : "off");
    el.innerHTML = '<div class="pl-top"><input type="checkbox" data-pl="inc" ' + (x.inc ? "checked" : "") + ' aria-label="Incluir ' + esc(x.nome) + '"><input type="text" data-pl="nome" value="' + esc(x.nome) + '" maxlength="120" aria-label="Nome da matéria"></div>' +
      '<div>' + s.html + "</div>" + s.warn.map(function (w) { return '<div class="pl-warn">' + esc(w) + "</div>"; }).join("") +
      '<details' + (aberto ? " open" : "") + '><summary>' + esc(s.info) + '</summary><textarea data-pl="topicos" spellcheck="false" aria-label="Tópicos de ' + esc(x.nome) + '">' + esc(x.texto) + "</textarea></details>" +
      '<div class="plan">Arquivo: ' + esc(x.arquivo) + "</div>";
  }
  function atualizaBotao() {
    var n = rows.filter(function (x) { return !x.erro && x.inc && x.nome.trim(); }).length, b = $("plAplicar");
    if (!b) return; b.textContent = n ? "Aplicar em " + n + " matéria" + (n > 1 ? "s" : "") : "Nada para aplicar"; b.disabled = !n;
  }

  // ---------- aplicar ----------
  function slug(n) { return api.norm(n).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || api.tid(); }
  function aplicar() {
    var db = api.db(); if (!db) { $("plMsg").textContent = "Sem banco de dados neste modo."; return Promise.resolve(); }
    var b = $("plAplicar"); b.disabled = true; b.textContent = "Aplicando…";
    var criadas = 0, mescladas = 0, topicos = 0, iguais = 0, ordem = api.subjects().length, usados = {};
    var cadeia = Promise.resolve();
    rows.filter(function (x) { return !x.erro && x.inc && x.nome.trim(); }).forEach(function (x) {
      cadeia = cadeia.then(function () {
        var nome = x.nome.trim(), ex = acha(nome, x.codigo), lst = linhas(x.texto).slice(0, MAX_TOP), r = x.r;
        var plano = { importadoEm: api.today(), origem: "pdf" }; if (r.criterios) plano.criterios = r.criterios; if (r.bibliografia) plano.bibliografia = r.bibliografia;
        if (ex) {   // mesclar: só o que falta; tópicos já existentes (e vistos) ficam como estão
          var add = novosTopicos(ex, lst), patch = {};
          if (add.length) patch.syllabus = (ex.syllabus || []).map(function (t) { return Object.assign({}, t); }).concat(add.map(function (t) { return { id: api.tid(), title: t.title, group: t.group, seenOn: null, mode: null, contentId: null }; }));
          if (x.codigo && !ex.codigo) patch.codigo = x.codigo;
          if (r.cargaHoraria && !ex.cargaHoraria) patch.cargaHoraria = r.cargaHoraria;
          if (r.creditos && !ex.creditos) patch.creditos = r.creditos;
          if (!ex.plano) patch.plano = plano; else { var p2 = Object.assign({}, ex.plano), mud = false; ["criterios", "bibliografia"].forEach(function (k) { if (plano[k] && !p2[k]) { p2[k] = plano[k]; mud = true; } }); if (mud) patch.plano = p2; }
          if (!Object.keys(patch).length) { iguais++; return; }
          mescladas++; topicos += add.length;
          return db.doc("subjects/" + ex.id).update(patch);
        }
        var id = "pl-" + slug(nome); while (usados[id] || api.subjects().some(function (s) { return s.id === id; })) id += "-" + api.tid().slice(0, 3);
        usados[id] = 1;
        var doc = { name: nome, color: api.palette[(ordem) % api.palette.length], order: ordem++, plano: plano,
          syllabus: lst.map(function (t) { return { id: api.tid(), title: t.title, group: t.group, seenOn: null, mode: null, contentId: null }; }) };
        if (x.codigo) doc.codigo = x.codigo; if (r.cargaHoraria) doc.cargaHoraria = r.cargaHoraria; if (r.creditos) doc.creditos = r.creditos;
        criadas++; topicos += lst.length;
        return db.doc("subjects/" + id).set(doc);
      });
    });
    return cadeia.then(function () {
      if (topicos) api.patchPlanStart();
      api.dispensaConvite();
      var m = [];
      if (criadas) m.push(criadas + " matéria" + (criadas > 1 ? "s criada" + "s" : " criada"));
      if (mescladas) m.push(mescladas + " atualizada" + (mescladas > 1 ? "s" : "") + " (só o que faltava)");
      if (iguais) m.push(iguais + " já estava" + (iguais > 1 ? "m" : "") + " igual");
      api.toast((m.join(", ") || "Nada mudou") + (topicos ? " · " + topicos + " tópicos novos." : "."));
      fecha();
    }, function (e) { b.disabled = false; b.textContent = "Tentar de novo"; $("plMsg").textContent = "Não consegui salvar: " + ((e && e.message) || e); });
  }

  // ---------- eventos ----------
  function eventos() {
    var box = $("plBox"); if (box._ok) return; box._ok = true;
    var arq = document.createElement("input"); arq.type = "file"; arq.accept = "application/pdf,.pdf"; arq.multiple = true; arq.hidden = true; arq.id = "plFile"; arq.setAttribute("aria-label", "Escolher planos de ensino em PDF");
    document.body.appendChild(arq);
    arq.addEventListener("change", function () { var f = arq.files; var l = Array.prototype.slice.call(f); arq.value = ""; lerArquivos(l); });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-pl]"); if (!b) return; var k = b.dataset.pl;
      if (k === "fechar") fecha(); else if (k === "escolher" || k === "outros") arq.click(); else if (k === "aplicar") aplicar();
    });
    box.addEventListener("input", function (e) {
      var t = e.target, row = t.closest && t.closest("[data-i]"); if (!row) return; var x = rows[+row.dataset.i];
      if (t.dataset.pl === "nome") { x.nome = t.value; var s = resumoLinha(x); row.children[1].innerHTML = s.html; atualizaBotao(); }
      else if (t.dataset.pl === "topicos") { x.texto = t.value; var s2 = resumoLinha(x); row.querySelector("summary").textContent = s2.info; }
    });
    box.addEventListener("change", function (e) {
      var t = e.target; if (t.dataset.pl !== "inc") return; var row = t.closest("[data-i]"), x = rows[+row.dataset.i];
      x.inc = t.checked; row.classList.toggle("off", !x.inc); atualizaBotao();
    });
  }

  function open(a) {
    api = a; monta(); eventos(); telaEscolher();
    modal.hidden = false;
    if (!fechaTecla) { fechaTecla = function (e) { if (e.key === "Escape") fecha(); }; document.addEventListener("keydown", fechaTecla); }
  }
  window.__cyclePlanos = { open: open, _t: { chaveNome: function (n) { return chaveNome(n); }, acha: acha, setApi: function (a) { api = a; } } };
})();
