/**
 * Brazilian Portuguese overview resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary:
 * cobertura, dimensão, fonte, nó de conhecimento, afirmação, lacuna,
 * execução).
 */
const overview = {
  kicker: "Projeto de pesquisa / {{status}}",
  notStarted: "Não iniciado",
  fallbackTitle: "Resumo",
  editConfig: "Editar configuração",
  viewTasks: "Ver tarefas →",
  planDraftTitle: "Primeiro aprove o plano na página de Plano de pesquisa",
  continueResearch: "Continuar pesquisa →",
  empty: {
    title: "Nenhum projeto selecionado",
    description:
      "Primeiro selecione ou crie um projeto de pesquisa em “Minhas pesquisas”; o resumo dele aparecerá aqui.",
    action: "Ir para Minhas pesquisas",
  },
  metrics: {
    coverage: "Cobertura da pesquisa",
    coverageMeta: "{{done}} / {{total}} dimensões principais concluídas",
    sources: "Fontes",
    sourcesMeta: "{{total}} de alta qualidade",
    knowledge: "Nós de conhecimento",
    knowledgeMeta: "{{total}} tipos",
    reviews: "Afirmações para revisar",
    reviewsMeta: "{{total}} em conflito",
    coverageProgressAria: "Progresso de cobertura",
  },
  path: {
    kicker: "Progresso da pesquisa",
    title: "Rota de pesquisa atual",
    viewAll: "Ver tudo →",
    empty:
      "Ainda não há tarefas executáveis; aprove o plano e inicie uma execução e as tarefas aparecerão aqui em ordem de dependência.",
    executing: "Executando",
    waitingPredecessor: "Aguardando predecessoras",
    progressAria: "Progresso de conclusão de tarefas",
    stateDone: "Pronta",
    stateReview: "Para revisar",
    stateWaiting: "Aguardando",
  },
  activity: {
    kicker: "Atividade da pesquisa",
    title: "Neste momento",
    live: "Ao vivo",
    empty:
      "Ainda não há atividade; quando uma execução de pesquisa começar, fontes, afirmações e nós de conhecimento aparecerão aqui ao longo do tempo.",
  },
  dimensions: {
    kicker: "Cobertura",
    title: "Dimensões da pesquisa",
    viewKnowledge: "Ver conhecimento →",
    progressAria: "Progresso de cobertura de {{dimension}}",
  },
  coverage: {
    why: "Por que esta pontuação?",
    taskCompletion: "Conclusão de tarefas {{score}} (peso {{weight}}): {{done}}/{{total}} tarefas concluídas",
    knowledgeBreadth: "Amplitude de conhecimento {{score}} (peso {{weight}}): {{total}} nós",
    evidenceDensity: "Densidade de evidências {{score}} (peso {{weight}}): {{total}} evidências",
    sourceDiversity:
      "Diversidade de fontes {{score}} (peso {{weight}}): {{total}} fontes independentes de alta qualidade",
  },
  next: {
    kicker: "Próximo passo",
    title: "Pesquisa sugerida a seguir",
    triggerCoverage: "Cobertura baixa",
    triggerSources: "Fontes insuficientes",
    createdTask: "Tarefa “{{title}}” criada.",
    createdTaskHint: "A nova tarefa aparece na página de tarefas; pause ou repita a qualquer momento.",
    createTask: "Criar tarefa de pesquisa →",
    dismissAria: "Descartar esta sugestão",
    dismiss: "Descartar",
    empty: "Sem sugestões de lacunas — a cobertura está boa.",
  },
};

export default overview;
