/**
 * Brazilian Portuguese assistant resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure). Saving to the
 * journal is always an explicit two-step action; the copy keeps that
 * emphasis.
 */
const assistant = {
  aria: "Assistente de pesquisa com IA",
  kicker: "Assistente do projeto ativo",
  closeAria: "Fechar o assistente de IA",
  context: {
    loading: "Carregando o contexto do projeto…",
    usingBefore: "Usando agora ",
    usingAfter: " como contexto de pesquisa",
  },
  navAria: "Ações do assistente",
  error: {
    title: "Ação não concluída",
    fallback: "O assistente está temporariamente indisponível. Tente novamente.",
  },
  decision: {
    empty: "Escreva primeiro o conteúdo da decisão.",
    title: "Registrar decisão",
    hint: "As decisões são salvas apenas neste projeto; nada é gravado até você clicar em “Salvar decisão”.",
    inputAria: "Conteúdo da decisão",
    inputPlaceholder: "ex.: priorizar fontes de artigos quantitativos na próxima rodada",
    save: "Salvar decisão",
    saved: "Decisão salva (salvamento explícito; {{total}} no total).",
    listSummary: "Decisões salvas ({{total}})",
  },
  journalSave: {
    title: "Salvar a conversa no diário",
    idle: "Esta conversa tem {{total}} mensagens; nada é gravado no diário local até você clicar em “Confirmar salvamento” — nada é salvo automaticamente.",
    groupAria: "Confirmar o salvamento da conversa",
    confirmDetail:
      "{{total}} mensagens serão salvas no diário de hoje ({{date}}, somente local).",
    confirm: "Confirmar salvamento",
    cancel: "Cancelar",
    arm: "Salvar no diário",
    saved: "{{total}} mensagens salvas no diário de hoje.",
    viewJournal: "Ver diário →",
  },
  toast: {
    savedTitle: "Salvo no diário",
    savedDetail: "{{total}} mensagens no total (somente local)",
  },
  entry: {
    header: "Conversa salva do assistente de IA (projeto: {{project}} · ID {{id}})",
    line: "[{{author}}] {{content}}",
    authorLabel: "Usuário",
    unknownProject: "Projeto desconhecido",
  },
  footer: {
    note: "A IA responde com base no espaço de trabalho do projeto atual",
    openJournal: "Diário",
  },
};

export default assistant;
