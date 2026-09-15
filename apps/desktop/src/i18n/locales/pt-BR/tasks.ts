/**
 * Brazilian Portuguese tasks resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary: tarefa,
 * execução, pausar/retomar/tentar novamente/cancelar).
 */
const tasks = {
  kicker: "Tarefas de pesquisa",
  title: "Trabalho em andamento",
  description: "Cada tarefa pode ser pausada, repetida e rastreada até suas fontes e resultados.",
  continueRun: "Continuar execução",
  runStartedToast: {
    title: "Execução de pesquisa iniciada",
    detail: "As tarefas serão executadas em ordem de dependência.",
  },
  runBadge: "Estado da execução: {{state}}",
  empty: {
    title: "Ainda não há tarefas",
    approved: "O plano está aprovado — clique em “Continuar execução” no canto superior direito para criar as tarefas.",
    draft: "Primeiro revise e aprove o plano na página de Plano de pesquisa; as tarefas são criadas após a aprovação.",
    generic: "Primeiro gere e aprove um plano na página de Plano de pesquisa.",
  },
  filterAria: "Filtrar por estado da tarefa",
  tabs: {
    all: "Todas",
    active: "Ativas",
    review: "Para revisar",
    done: "Concluídas",
  },
  lastUpdated: "Última atualização {{date}}",
  col: {
    task: "Tarefa",
    stage: "Etapa",
    status: "Estado",
  },
  pill: {
    running: "Em execução",
    needsReview: "Para revisar",
    completed: "Concluída",
  },
  action: {
    menuAria: "Ações da tarefa",
    pause: "Pausar",
    resume: "Retomar",
    retry: "Tentar novamente",
    confirmContinue: "Confirmar e continuar",
    cancel: "Cancelar",
  },
};

export default tasks;
