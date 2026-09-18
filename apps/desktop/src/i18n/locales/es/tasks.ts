/**
 * Spanish tasks resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: tarea, ejecución,
 * pausar/reanudar/reintentar/cancelar).
 */
const tasks = {
  kicker: "Tareas de investigación",
  title: "Trabajo en curso",
  description: "Cada tarea se puede pausar, reintentar y rastrear hasta sus fuentes y resultados.",
  continueRun: "Continuar ejecución",
  runStartedToast: {
    title: "Ejecución de investigación iniciada",
    detail: "Las tareas se ejecutarán en orden de dependencia.",
  },
  runBadge: "Estado de ejecución: {{state}}",
  runDeliveryPending: "Terminado; entregando resultados",
  runDeliveryFailed: "Terminado; resultados no entregados",
  empty: {
    title: "Aún no hay tareas",
    approved: "El plan está aprobado: haz clic en «Continuar ejecución» arriba a la derecha para crear las tareas.",
    draft: "Primero revisa y aprueba el plan en la página de Plan de investigación; las tareas se crean después de aprobarlo.",
    generic: "Primero genera y aprueba un plan en la página de Plan de investigación.",
  },
  filterAria: "Filtrar por estado de tarea",
  tabs: {
    all: "Todas",
    active: "Activas",
    review: "Por revisar",
    done: "Completadas",
  },
  lastUpdated: "Última actualización {{date}}",
  col: {
    task: "Tarea",
    stage: "Etapa",
    status: "Estado",
  },
  pill: {
    running: "En ejecución",
    needsReview: "Por revisar",
    completed: "Completada",
  },
  action: {
    menuAria: "Acciones de tarea",
    pause: "Pausar",
    resume: "Reanudar",
    retry: "Reintentar",
    confirmContinue: "Confirmar y continuar",
    cancel: "Cancelar",
    unsupportedTitle: "No disponible en V0.1",
    unsupportedHint: "Los controles por tarea (pausar/reanudar/reintentar/cancelar) requieren distribución por tarea y llegarán en una versión posterior; por ahora puede detener toda la ejecución con «Cancelar ejecución».",
  },
  runStartFailedToast: {
    title: "No se pudo iniciar la ejecución de investigación",
  },
};

export default tasks;
