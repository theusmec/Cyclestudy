/* Cycle: página inicial. Sem bibliotecas. Abas, animações, interações e o formulário de candidatura a Cycler. Spec: SPEC-pagina-inicial.md */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  root.classList.add("js");
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var reduce = mq.matches;
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  root.dataset.motion = reduce ? "reduce" : "full";
  var NS = "http://www.w3.org/2000/svg";
  var el = function (tag, attrs, parent) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

  // ---------- abas ----------
  var TABS = ["ideia", "objetivo", "donos", "cycler"], atual = "ideia";
  var barra = $("#tabBar");
  function posBarra() {
    var t = $('[data-tab="' + atual + '"]'); if (!t || !barra) return;
    barra.style.width = (t.offsetWidth - 28) + "px";
    barra.style.transform = "translateX(" + (t.offsetLeft + 14) + "px)";
  }
  function mostra(nome, deHash) {
    if (TABS.indexOf(nome) < 0) nome = "ideia";
    atual = nome;
    $$("[data-panel]").forEach(function (p) { p.hidden = p.dataset.panel !== nome; });
    $$("[data-tab]").forEach(function (b) { var on = b.dataset.tab === nome; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    posBarra();
    var ativo = $('[data-tab="' + nome + '"]'); if (ativo && ativo.scrollIntoView) { try { ativo.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
    if (!deHash && location.hash !== "#" + nome) { try { history.replaceState(null, "", "#" + nome); } catch (e) { location.hash = nome; } }
    window.scrollTo(0, 0);
    document.title = (nome === "ideia" ? "Cycle" : $('[data-tab="' + nome + '"]').textContent + " · Cycle") + " — estude com método, revise na hora certa";
    observa(); if (nome === "objetivo") { contaNumeros(); giraFrase(true); } else giraFrase(false);
  }
  $$("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { mostra(b.dataset.tab); });
    b.addEventListener("keydown", function (e) {
      var i = TABS.indexOf(atual), n = null;
      if (e.key === "ArrowRight") n = TABS[(i + 1) % TABS.length]; else if (e.key === "ArrowLeft") n = TABS[(i + TABS.length - 1) % TABS.length];
      else if (e.key === "Home") n = TABS[0]; else if (e.key === "End") n = TABS[TABS.length - 1];
      if (n) { e.preventDefault(); mostra(n); $('[data-tab="' + n + '"]').focus(); }
    });
  });
  $$("[data-go]").forEach(function (b) { b.addEventListener("click", function () { mostra(b.dataset.go); }); });
  $("#brand").addEventListener("click", function (e) { e.preventDefault(); mostra("ideia"); });
  window.addEventListener("hashchange", function () { var h = location.hash.replace("#", ""); if (TABS.indexOf(h) >= 0 && h !== atual) mostra(h, true); });
  window.addEventListener("resize", posBarra);

  // ---------- marca: animação ao tocar (no mouse e no foco o CSS já cuida) ----------
  var marca = $("#brand");
  marca.addEventListener("pointerdown", function (e) { if (e.pointerType === "touch") { marca.classList.add("tap"); setTimeout(function () { marca.classList.remove("tap"); }, 1500); } });

  // ---------- revelar ao rolar ----------
  var io = null;
  function observa() {
    var alvos = $$("[data-reveal]:not(.in)");
    if (reduce || !("IntersectionObserver" in window)) { alvos.forEach(function (n) { n.classList.add("in"); }); return; }
    if (!io) io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: 0.12 });
    alvos.forEach(function (n, i) { n.style.transitionDelay = (i % 4) * 70 + "ms"; io.observe(n); });
  }

  // ---------- números que sobem ----------
  var contados = false;
  function contaNumeros() {
    if (contados) return; contados = true;
    $$(".num[data-to]").forEach(function (n) {
      var to = +n.dataset.to, pre = n.dataset.pre || "", suf = n.dataset.suf || "";
      if (reduce || !to) { n.textContent = pre + to + suf; return; }
      var t0 = null, dur = 1300;
      (function passo(t) { if (t0 == null) t0 = t; var p = Math.min(1, (t - t0) / dur); n.textContent = pre + Math.round(to * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(passo); })(performance.now());
    });
  }

  // ---------- frases ----------
  var FRASES = ["Constância vence intensidade.", "Estudar é um ciclo, não uma maratona.", "Revisar hoje é lembrar amanhã.", "Pequenos blocos, grande diferença.", "Quem estuda com método não depende de sorte.", "Fazer a diferença começa em fazer a sua parte."];
  var fi = 0, ft = null, caixa = $("#quote");
  function proximaFrase() { var q = caixa.parentNode; if (reduce) { fi = (fi + 1) % FRASES.length; caixa.textContent = FRASES[fi]; return; } q.classList.add("sw"); setTimeout(function () { fi = (fi + 1) % FRASES.length; caixa.textContent = FRASES[fi]; q.classList.remove("sw"); }, 300); }
  function giraFrase(liga) { clearInterval(ft); if (liga && !reduce) ft = setInterval(proximaFrase, 7000); }
  caixa.parentNode.addEventListener("click", proximaFrase);

  // ---------- cartões que inclinam e brilho do cursor ----------
  if (!reduce && !coarse) {
    $$(".tilt").forEach(function (c) {
      c.addEventListener("pointermove", function (e) { var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; c.style.setProperty("--ry", (x * 8).toFixed(2) + "deg"); c.style.setProperty("--rx", (-y * 8).toFixed(2) + "deg"); });
      c.addEventListener("pointerleave", function () { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
    });
    var g = $("#glow");
    window.addEventListener("pointermove", function (e) { g.classList.add("on"); g.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, { passive: true });
    document.addEventListener("pointerleave", function () { g.classList.remove("on"); });
  }

  // ---------- órbita do ciclo ----------
  var PONTOS = [["D0", "Hoje você estudou. O ciclo começa aqui."], ["1d", "1 dia depois: a primeira revisão, rápida, logo no começo da queda."], ["3d", "3 dias depois: a lembrança já aguenta mais tempo sozinha."], ["7d", "7 dias depois: o intervalo entre revisões pode crescer."], ["14d", "14 dias depois: revisar custa pouco esforço."], ["30d", "30 dias depois: o conteúdo virou parte do que você sabe."]];
  var gNos = $("#orbitNodes"), cap = $("#orbitCap"), nos = [], pulso = 0, tocou = false;
  PONTOS.forEach(function (p, i) {
    var a = (-90 + i * 60) * Math.PI / 180, x = 200 + 150 * Math.cos(a), y = 200 + 150 * Math.sin(a);
    var g = el("g", { "class": "node", tabindex: 0, role: "button", "aria-label": p[0] + ": " + p[1] }, gNos);
    el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 22 }, g); var t = el("text", { x: x.toFixed(1), y: y.toFixed(1) }, g); t.textContent = p[0];
    var abre = function () { tocou = true; nos.forEach(function (n) { n.classList.remove("on", "pulse"); }); g.classList.add("on"); cap.textContent = p[1]; };
    g.addEventListener("click", abre); g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abre(); } });
    nos.push(g);
  });
  if (!reduce) setInterval(function () { if (tocou || document.hidden) return; nos.forEach(function (n) { n.classList.remove("pulse"); }); nos[pulso % nos.length].classList.add("pulse"); pulso++; }, 2400);

  // ---------- laboratório da curva do esquecimento ----------
  var cv = $("#curve"), xs = [40, 144, 248, 352, 456, 560], fim = 592, topo = 26, fundo = [132, 112, 96, 84, 74, 66], segs = [], dots = [];
  var ROT = ["Estudou hoje. Sem revisar, a lembrança cai rápido.", "Revisão de 1 dia: a lembrança volta ao topo e passa a cair mais devagar.", "Revisão de 3 dias: a queda fica ainda mais suave.", "Revisão de 7 dias: o intervalo entre as revisões já pode crescer.", "Revisão de 14 dias: lembrar custa cada vez menos esforço.", "Revisão de 30 dias: o conteúdo está consolidado. É por isso que o Cycle agenda assim."];
  el("line", { x1: 30, y1: 160, x2: 596, y2: 160, "class": "cv-axis" }, cv); el("line", { x1: 30, y1: 14, x2: 30, y2: 160, "class": "cv-axis" }, cv);
  var sem = el("path", { d: "M40 " + topo + " C 110 150, 250 156, " + fim + " 156", "class": "cv-seg dim on", style: "--len:700" }, cv);
  PONTOS.forEach(function (p, i) { var t = el("text", { x: xs[i], y: 180, "class": "cv-lbl", "text-anchor": "middle" }, cv); t.textContent = p[0]; });
  xs.forEach(function (x, i) {
    var x2 = i < 5 ? xs[i + 1] - 4 : fim, d = "M" + x + " " + topo + " C " + (x + (x2 - x) * .25) + " " + (fundo[i] - 6) + ", " + (x + (x2 - x) * .6) + " " + (fundo[i]) + ", " + x2 + " " + fundo[i];
    if (i < 5) d += " L " + xs[i + 1] + " " + topo;
    var p = el("path", { d: d, "class": "cv-seg" }, cv); var len = Math.ceil(p.getTotalLength ? p.getTotalLength() : 300); p.style.setProperty("--len", len); segs.push(p);
    dots.push(el("circle", { cx: x, cy: topo, r: 5, "class": "cv-dot" }, cv));
  });
  var linha = $("#revRow"), sub = $("#readout"), botoes = [];
  function curva(k) {
    segs.forEach(function (s, i) { s.classList.toggle("on", i <= k); }); dots.forEach(function (d, i) { d.classList.toggle("on", i <= k); });
    botoes.forEach(function (b, i) { b.setAttribute("aria-pressed", i === k); }); sub.textContent = ROT[k];
  }
  ["Só estudar", "1 dia", "3 dias", "7 dias", "14 dias", "30 dias"].forEach(function (nome, k) {
    var b = document.createElement("button"); b.type = "button"; b.textContent = nome; b.setAttribute("aria-pressed", k === 0); b.addEventListener("click", function () { curva(k); }); linha.appendChild(b); botoes.push(b);
  });
  curva(0);

  // ---------- fundo: partículas ----------
  var cvs = $("#bg"), ctx = cvs.getContext && cvs.getContext("2d"), W = 0, H = 0, P = [], mouse = { x: -999, y: -999 }, raf = 0;
  function medir() {
    var dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cvs.width = W * dpr; cvs.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.min(70, Math.floor(W * H / 24000)); P = [];
    for (var i = 0; i < n; i++) P.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25 });
    desenha();
  }
  function desenha() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < P.length; i++) {
      var a = P[i];
      for (var j = i + 1; j < P.length; j++) { var b = P[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy; if (d < 16000) { ctx.strokeStyle = "rgba(91,192,235," + (0.16 * (1 - d / 16000)).toFixed(3) + ")"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
      ctx.fillStyle = "rgba(224,162,27,.55)"; ctx.beginPath(); ctx.arc(a.x, a.y, 1.6, 0, 6.283); ctx.fill();
    }
  }
  function passo() {
    for (var i = 0; i < P.length; i++) {
      var p = P[i], dx = p.x - mouse.x, dy = p.y - mouse.y, d = dx * dx + dy * dy;
      if (d < 19600 && d > 1) { var f = (1 - d / 19600) * .6; p.vx += dx / Math.sqrt(d) * f * .08; p.vy += dy / Math.sqrt(d) * f * .08; }
      p.vx *= .995; p.vy *= .995; p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
    }
    desenha(); raf = requestAnimationFrame(passo);
  }
  if (ctx) {
    medir(); var rt = 0; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(medir, 200); });
    if (!reduce) {
      window.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
      raf = requestAnimationFrame(passo);
      document.addEventListener("visibilitychange", function () { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(passo); });
    }
  }

  // ---------- formulário de candidatura ----------
  var CF = window.CYCLER_FORM || {}, form = $("#form"), erro = $("#err"), enviar = $("#send"), t0 = 0, ULT = "cycler.ultimo", ESPERA = 6 * 3600 * 1000;
  var ok = !!(CF.url && CF.campos && CF.campos.email);
  if (!ok) { enviar.disabled = true; $("#soonmsg").hidden = false; }
  $("#f-motivo").addEventListener("input", function () { $("#count").textContent = this.value.length + " / 600"; });
  form.addEventListener("focusin", function () { if (!t0) t0 = Date.now(); });
  function ruim(id, msg) { var f = $("#" + id).closest(".fld"); if (f) f.classList.add("bad"); erro.textContent = msg; $("#" + id).focus(); return false; }
  form.addEventListener("input", function (e) { var f = e.target.closest && e.target.closest(".fld"); if (f) f.classList.remove("bad"); });
  function confete() {
    if (reduce || !ctx) return; var q = [], i; for (i = 0; i < 60; i++) q.push({ x: W / 2, y: H / 2, vx: (Math.random() - .5) * 12, vy: (Math.random() - .9) * 11, c: i % 2 ? "224,162,27" : "91,192,235", l: 70 });
    (function f() { ctx.clearRect(0, 0, W, H); var vivo = false; q.forEach(function (p) { if (p.l-- > 0) { vivo = true; p.vy += .25; p.x += p.vx; p.y += p.vy; ctx.fillStyle = "rgba(" + p.c + "," + Math.max(0, p.l / 70) + ")"; ctx.fillRect(p.x, p.y, 5, 5); } }); if (vivo) requestAnimationFrame(f); })();
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault(); erro.textContent = ""; $$(".fld.bad").forEach(function (f) { f.classList.remove("bad"); });
    if (!ok) return;
    if ($("#f-site").value) return;   // armadilha para robôs: um humano nunca vê este campo
    var nome = $("#f-nome").value.trim(), email = $("#f-email").value.trim(), curso = $("#f-curso").value.trim(), motivo = $("#f-motivo").value.trim();
    if (nome.length < 2) return ruim("f-nome", "Diga o seu nome.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return ruim("f-email", "Esse e-mail não parece válido.");
    if (motivo.length < 20) return ruim("f-motivo", "Conte um pouco mais (pelo menos 20 caracteres).");
    if (!$("#f-ok").checked) { erro.textContent = "Marque a caixa de consentimento para enviar."; $("#f-ok").focus(); return; }
    if (t0 && Date.now() - t0 < 3000) { erro.textContent = "Calma: releia e tente enviar de novo em instantes."; return; }
    var ultimo = 0; try { ultimo = +localStorage.getItem(ULT) || 0; } catch (x) {}
    if (ultimo && Date.now() - ultimo < ESPERA) { erro.textContent = "Você já enviou um pedido há pouco. Eu já recebi, é só aguardar."; return; }
    enviar.disabled = true; enviar.textContent = "Enviando…";
    var body = new URLSearchParams(); body.set(CF.campos.nome, nome); body.set(CF.campos.email, email); if (CF.campos.curso) body.set(CF.campos.curso, curso); body.set(CF.campos.motivo, motivo);
    fetch(CF.url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }).then(function () {
      try { localStorage.setItem(ULT, String(Date.now())); } catch (x) {}
      form.hidden = true; $("#done").hidden = false; confete(); $("#done").scrollIntoView({ block: "center" });
    }, function () { erro.textContent = "Não consegui enviar agora. Confira a internet e tente de novo."; enviar.disabled = false; enviar.textContent = "Enviar meu pedido"; });
  });

  // ---------- início ----------
  mostra(location.hash.replace("#", ""), true);
  window.addEventListener("load", posBarra);
})();
