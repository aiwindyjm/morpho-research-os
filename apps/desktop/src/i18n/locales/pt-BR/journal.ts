/**
 * Brazilian Portuguese journal resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure). The journal is
 * private local-only data (never uploaded, never in Git).
 */
const journal = {
  kicker: "Diário privado",
  title: "Diário",
  description:
    "As discussões de hoje sobre arquitetura e produto ficam nesta máquina — nunca no Git nem no Vault de pesquisa.",
  downloadJson: "Baixar JSON",
  downloadMarkdown: "Baixar o Markdown de hoje",
  count: "{{total}} entradas",
  localOnly: "Somente local",
  authorUser: "Usuário",
  listEmpty: "Ainda não há entradas. Anote as decisões de produto, perguntas ou próximos passos de hoje.",
  inputAria: "Entrada do diário",
  inputPlaceholder: "Registre as decisões de produto, perguntas ou próximos passos de hoje…",
  errorEmpty: "Escreva algo para registrar primeiro.",
  storageNote: "Salvo no armazenamento local do navegador",
  save: "Salvar entrada",
  rules: {
    kicker: "Regras de armazenamento",
    title: "Um registro de desenvolvimento que é só seu",
    items: {
      byLocalDate: "Agrupadas por data local",
      neverUploaded: "Nunca enviadas, nunca no Git",
      explicitDownload: "Download explícito de Markdown quando necessário",
      privateFolder: "Podem ser movidas para private/conversations/ manualmente",
    },
  },
  limits: {
    title: "Limitações atuais",
    detail:
      "A pré-visualização web não grava diretamente no espaço de trabalho. Na versão desktop, o Rust Core acrescenta os arquivos locais diariamente.",
  },
};

export default journal;
