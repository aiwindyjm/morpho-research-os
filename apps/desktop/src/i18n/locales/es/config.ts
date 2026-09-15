/**
 * Spanish config resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: configuración de
 * investigación, plan, dimensión, fuente, afirmación).
 */
const config = {
  kicker: "Configuración de investigación",
  title: "Define tu pregunta de investigación",
  description:
    "Estos datos determinan el alcance, la profundidad y la selección de fuentes del plan de investigación.",
  cancel: "Cancelar",
  discard: "Descartar cambios",
  save: "Guardar configuración",
  saveError: {
    title: "No se puede guardar",
    validation: "La configuración no pasó la validación: {{issue}}",
    failed: "No se pudo guardar. Inténtalo de nuevo más tarde.",
  },
  noProject: {
    title: "Primero selecciona o crea un proyecto",
    description:
      "La configuración de investigación pertenece a un proyecto concreto; cambia o crea un proyecto antes de configurar.",
  },
  section01: {
    title: "Tema de investigación",
    help: "Empieza por aclarar qué quieres entender y para qué lo usarás.",
  },
  section02: {
    title: "Alcance de la investigación",
    help: "Cuanto más claro el alcance, más fácil ejecutar y revisar el plan.",
  },
  section03: {
    title: "Dimensiones de investigación",
    help: "Elige los ángulos que el plan debe cubrir; puedes ajustarlos después de generarlo.",
  },
  section04: {
    title: "Preferencias de fuentes",
    help: "Morpho busca primero en estas fuentes y conserva la procedencia de cada afirmación.",
  },
  field: {
    domain: "Campo de investigación",
    domainPlaceholder: "p. ej., ingeniería neuronal",
    topic: "Tema de investigación",
    topicPlaceholder: "p. ej., interfaces cerebro-computadora en rehabilitación motora",
    purpose: "Propósito de la investigación",
    audience: "Audiencia",
    audiencePlaceholder: "p. ej., investigadores en medicina de rehabilitación",
    depth: "Profundidad de investigación",
    timeRange: "Rango de tiempo",
    yearStart: "Año de inicio",
    yearStartPlaceholder: "p. ej., 2015",
    yearEnd: "Año de fin",
    yearEndPlaceholder: "p. ej., 2026",
    yearTo: "a",
    languages: "Idiomas",
    geographicScope: "Alcance geográfico",
    geographicScopePlaceholder: "p. ej., global",
  },
  dimensions: {
    custom: "Dimensión personalizada",
    customTitle: "Solo en la versión de escritorio",
  },
  sourcePref: {
    paper: "Revistas, preprints y material de congresos",
    documentation: "Documentación oficial y guías institucionales",
    web_page: "Prensa sectorial y medios especializados",
    repository: "Código e implementaciones de código abierto",
    dataset: "Datos públicos y material experimental",
    book: "Manuales, monografías y guías de referencia",
    video: "Clases y grabaciones de congresos",
  },
  footer:
    "La frecuencia de actualización está fijada en manual (update_frequency: manual); la investigación incremental automática llegará en una versión posterior.",
};

export default config;
