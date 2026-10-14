/* Cycle: usar um chat de IA gratuito (ChatGPT, Gemini, Claude...) SEM chave e SEM custo.
   O Cycle monta o pedido pronto, copia e abre o chat; a pessoa cola a resposta de volta e o Cycle a transforma em ementa
   ou em critérios de avaliação. Nada é enviado pelo Cycle: quem manda o texto ao chat é a própria pessoa. */
(function () {
  if (window.__cycleIA) return;
  var SITES = [
    { id: "chatgpt", nome: "ChatGPT", url: "https://chatgpt.com/" },
    { id: "gemini", nome: "Gemini", url: "https://gemini.google.com/app" },
    { id: "claude", nome: "Claude", url: "https://claude.ai/new" }
  ];
  var MAXTXT = 14000;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fail = function (msg) { var e = new Error(msg); e.code = "ia"; return e; };

  // ---------- pedidos ----------
  function fonte(texto) {
    return texto ? 'Texto do documento (copiado do PDF):\n"""\n' + texto + '\n"""' : "O documento está no PDF anexado a esta conversa. Leia o PDF antes de responder.";
  }
  function promptEmenta(nome, texto) {
    return 'Tarefa: montar a lista de tópicos do conteúdo programático da disciplina' + (nome ? ' "' + nome + '"' : "") + ', na ordem em que as aulas acontecem.\n\n' +
      fonte(texto) + "\n\n" +
      "Responda SOMENTE com a lista, dentro de um único bloco de código, neste formato:\n" +
      "# Nome da unidade\nTópico\nTópico\n# Outra unidade\nTópico\n\n" +
      "Regras:\n" +
      "1. Um tópico por linha, curto (até 12 palavras), sem numeração, sem marcadores e sem negrito.\n" +
      '2. Linhas que começam com "# " são títulos de unidade, capítulo ou módulo. Use só se o documento tiver essa divisão.\n' +
      "3. Não inclua bibliografia, avaliação, objetivos, carga horária, horários nem comentários.\n" +
      "4. Não escreva nada antes nem depois do bloco de código.\n" +
      "5. Se o documento não tiver conteúdo programático, responda exatamente: SEM CONTEUDO";
  }
  function promptAvaliacao(nome, texto) {
    return 'Tarefa: extrair os critérios de avaliação da disciplina' + (nome ? ' "' + nome + '"' : "") + ".\n\n" +
      fonte(texto) + "\n\n" +
      "Responda SOMENTE com linhas neste formato, dentro de um único bloco de código:\n" +
      "Nome | peso | tipo\n\n" +
      "Regras:\n" +
      "1. Nome: como aparece no documento (P1, P2, Trabalhos, Seminário, Prova substitutiva...).\n" +
      "2. peso: um número (percentual ou fração). Use a mesma escala em todas as linhas. A prova substitutiva tem peso 0.\n" +
      "3. tipo: escreva prova, trabalho ou sub (sub = prova substitutiva).\n" +
      "4. Se houver nota mínima para aprovação, acrescente uma última linha: MINIMA | 5 (troque 5 pela nota).\n" +
      "5. Não escreva nada antes nem depois do bloco de código.\n" +
      "6. Se o documento não tiver critério de avaliação, responda exatamente: SEM CRITERIO\n\n" +
      "Exemplo:\nP1 | 40 | prova\nP2 | 40 | prova\nTrabalhos | 20 | trabalho\nSub | 0 | sub\nMINIMA | 5";
  }

  // ---------- respostas ----------
  function corpo(reply) {                                  // pega o conteúdo do bloco de código; sem bloco, usa a resposta toda
    var t = String(reply || "").replace(/\r/g, "");
    var m = /```[^\n]*\n([\s\S]*?)```/.exec(t);
    return (m ? m[1] : t.replace(/```[^\n]*\n?/g, "")).trim();
  }
  function parseEmenta(reply) {
    var t = corpo(reply);
    if (/^\s*SEM CONTEUDO\s*$/i.test(t) || /SEM CONTE[ÚU]DO/i.test(t) && t.length < 40) throw fail("A IA não achou conteúdo programático nesse documento.");
    var lines = t.split("\n").map(function (l) {
      return l.replace(/\*\*|__|`/g, "").replace(/^\s*#{1,6}\s*/, "# ").replace(/^\s*(?:[-•*]|\d{1,2}[.)])\s+/, "").replace(/\s+$/, "");
    }).filter(function (l) { return l.trim(); });
    if (!lines.length) throw fail("A resposta veio vazia. Cole a resposta da IA inteira.");
    // linhas de conversa que a IA às vezes coloca antes da lista
    lines = lines.filter(function (l, i) { return !(i === 0 && /^(aqui|segue|claro|certo|ok|com base|abaixo)\b.*[:.]$/i.test(l.trim())); });
    var topics = lines.filter(function (l) { return !/^#\s/.test(l); }).length;
    if (!topics) throw fail("Não achei tópicos nessa resposta.");
    if (topics < 2) throw fail("Só achei 1 tópico. Cole a lista inteira que a IA devolveu (um tópico por linha).");
    return { text: lines.join("\n"), topics: topics, units: lines.length - topics };
  }
  function parseAvaliacao(reply) {
    var t = corpo(reply);
    if (/SEM CRIT[ÉE]RIO/i.test(t) && t.length < 40) throw fail("A IA não achou critério de avaliação nesse documento.");
    var itens = [], minima = null;
    t.split("\n").forEach(function (l) {
      l = l.replace(/\*\*|__|`/g, "").replace(/^\s*[-•*]\s*/, "").trim(); if (!l) return;
      var p = l.split(/\s*[|;\t]\s*/);
      if (/^m[ií]nima$/i.test(p[0]) && p[1]) { var m = parseFloat(String(p[1]).replace(",", ".")); if (m > 0 && m <= 10) minima = m; return; }
      if (p.length < 2) return;
      var peso = parseFloat(String(p[1]).replace("%", "").replace(",", "."));
      if (!(peso >= 0)) return;
      var tp = (p[2] || "").toLowerCase(), nome = p[0].trim();
      var tipo = /^sub/.test(tp) || /substitutiva|^sub\b/i.test(nome) ? "sub" : /^trab/.test(tp) ? "trabalho" : tp === "prova" ? "prova" : /trab|semin|relat|lista|projeto/i.test(nome) ? "trabalho" : "prova";
      itens.push({ nome: nome.slice(0, 40), tipo: tipo, peso: tipo === "sub" ? 0 : peso });
    });
    if (!itens.length) throw fail("Não achei avaliações nessa resposta. Confira o formato: Nome | peso | tipo.");
    return { itens: itens.slice(0, 20), minima: minima };
  }

  // ---------- janela ----------
  var modal = null, C = null, texto = "";
  function build() {
    if (modal) return;
    var st = document.createElement("style");
    st.textContent = "#iaBack{z-index:62}.ia-sec{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:12px}.ia-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ia-n{display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--ink);color:var(--paper);align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none}.ia-h{display:flex;gap:8px;align-items:center;font-weight:700}.ia-ok{color:var(--ok);font-weight:600}.ia-bad{color:var(--late)}#iaReply,#iaPrompt{font-family:var(--mono);font-size:12px;min-height:110px}";
    document.head.appendChild(st);
    modal = document.createElement("div"); modal.className = "qz-back"; modal.id = "iaBack"; modal.hidden = true;
    modal.innerHTML =
      '<div class="qz" role="dialog" aria-modal="true" aria-labelledby="iaTitle">' +
      '<div class="qz-head"><div><div class="eyebrow">IA gratuita, sem chave</div><h2 id="iaTitle"></h2></div><button class="btn small ghost" data-ia="close" type="button" aria-label="Fechar">✕</button></div>' +
      '<p class="plan" style="margin:0">O Cycle monta o pedido e abre o chat que você já usa (ChatGPT, Gemini ou Claude). Você cola a resposta de volta aqui. <b>Quem envia o texto ao chat é você</b>, então ele fica sujeito às regras desse chat: use só documentos que você pode compartilhar.</p>' +
      '<div class="ia-sec"><div class="ia-h"><span class="ia-n">1</span>Tem o PDF? (opcional)</div><p class="plan" style="margin:0">Escolha o PDF e o Cycle lê o texto no seu aparelho e já coloca no pedido, sem você precisar anexar nada. Pule este passo se preferir anexar o PDF no chat.</p>' +
        '<div class="ia-row"><button class="btn small" data-ia="pdf" type="button">Escolher o PDF</button><span class="plan" id="iaPdfMsg"></span></div><input type="file" id="iaFile" accept="application/pdf,.pdf" hidden></div>' +
      '<div class="ia-sec"><div class="ia-h"><span class="ia-n">2</span>Copiar o pedido e abrir o chat</div><div class="ia-row" id="iaSites"></div><p class="plan" id="iaCopyMsg" style="margin:0"></p>' +
        '<details><summary>Ver o pedido (para copiar na mão)</summary><textarea id="iaPrompt" readonly style="width:100%"></textarea></details></div>' +
      '<div class="ia-sec"><div class="ia-h"><span class="ia-n">3</span>Cole a resposta do chat aqui</div><textarea id="iaReply" placeholder="Cole a resposta inteira da IA" spellcheck="false" style="width:100%"></textarea>' +
        '<div class="ia-row"><button class="btn primary" data-ia="use" type="button">Usar resposta</button><button class="btn small" data-ia="paste" type="button">Colar o que copiei</button></div><p class="plan" id="iaMsg" style="margin:0"></p></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector("#iaSites").innerHTML = SITES.map(function (s) { return '<button class="btn" data-ia="site" data-s="' + s.id + '" type="button">Copiar e abrir o ' + esc(s.nome) + "</button>"; }).join("");
    modal.addEventListener("click", function (e) {
      if (e.target === modal) return close();
      var b = e.target.closest("[data-ia]"); if (!b) return;
      var k = b.dataset.ia;
      if (k === "close") close();
      else if (k === "pdf") $("iaFile").click();
      else if (k === "site") abrirChat(b.dataset.s);
      else if (k === "use") usar();
      else if (k === "paste") colar();
    });
    $("iaFile").addEventListener("change", lerPdf);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) close(); });
  }
  function pedido() { return C.kind === "avaliacao" ? promptAvaliacao(C.name, texto) : promptEmenta(C.name, texto); }
  function atualizarPedido() { $("iaPrompt").value = pedido(); }
  function lerPdf() {
    var f = $("iaFile").files[0]; $("iaFile").value = ""; if (!f) return;
    $("iaPdfMsg").textContent = "Lendo o PDF…";
    Promise.resolve(C.extract ? C.extract(f) : Promise.reject(fail("sem leitor"))).then(function (r) {
      var t = String(r.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), cortou = t.length > MAXTXT;
      texto = t.slice(0, MAXTXT);
      $("iaPdfMsg").innerHTML = '<span class="ia-ok">PDF lido (' + r.pages + " página" + (r.pages === 1 ? "" : "s") + ").</span> O texto já vai no pedido" + (cortou ? " (cortei no começo, por ser muito longo)" : "") + ".";
      atualizarPedido();
    }).catch(function (e) { texto = ""; $("iaPdfMsg").innerHTML = '<span class="ia-bad">' + esc(e && e.message ? e.message : "Não consegui ler o PDF.") + "</span> Anexe o PDF direto no chat."; atualizarPedido(); });
  }
  function copiar(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
    return Promise.reject(new Error("sem área de transferência"));
  }
  function abrirChat(id) {
    var s = SITES.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    var w = window.open(s.url, "_blank", "noopener");        // abre primeiro, dentro do clique, para o navegador não bloquear
    copiar(pedido()).then(function () {
      $("iaCopyMsg").innerHTML = '<span class="ia-ok">Pedido copiado.</span> No ' + esc(s.nome) + ": cole com <b>Ctrl+V</b> (no celular, segure e toque em Colar) e envie." + (texto ? "" : " <b>Anexe o PDF</b> antes de enviar.") + " Depois volte aqui e cole a resposta no passo 3.";
    }).catch(function () {
      $("iaCopyMsg").innerHTML = '<span class="ia-bad">Não consegui copiar sozinho.</span> Abra "Ver o pedido", copie o texto e cole no chat.';
      var d = modal.querySelector("details"); if (d) d.open = true; $("iaPrompt").select();
    });
    if (!w) $("iaCopyMsg").innerHTML += ' <span class="ia-bad">O navegador bloqueou a nova aba: abra o ' + esc(s.nome) + " você mesmo.</span>";
  }
  function colar() {
    if (!(navigator.clipboard && navigator.clipboard.readText)) { $("iaMsg").innerHTML = '<span class="ia-bad">Este navegador não deixa colar com o botão. Cole com Ctrl+V no campo.</span>'; return; }
    navigator.clipboard.readText().then(function (t) { $("iaReply").value = t; $("iaMsg").textContent = t ? "Colado. Toque em Usar resposta." : "Não havia nada copiado."; }, function () { $("iaMsg").innerHTML = '<span class="ia-bad">Sem permissão para colar. Cole com Ctrl+V no campo.</span>'; });
  }
  function usar() {
    $("iaMsg").textContent = "";
    try {
      var r = C.kind === "avaliacao" ? parseAvaliacao($("iaReply").value) : parseEmenta($("iaReply").value);
      var msg = C.onApply(r);
      close();
      return msg;
    } catch (e) { $("iaMsg").innerHTML = '<span class="ia-bad">' + esc(e && e.message ? e.message : "Não consegui usar essa resposta.") + "</span>"; }
  }
  function open(cfg) {                                      // cfg: { kind: "ementa"|"avaliacao", name, extract(file), onApply(resultado) }
    build(); C = cfg; texto = "";
    $("iaTitle").textContent = (cfg.kind === "avaliacao" ? "Critérios de avaliação" : "Ementa") + (cfg.name ? " · " + cfg.name : "");
    $("iaPdfMsg").textContent = ""; $("iaCopyMsg").textContent = ""; $("iaMsg").textContent = ""; $("iaReply").value = "";
    modal.querySelector("details").open = false; atualizarPedido();
    modal.hidden = false; $("iaReply").scrollTop = 0;
  }
  function close() { if (modal) modal.hidden = true; }

  window.__cycleIA = { open: open, close: close, promptEmenta: promptEmenta, promptAvaliacao: promptAvaliacao, parseEmenta: parseEmenta, parseAvaliacao: parseAvaliacao };
})();
