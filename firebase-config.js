/* Configuração web do projeto Firebase do Cycle.
   Estes valores são PÚBLICOS por desenho (qualquer site os mostra): quem protege os dados são as regras do Firestore
   (firestore.rules), não o segredo desta chave. NUNCA coloque aqui chave de serviço, senha ou token de administrador.
   Enquanto for null o app funciona como antes: sem conta, só no aparelho.
   Depois de criar o projeto, troque null por o bloco que o console do Firebase mostra:
   { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." } */
window.CYCLE_FIREBASE = null;
