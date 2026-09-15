/**
 * Brazilian Portuguese graph resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary: grafo de
 * conhecimento, nó, relação, dimensão, confiança, evidência).
 */
const graph = {
  kicker: "Grafo de conhecimento",
  title: "Mapa de relações da pesquisa",
  description:
    "Siga as relações dos nós até as fontes e evidências em vez de admirar uma imagem bonita.",
  showList: "Visão em lista (acessível)",
  showGraph: "Visão em grafo",
  exportImage: "Exportar imagem",
  desktopOnly: "Somente na versão desktop",
  empty: {
    title: "O grafo ainda está vazio",
    description:
      "Quando uma execução de pesquisa concluir a normalização, entidades e relações são projetadas em um grafo 2D.",
  },
  filter: {
    byType: "Filtrar por tipo",
    typeAll: "Todos os nós",
    typeConcept: "Conceitos",
    typeTechnology: "Tecnologia",
    typeCompany: "Empresas",
    typePaper: "Artigos",
    cluster: "Agrupar por dimensão",
    clusterTitle: "Organize as colunas por dimensão de pesquisa",
    search: "Pesquisar nós",
    searchPlaceholder: "Pesquisar por título…",
    byDimension: "Filtrar por dimensão",
    dimensionAll: "Todas as dimensões",
    byConfidence: "Filtrar por estado de confiança",
    confidenceAll: "Todos os níveis de confiança",
    byRelation: "Filtrar por tipo de relação",
    relationAll: "Todas as relações",
    yearFrom: "Ano inicial",
    yearFromOption: "A partir do ano",
    yearTo: "Ano final",
    yearToOption: "até",
  },
  counts: "{{nodes}} nós · {{relations}} relações",
  inspector: {
    aria: "Inspetor do grafo",
    placeholderList: "Selecione um nó na lista para ver os detalhes.",
    placeholderGraph: "Selecione um nó para ver os detalhes.",
    current: "Seleção atual",
    closeAria: "Fechar detalhes",
    noSummary: "Ainda sem resumo",
    sourceCount: "Fontes",
    relationCount: "Relações",
    relationsHeading: "Relações ({{total}})",
    openMarkdown: "Abrir em Markdown",
  },
  canvas: {
    aria: "Grafo de conhecimento (layout de forças 2D)",
    caption: "Lista de nós de conhecimento (visão alternativa ao grafo)",
    nodeAria: "{{title}} ({{type}}, confiança {{confidence}})",
    edgeAria: "Relação: {{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "Nó",
    type: "Tipo",
    dimension: "Dimensão",
    confidence: "Confiança",
    year: "Ano",
    sourcesClaims: "Fontes/Afirmações",
  },
};

export default graph;
