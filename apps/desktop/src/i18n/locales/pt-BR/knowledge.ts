/**
 * Brazilian Portuguese knowledge resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary: nó de
 * conhecimento, afirmação, evidência, Vault, fonte).
 */
const knowledge = {
  kicker: "Base de conhecimento",
  title: "Conhecimento extraído",
  description: "Nós são entidades e conceitos; afirmações e evidências são armazenadas separadamente.",
  filterAria: "Filtrar por tipo",
  filterAll: "Todos os tipos",
  exportVault: "Exportar Vault",
  exportTitle: "Exporte conhecimento, fontes e afirmações como um Vault em Markdown",
  toolbar: {
    sources: "Fontes {{total}}",
    nodes: "Nós de conhecimento {{total}}",
    claims: "Afirmações {{total}}",
  },
  empty: {
    title: "A base de conhecimento ainda está vazia",
    description:
      "Quando uma execução de pesquisa concluir a normalização, entidades, afirmações e evidências aparecerão aqui.",
  },
  tabs: {
    label: "Visões do conhecimento",
    nodes: "Nós de conhecimento",
    claims: "Afirmações e evidências",
  },
  search: "Pesquisar nós de conhecimento",
  searchPlaceholder: "Pesquisar títulos, resumos ou alias…",
  nodeCount: "{{total}} nós",
  noMatch: "Nenhum nó de conhecimento correspondente; tente outras palavras-chave ou limpe os filtros.",
  claimsIntro:
    "As afirmações são independentes dos nós de conhecimento; afirmações contraditórias coexistem, cada uma mantendo suas próprias evidências.",
  unknownSubject: "Assunto desconhecido",
  conflictBadge: "Em conflito: evidências de apoio e de contradição são preservadas",
  evidenceLoading: "Carregando evidências…",
  toast: {
    conflictTitle: "A exportação concluiu, mas há conflitos que exigem tratamento manual",
    conflictDetail:
      "{{written}} arquivos gravados, {{unchanged}} sem alterações; {{conflicts}} arquivos mantidos como propostas de mesclagem devido a modificações locais ({{proposals}}). Diretório de exportação: {{root}}",
    successTitle: "Exportação do Vault concluída",
    successDetail:
      "{{written}} arquivos gravados ({{sources}} fontes, {{claims}} afirmações, {{maps}} mapas), {{unchanged}} sem alterações. Diretório de exportação: {{root}}",
    errorTitle: "Falha na exportação do Vault",
    listSeparator: ", ",
    moreSuffix: "…",
  },
};

export default knowledge;
