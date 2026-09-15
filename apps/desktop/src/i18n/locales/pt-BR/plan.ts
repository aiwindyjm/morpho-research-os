/**
 * Brazilian Portuguese plan resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary: plano,
 * tarefa, execução, revisão, aprovar/rejeitar).
 */
const plan = {
  kicker: "Plano de pesquisa / {{status}}",
  statusDraft: "Aguardando revisão",
  fallbackTitle: "Plano de pesquisa",
  noPlanDescription:
    "O Planner só gera rascunhos do plano para revisão; as tarefas executáveis são criadas após a aprovação.",
  regenerate: "Regenerar",
  reject: "Rejeitar plano",
  approveAria: "Aprovar plano",
  approve: "Confirmar e iniciar",
  startRun: "Iniciar execução",
  runStartedToast: {
    title: "Execução de pesquisa iniciada",
    detail: "Acompanhe o progresso ao vivo na página de tarefas.",
  },
  runStartFailed: "Falha ao iniciar a execução.",
  regenerateApproved: "Regenerar plano",
  generate: "Gerar plano de pesquisa",
  actionError: {
    title: "Ação não concluída",
    fallback: "A ação falhou. Tente novamente.",
  },
  runAlert: {
    title: "Estado da execução: {{state}}",
    detail:
      "O plano entrou em execução ({{total}} tarefas no total); para ajustá-lo, pause tarefas na página de tarefas ou aguarde o fim desta execução.",
  },
  empty: {
    title: "Ainda não há plano de pesquisa",
    description:
      "Conclua primeiro a configuração de pesquisa e clique em “Gerar plano de pesquisa”. O plano listará as tarefas de busca e extração por dimensão para sua revisão.",
  },
  summary: {
    tasks: "Tarefas planejadas",
    sources: "Fontes",
    dimensions: "Dimensões da pesquisa",
    reviews: "Para revisar",
  },
  group: {
    expandAria: "Expandir grupo",
    collapseAria: "Recolher grupo",
    taskCount: "{{total}} tarefas",
  },
  task: {
    edit: "Editar tarefa",
  },
  locked: {
    title: "Plano bloqueado",
    detail:
      "Esta execução já foi criada, então o plano não pode mais ser modificado; pause tarefas ou regenere o plano quando a execução terminar.",
  },
  editDialog: {
    title: "Editar tarefa do plano",
    description:
      "Apenas o título e a descrição podem ser editados; o tipo de tarefa e a ordem de execução são definidos pelo Orchestrator.",
    titleLabel: "Título da tarefa",
    descriptionLabel: "Descrição da tarefa",
    cancel: "Cancelar",
    save: "Salvar alterações",
    saveFailed: "Falha ao salvar as alterações.",
  },
};

export default plan;
