/**
 * Spanish plan resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: plan, tarea, ejecución,
 * revisión, aprobar/rechazar).
 */
const plan = {
  kicker: "Plan de investigación / {{status}}",
  statusDraft: "Pendiente de revisión",
  fallbackTitle: "Plan de investigación",
  noPlanDescription:
    "El Planner solo genera borradores del plan para revisión; las tareas ejecutables se crean después de aprobarlo.",
  regenerate: "Regenerar",
  reject: "Rechazar plan",
  approveAria: "Aprobar plan",
  approve: "Confirmar e iniciar",
  startRun: "Iniciar ejecución",
  runStartedToast: {
    title: "Ejecución de investigación iniciada",
    detail: "Sigue el progreso en vivo en la página de tareas.",
  },
  runStartFailed: "No se pudo iniciar la ejecución.",
  regenerateApproved: "Regenerar plan",
  generate: "Generar plan de investigación",
  actionError: {
    title: "Acción no completada",
    fallback: "La acción falló. Inténtalo de nuevo.",
  },
  runAlert: {
    title: "Estado de ejecución: {{state}}",
    detail:
      "El plan entró en ejecución ({{total}} tareas en total); para ajustarlo, pausa tareas en la página de tareas o espera a que termine esta ejecución.",
  },
  empty: {
    title: "Aún no hay plan de investigación",
    description:
      "Completa primero la configuración de investigación y haz clic en «Generar plan de investigación». El plan listará las tareas de búsqueda y extracción por dimensión para tu revisión.",
  },
  summary: {
    tasks: "Tareas previstas",
    sources: "Fuentes",
    dimensions: "Dimensiones de investigación",
    reviews: "Por revisar",
  },
  group: {
    expandAria: "Expandir grupo",
    collapseAria: "Contraer grupo",
    taskCount: "{{total}} tareas",
  },
  task: {
    edit: "Editar tarea",
  },
  locked: {
    title: "Plan bloqueado",
    detail:
      "Esta ejecución ya se creó, por lo que el plan ya no puede modificarse; pausa tareas o regenera el plan cuando termine la ejecución.",
  },
  editDialog: {
    title: "Editar tarea del plan",
    description:
      "Solo se pueden editar el título y la descripción; el tipo de tarea y el orden de ejecución los decide el Orchestrator.",
    titleLabel: "Título de la tarea",
    descriptionLabel: "Descripción de la tarea",
    cancel: "Cancelar",
    save: "Guardar cambios",
    saveFailed: "No se pudieron guardar los cambios.",
  },
};

export default plan;
