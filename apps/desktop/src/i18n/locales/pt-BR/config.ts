/**
 * Brazilian Portuguese config resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary:
 * configuração de pesquisa, plano, dimensão, fonte, afirmação).
 */
const config = {
  kicker: "Configuração de pesquisa",
  title: "Defina sua pergunta de pesquisa",
  description:
    "Essas informações determinam o escopo, a profundidade e a seleção de fontes do plano de pesquisa.",
  cancel: "Cancelar",
  discard: "Descartar alterações",
  save: "Salvar configuração",
  saveError: {
    title: "Não é possível salvar",
    validation: "A configuração falhou na validação: {{issue}}",
    failed: "Falha ao salvar. Tente novamente mais tarde.",
  },
  noProject: {
    title: "Primeiro selecione ou crie um projeto",
    description:
      "A configuração de pesquisa pertence a um projeto específico; troque ou crie um projeto antes de configurar.",
  },
  section01: {
    title: "Tema de pesquisa",
    help: "Comece esclarecendo o que você quer entender e o uso final.",
  },
  section02: {
    title: "Escopo da pesquisa",
    help: "Quanto mais claro o escopo, mais fácil executar e revisar o plano.",
  },
  section03: {
    title: "Dimensões da pesquisa",
    help: "Escolha os ângulos que o plano deve cobrir; você pode ajustá-los depois de gerá-lo.",
  },
  section04: {
    title: "Preferências de fontes",
    help: "O Morpho busca primeiro nessas fontes e mantém a procedência de cada afirmação.",
  },
  field: {
    domain: "Campo de pesquisa",
    domainPlaceholder: "ex.: engenharia neural",
    topic: "Tema de pesquisa",
    topicPlaceholder: "ex.: interfaces cérebro-computador na reabilitação motora",
    purpose: "Propósito da pesquisa",
    audience: "Público",
    audiencePlaceholder: "ex.: pesquisadores em medicina de reabilitação",
    depth: "Profundidade da pesquisa",
    timeRange: "Período",
    yearStart: "Ano inicial",
    yearStartPlaceholder: "ex.: 2015",
    yearEnd: "Ano final",
    yearEndPlaceholder: "ex.: 2026",
    yearTo: "a",
    languages: "Idiomas",
    geographicScope: "Escopo geográfico",
    geographicScopePlaceholder: "ex.: global",
  },
  dimensions: {
    custom: "Dimensão personalizada",
    customTitle: "Somente na versão desktop",
  },
  sourcePref: {
    paper: "Periódicos, preprints e material de conferências",
    documentation: "Documentação oficial e guias institucionais",
    web_page: "Cobertura setorial e mídia especializada",
    repository: "Código e implementações de código aberto",
    dataset: "Dados públicos e material experimental",
    book: "Livros didáticos, monografias e manuais",
    video: "Palestras e gravações de conferências",
  },
  footer:
    "A frequência de atualização está fixada em manual (update_frequency: manual); a pesquisa incremental automática chega em uma versão futura.",
};

export default config;
