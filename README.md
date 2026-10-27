# Cycle

**Revisão espaçada para estudar para provas.** Grátis. Funciona no celular e no computador, inclusive offline depois do primeiro acesso. O uso é **por convite**: cada pessoa tem a sua conta e só ela vê os próprios dados.

### [Abrir o Cycle](https://cyclestudy.com.br/) · [Tutorial passo a passo](https://cyclestudy.com.br/app/ajuda.html)

<img src="cartaz-cycle.png" alt="QR code para abrir o Cycle no celular" width="320">

## O que faz
- Cadastra matérias, datas de prova, horários de aula e ementa.
- **Planos de ensino em PDF:** lê os PDFs no aparelho, mostra uma prévia e cria as matérias, as ementas e os tópicos que faltam.
- Agenda **revisões espaçadas** (1, 3, 7, 14 e 30 dias, ajustáveis), aproxima das provas quando elas chegam perto e deixa criar revisões novas à mão.
- **Cronograma do semestre** na Agenda: lista ou semana, passo a passo para adicionar aula, prova, trabalho e compromisso, cores fixas por tipo e o botão **Fim de semestre**.
- **Metas:** estudo líquido da semana por matéria (só conta o tempo com o cronômetro rodando) e meta semanal.
- **Retrospectiva do semestre:** horas, constância e superações, com resumo para baixar.
- Notas e médias: pesos, substitutiva, o que falta para passar e simulação "e se…".
- Anotações em Markdown por matéria e tópico.
- **Importar e exportar agenda** (.zip do Google, .ics do Apple, Outlook e outros).
- **IA gratuita, sem chave:** monta o pedido pronto para ChatGPT, Gemini ou Claude (ementa e critérios de avaliação), copia e abre o chat.
- **Tour guiado** pelas abas, no botão Tour.

## Conta e dados
- Você cria a conta com e-mail e senha e **confirma o e-mail**. Só e-mails convidados entram.
- Os dados ficam no aparelho e na sua conta (Firebase, plano gratuito), para abrir em outro aparelho. O primeiro acesso precisa de internet; depois funciona offline e sincroniza quando voltar.
- Entre dois aparelhos **da mesma conta** sem internet, dá para passar os dados por **QR animado ou código**.
- Backup em arquivo (.json) em Dados e backup. Não há rastreamento nem anúncios.

## Como instalar
- **Android (Chrome):** abrir o site e tocar em *Instalar app*.
- **iPhone (Safari):** compartilhar > *Adicionar à Tela de Início*.
- **Computador (Edge/Chrome):** ícone de instalar na barra de endereço.

## Não incluído nesta versão
Conexão ao vivo com o Google Agenda (a troca é por arquivo), assinar calendário por link e IA própria (os botões "Pedir a uma IA" abrem o seu navegador).

## Para quem quiser mexer
É um site estático (HTML, JavaScript e IndexedDB) com contas pelo Firebase Authentication e Firestore. Publicado com o GitHub Pages a partir da raiz da branch `main`.

## Bibliotecas de terceiros
qrcode-generator, jsQR, pdf.js da Mozilla e o SDK do Firebase (em `lib/`, com as licenças em `lib/LICENSES.txt`).
