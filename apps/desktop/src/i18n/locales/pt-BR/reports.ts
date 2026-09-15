/**
 * Brazilian Portuguese reports resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary: fonte,
 * nó de conhecimento, afirmação, cobertura, execução).
 */
const reports = {
  kicker: "Relatórios",
  title: "Briefing de pesquisa do projeto",
  description:
    "Um resumo de uma página gerado a partir das fontes, do conhecimento e da cobertura do projeto atual; a exportação completa do briefing chega depois.",
  empty: {
    title: "Nada para relatar ainda",
    description:
      "Quando as execuções de pesquisa produzirem fontes, nós de conhecimento e afirmações, o briefing do projeto será resumido aqui.",
  },
  metrics: {
    sources: "Fontes",
    knowledge: "Nós de conhecimento",
    claims: "Afirmações",
    coverage: "Cobertura da pesquisa",
  },
  dimensions: {
    kicker: "Cobertura",
    title: "Tabela de cobertura por dimensão",
    caption: "Cobertura e insumos-chave por dimensão de pesquisa",
    colDimension: "Dimensão",
    colCoverage: "Cobertura",
    colTasks: "Tarefas concluídas",
    colNodes: "Nós de conhecimento",
    colQualitySources: "Fontes de alta qualidade",
  },
  runs: {
    kicker: "Histórico de execuções",
    title: "Execuções de pesquisa recentes",
    empty: "Ainda não há execuções de pesquisa; os eventos aparecerão aqui quando uma começar.",
  },
  export: {
    kicker: "Exportação",
    soon: "Em breve",
    title: "Exportar relatório",
    description:
      "O briefing completo e a exportação do Vault chegam após a integração do pipeline; por enquanto, esta página resume os dados.",
  },
};

export default reports;
