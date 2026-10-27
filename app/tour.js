/* Cycle: tour guiado por todas as abas (só explica, não altera nenhum dado).
   Abre cada página, destaca o item do menu e mostra um cartão curto com o essencial. */
(function () {
  if (window.__cycleTour) return;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  var PASSOS = [
    { tab: null, titulo: "Bem-vindo ao Cycle", texto: "O Cycle organiza os seus estudos em 7 abas. Este tour passa por cada uma em cerca de 1 minuto.",
      pontos: ["Estudou algo? Ele agenda as revisões nos dias certos.", "Seus dados ficam no aparelho e, com a sua conta, sincronizam sozinhos pela nuvem.", "Use as setas do teclado ou os botões abaixo. Esc fecha o tour."] },
    { tab: "hoje", titulo: "Agenda: a sua semana", texto: "A página inicial mostra a semana inteira de uma vez.",
      pontos: ["Aulas, compromissos importados do Google e provas, nos dias e horários.", "Na linha \"a fazer\": revisões e entregas do dia. Toque no ✓ para concluir ali mesmo.", "Em Lista ou Semana, com cor fixa por tipo: aula, prova, trabalho e compromisso. O botão Fim de semestre começa outro."] },
    { tab: "revisoes", titulo: "Hoje: o que fazer agora", texto: "É aqui que você registra o conteúdo do dia.",
      pontos: ["Ao registrar, o Cycle cria revisões em 1, 3, 7, 14 e 30 dias (dá para ajustar).", "Veja tudo em lista, quadro ou calendário, com filtros.", "Trabalhos também ficam aqui, com subtarefas. O painel de hoje e o botão + Nova revisão também."] },
    { tab: "materias", titulo: "Matérias: ementa, aulas e anotações", texto: "Cada matéria tem a sua página.",
      pontos: ["Ementa: cole os tópicos, importe de PDF ou peça a uma IA gratuita.", "Horários de aula: o Cycle prevê qual tópico cai em cada aula.", "Anotações, meta semanal e o botão grande para voltar à lista."] },
    { tab: "provas", titulo: "Provas: datas e preparo", texto: "Reúne o que falta para chegar bem às provas.",
      pontos: ["Cadastre P1, P2, P3 e Sub com data e horário.", "As revisões se aproximam da prova quando ela está perto.", "Provas vindas do Google Agenda entram sozinhas."] },
    { tab: "notas", titulo: "Notas: média e quanto falta", texto: "Acompanhe o desempenho matéria por matéria.",
      pontos: ["Defina avaliações e pesos (a Sub entra no cálculo).", "O app mostra a média e quanto você precisa tirar para passar.", "\"E se…\" simula notas sem gravar nada."] },
    { tab: "tempo", titulo: "Metas: horas e cronômetro", texto: "O cronômetro vive aqui e vira estatística.",
      pontos: ["Horas por matéria na semana e por dia (só o tempo com o cronômetro rodando).", "Meta semanal por matéria, com quanto falta.", "Esqueceu de ligar o cronômetro? Dá para lançar os minutos."] },
    { tab: "dados", titulo: "Dados e backup: o que entra e sai do Cycle", texto: "Tudo o que entra e sai do Cycle passa por aqui.",
      pontos: ["Passar dados entre aparelhos da mesma conta, sem internet, por QR ou código.", "Backup e restauração dos dados.", "Importar e exportar a agenda (.ics) fica na página Agenda."] },
    { tab: null, fim: true, titulo: "Pronto!", texto: "Você já conhece o mapa do Cycle.",
      pontos: ["Ctrl+K abre a busca de tudo.", "O botão Tour, no topo, refaz este passeio quando quiser.", "O tutorial completo explica cada detalhe."] }
  ];
  var NO_MAIS = { notas: 1, tempo: 1, dados: 1 };

  var card = null, S = null, hl = null, i = 0;
  function estilo() {
    if ($("#tourCss")) return;
    var st = document.createElement("style"); st.id = "tourCss";
    st.textContent =
      "#tourCard{position:fixed;z-index:70;right:16px;bottom:16px;width:min(400px,calc(100vw - 32px));background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:16px 18px;display:flex;flex-direction:column;gap:10px}" +
      "#tourCard .tr-n{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      "#tourCard h3{margin:0;font-size:18px;line-height:1.25}#tourCard p{margin:0;color:var(--muted);font-size:14px}" +
      "#tourCard ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;font-size:14px}" +
      "#tourCard .tr-b{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-top:2px}#tourCard .tr-b div{display:flex;gap:8px}" +
      "#tourCard .tr-dots{display:flex;gap:4px;flex-wrap:wrap}#tourCard .tr-dots i{width:7px;height:7px;border-radius:50%;background:var(--line)}#tourCard .tr-dots i.on{background:var(--accent)}" +
      ".tour-hl{outline:3px solid var(--accent)!important;outline-offset:2px;border-radius:10px;animation:tourpulse 1.4s ease-in-out infinite}@keyframes tourpulse{50%{outline-color:transparent}}" +
      "@media (max-width:760px){#tourCard{right:12px;left:12px;width:auto;bottom:calc(var(--bnav-h,76px) + 10px + env(safe-area-inset-bottom,0px));max-height:52vh;overflow:auto}}";
    document.head.appendChild(st);
  }
  function alvo(p) {                                           // item do menu que corresponde à aba (menu lateral ou barra de baixo)
    if (!p.tab) return null;
    var lateral = $(".side"), lateralVisivel = lateral && lateral.offsetParent !== null;
    if (lateralVisivel) return $('.side-nav [data-nav="' + p.tab + '"]');
    return NO_MAIS[p.tab] ? $("#moreBtn") : $('.bnav .b-item[data-nav="' + p.tab + '"]');
  }
  function mostrar() {
    var p = PASSOS[i], n = PASSOS.length;
    if (hl) { hl.classList.remove("tour-hl"); hl = null; }
    if (p.tab) S.setTab(p.tab);
    var el = alvo(p); if (el) { el.classList.add("tour-hl"); hl = el; }
    var mais = p.tab && NO_MAIS[p.tab] && !($(".side") && $(".side").offsetParent !== null) ? '<p>No celular, esta aba fica no botão <b>Mais</b>.</p>' : "";
    card.innerHTML =
      '<div class="tr-n"><span>Passo ' + (i + 1) + " de " + n + '</span><button class="btn small ghost" data-tr="x" type="button" aria-label="Fechar o tour">✕</button></div>' +
      "<h3>" + esc(p.titulo) + "</h3><p>" + esc(p.texto) + "</p>" +
      "<ul>" + p.pontos.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" + mais +
      '<div class="tr-dots" aria-hidden="true">' + PASSOS.map(function (_, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("") + "</div>" +
      '<div class="tr-b"><button class="btn small ghost" data-tr="x" type="button">' + (p.fim ? "Fechar" : "Pular tour") + "</button><div>" +
        (i > 0 ? '<button class="btn small" data-tr="b" type="button">Voltar</button>' : "") +
        (p.fim ? '<a class="btn small" href="ajuda.html" target="_blank" rel="noopener">Tutorial completo</a><button class="btn small primary" data-tr="x" type="button">Concluir</button>'
               : '<button class="btn small primary" data-tr="n" type="button">' + (i === 0 ? "Começar" : "Próximo") + "</button>") +
      "</div></div>";
    var b = card.querySelector('[data-tr="n"],[data-tr="x"].primary'); if (b) b.focus({ preventScroll: true });
  }
  function fim(concluido) {
    if (hl) hl.classList.remove("tour-hl"); hl = null;
    if (card) { card.remove(); card = null; }
    document.removeEventListener("keydown", tecla, true);
    try { localStorage.setItem("cycle.tour", "feito"); } catch (e) {}
    if (S && S.voltarPara) S.setTab(S.voltarPara);
    if (S && S.onEnd) S.onEnd(concluido);
  }
  function tecla(e) {
    if (!card) return;
    if (e.key === "Escape") { e.preventDefault(); fim(false); }
    else if (e.key === "ArrowRight" && i < PASSOS.length - 1) { e.preventDefault(); i++; mostrar(); }
    else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); i--; mostrar(); }
  }
  function start(opts) {                                       // opts: { setTab(aba), voltarPara, onEnd(concluido) }
    estilo(); if (card) card.remove();
    S = opts; i = 0;
    card = document.createElement("div"); card.id = "tourCard"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Tour do Cycle");
    card.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tr]"); if (!b) return;
      var k = b.dataset.tr;
      if (k === "n") { i++; mostrar(); } else if (k === "b") { i--; mostrar(); } else if (k === "x") fim(i === PASSOS.length - 1);
    });
    document.body.appendChild(card);
    document.addEventListener("keydown", tecla, true);
    mostrar();
  }
  window.__cycleTour = { start: start, passos: PASSOS.length };
})();
