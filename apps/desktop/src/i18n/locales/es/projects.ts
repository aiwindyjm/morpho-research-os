/**
 * Spanish projects resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure; glossary: proyecto, plan,
 * tarea, fuente, conocimiento, cobertura).
 */
const projects = {
  kicker: "Mi investigación",
  title: "Todos los proyectos de investigación",
  description:
    "Cada tema es un espacio de investigación independiente. Cambia, continúa o inicia una nueva investigación en cualquier momento.",
  newResearch: "Nueva investigación",
  empty: {
    title: "Aún no hay proyectos de investigación",
    description:
      "Crea tu primer proyecto y convierte una pregunta de investigación en una base de conocimiento que sigue creciendo.",
  },
  search: "Buscar en mi investigación",
  count: "{{total}} proyectos",
  createCard: {
    title: "Iniciar nueva investigación",
    hint: "Empieza con una pregunta",
  },
  card: {
    openAria: "Abrir proyecto",
    statusDraft: "Borrador",
    statusInProgress: "En curso",
    statusPaused: "En pausa",
    coverage: "Cobertura {{percent}}%",
    notStarted: "Sin iniciar",
    taskCount: "{{total}} tareas",
    updatedAt: "Actualizado {{date}}",
    progressAria: "Progreso del proyecto",
    enterWorkspace: "Abrir espacio de trabajo",
    switchTo: "Cambiar a este proyecto",
    configure: "Configuración de investigación",
  },
  dialog: {
    title: "Nuevo proyecto de investigación",
    description:
      "Cada proyecto tiene su propia configuración, plan, tareas, conocimiento y contexto del asistente.",
    nameLabel: "Nombre del proyecto",
    namePlaceholder: "p. ej., optimización de inferencia de LLM",
    descriptionLabel: "Descripción",
    descriptionPlaceholder:
      "En una frase, ¿qué pregunta debe responder este proyecto?",
    cancel: "Cancelar",
    create: "Crear proyecto",
  },
  error: {
    nameRequired: "El nombre del proyecto no puede quedar vacío.",
    createFailed: "No se pudo crear. Inténtalo de nuevo.",
  },
};

export default projects;
