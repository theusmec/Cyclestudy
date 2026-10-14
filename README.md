# Cycle

**Revisão espaçada para estudar para provas.** Grátis, sem conta, sem servidor. Funciona no celular e no computador, inclusive offline, e os dados ficam só no navegador do seu aparelho.

### [Abrir o Cycle](https://theusmec.github.io/Cyclestudy/) · [Tutorial passo a passo](https://theusmec.github.io/Cyclestudy/ajuda.html)

<img src="cartaz-cycle.png" alt="QR code para abrir o Cycle no celular" width="320">

## O que faz
- Cadastra matérias, datas de prova, horários de aula e ementa.
- Agenda **revisões espaçadas** (1, 3, 7, 14 e 30 dias, ajustáveis) e aproxima das provas quando elas chegam perto.
- Lista, quadro e calendário; trabalhos com subtarefas; cronômetro e metas semanais.
- **Ementa por PDF:** lê o PDF no aparelho (pdf.js), sugere os tópicos e você revisa antes de salvar.
- **Tour guiado:** botão Tour no topo (e convite na primeira vez) que passa por todas as abas explicando o essencial, sem alterar dados.
- **Assistente local (sem IA e sem internet):** responde sobre agenda, provas, notas, revisões, trabalhos, horas e ementa com os seus dados, cria trabalhos e move revisões atrasadas (com confirmação e desfazer), e recusa o que não sabe.
- **IA gratuita, sem chave:** monta o pedido pronto para ChatGPT, Gemini ou Claude (ementa e critérios de avaliação), copia, abre o chat e entende a resposta que você colar de volta.
- Notas e médias: pesos, substitutiva, o que falta para passar e simulação "e se…".
- Anotações em Markdown por matéria e tópico.
- Backup em arquivo, **sincronização entre celular e computador por QR animado ou código** (sem conta) e exportação **.ics** para o Google Agenda, Apple Calendar e Outlook.
- **Importa o seu Google Agenda** (arquivo .zip exportado pelo Google) para ver seus compromissos, inclusive os que se repetem, ao lado das revisões. Separa aula, prova, trabalho, revisão e evento, cria as matérias e lança as provas sozinho, e você corrige o tipo quando precisar. Sem conta e sem enviar nada ao Google.

## Como instalar
- **Android (Chrome):** abrir o site e tocar em *Instalar app*.
- **iPhone (Safari):** compartilhar > *Adicionar à Tela de Início*.
- **Computador (Edge/Chrome):** ícone de instalar na barra de endereço.
Depois da primeira abertura, funciona sem internet.

## Privacidade
Não há login, banco de dados nem rastreamento. Nada que você cadastra sai do aparelho (a sincronização acontece direto entre os aparelhos, por QR ou código). Limpar os dados do navegador apaga tudo, então faça backup de vez em quando.

## Não incluído nesta versão
Conexão ao vivo com o Google Agenda (a troca é por arquivo) e o Assistente/Examinador com IA (dependem de contas externas, pagas por uso no caso da IA).

## Para quem quiser mexer
É um site estático (HTML, JavaScript e IndexedDB), sem etapa de build para rodar. Publicado com o GitHub Pages a partir da raiz da branch `main`.

## Bibliotecas de terceiros
qrcode-generator, jsQR e pdf.js da Mozilla (em `lib/`, com as licenças em `lib/LICENSES.txt`).
