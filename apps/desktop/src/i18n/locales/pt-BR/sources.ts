/**
 * Brazilian Portuguese sources resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary: fonte,
 * qualidade, afirmação).
 */
const sources = {
  kicker: "Biblioteca de fontes",
  title: "Fontes descobertas",
  description:
    "Cada fonte mantém seu endereço normalizado, tipo, informações de qualidade e as afirmações às quais contribuiu.",
  importLinks: "Importar links",
  desktopOnly: "Somente na versão desktop",
  qualityToggle: "Filtrar por qualidade",
  empty: {
    title: "Ainda não há fontes",
    description:
      "Aprove o plano de pesquisa e inicie uma execução; as fontes descobertas aparecerão aqui.",
  },
  summary: {
    all: "Todas",
    high: "Alta qualidade",
    medium: "Média",
    pending: "Para avaliar",
  },
  search: "Pesquisar fontes ou palavras-chave",
  searchPlaceholder: "Pesquisar títulos ou endereços…",
  filter: {
    all: "Todos os tipos",
    paper: "Artigos",
    documentation: "Documentação oficial",
  },
  count: "{{total}} fontes",
  noMatch: "Nenhuma fonte correspondente; tente outras palavras-chave ou limpe os filtros.",
};

export default sources;
