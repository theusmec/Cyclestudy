/* Configuração da candidatura a Cycler (aba "Seja um Cycler").
   O formulário da página é visual e envia as respostas a um Google Formulário seu (grátis). Veja PASSO-A-PASSO-FORMULARIO.md.
   url:       o endereço de envio do formulário, termina em /formResponse
   campos:    o código de cada pergunta do formulário (entry.123456789)
   objetivos: a pergunta de caixas de seleção; o texto de cada opção do formulário precisa ser IGUAL ao dos botões da página
   Estes valores são públicos (qualquer formulário do Google mostra os dele). Enquanto "url" estiver vazio, a página mostra "As candidaturas abrem em breve". */
window.CYCLER_FORM = {
  url: "https://docs.google.com/forms/d/e/1FAIpQLSe9C3KIr_Cho5Ua5fVUQ9vlKcVrS731_vNS6lASgBGjENuIMQ/formResponse",
  campos: { nome: "entry.2089303264", email: "entry.2042334022", curso: "entry.927376797", motivo: "entry.514883382", objetivos: "entry.938269178" }
};
