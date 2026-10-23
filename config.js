/* Configuração da candidatura a Cycler (aba "Seja um Cycler").
   O formulário da página é visual e envia as respostas a um Google Formulário seu (grátis). Veja PASSO-A-PASSO-FORMULARIO.md.
   url:    o endereço de envio do formulário, termina em /formResponse
   campos: o código de cada pergunta do formulário (entry.123456789)
   Estes valores são públicos (qualquer formulário do Google mostra os dele). Enquanto "url" estiver vazio, a página mostra "As candidaturas abrem em breve". */
window.CYCLER_FORM = {
  url: "",
  campos: { nome: "", email: "", curso: "", motivo: "" }
};
