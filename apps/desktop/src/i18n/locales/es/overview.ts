/**
 * Spanish overview resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure; glossary: cobertura,
 * dimensión, fuente, nodo de conocimiento, afirmación, brecha, ejecución).
 */
const overview = {
  kicker: "Proyecto de investigación / {{status}}",
  notStarted: "Sin iniciar",
  fallbackTitle: "Resumen",
  editConfig: "Editar configuración",
  viewTasks: "Ver tareas →",
  planDraftTitle: "Primero aprueba el plan en la página de Plan de investigación",
  continueResearch: "Continuar investigación →",
  empty: {
    title: "No hay proyecto seleccionado",
    description:
      "Primero selecciona o crea un proyecto de investigación en «Mi investigación»; su resumen aparecerá aquí.",
    action: "Ir a Mi investigación",
  },
  metrics: {
    coverage: "Cobertura de investigación",
    coverageMeta: "{{done}} / {{total}} dimensiones clave completadas",
    sources: "Fuentes",
    sourcesMeta: "{{total}} de alta calidad",
    knowledge: "Nodos de conocimiento",
    knowledgeMeta: "{{total}} tipos",
    reviews: "Afirmaciones por revisar",
    reviewsMeta: "{{total}} en conflicto",
    coverageProgressAria: "Progreso de cobertura",
  },
  path: {
    kicker: "Progreso de investigación",
    title: "Ruta de investigación actual",
    viewAll: "Ver todo →",
    empty:
      "Aún no hay tareas ejecutables; aprueba el plan e inicia una ejecución y las tareas aparecerán aquí en orden de dependencia.",
    executing: "Ejecutando",
    waitingPredecessor: "Esperando predecesoras",
    progressAria: "Progreso de finalización de tareas",
    stateDone: "Lista",
    stateReview: "Por revisar",
    stateWaiting: "En espera",
  },
  activity: {
    kicker: "Actividad de investigación",
    title: "Justo ahora",
    live: "En vivo",
    empty:
      "Aún no hay actividad; cuando inicie una ejecución de investigación, fuentes, afirmaciones y nodos de conocimiento aparecerán aquí con el tiempo.",
  },
  dimensions: {
    kicker: "Cobertura",
    title: "Dimensiones de investigación",
    viewKnowledge: "Ver conocimiento →",
    progressAria: "Progreso de cobertura de {{dimension}}",
  },
  coverage: {
    why: "¿Por qué esta puntuación?",
    taskCompletion: "Finalización de tareas {{score}} (peso {{weight}}): {{done}}/{{total}} tareas completadas",
    knowledgeBreadth: "Amplitud de conocimiento {{score}} (peso {{weight}}): {{total}} nodos",
    evidenceDensity: "Densidad de evidencia {{score}} (peso {{weight}}): {{total}} piezas de evidencia",
    sourceDiversity:
      "Diversidad de fuentes {{score}} (peso {{weight}}): {{total}} fuentes independientes de alta calidad",
  },
  next: {
    kicker: "Siguiente paso",
    title: "Investigación sugerida a continuación",
    triggerCoverage: "Cobertura baja",
    triggerSources: "Fuentes insuficientes",
    createdTask: "Tarea «{{title}}» creada.",
    createdTaskHint: "La nueva tarea aparece en la página de tareas; puedes pausarla o reintentarla en cualquier momento.",
    createTask: "Crear tarea de investigación →",
    dismissAria: "Descartar esta sugerencia",
    dismiss: "Descartar",
    empty: "Sin sugerencias de brechas: la cobertura se ve bien.",
  },
};

export default overview;
