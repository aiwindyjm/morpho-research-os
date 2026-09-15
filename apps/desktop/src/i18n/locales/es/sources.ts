/**
 * Spanish sources resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: fuente, calidad,
 * afirmación).
 */
const sources = {
  kicker: "Biblioteca de fuentes",
  title: "Fuentes descubiertas",
  description:
    "Cada fuente conserva su dirección normalizada, su tipo, su información de calidad y las afirmaciones a las que contribuyó.",
  importLinks: "Importar enlaces",
  desktopOnly: "Solo en la versión de escritorio",
  qualityToggle: "Filtrar por calidad",
  empty: {
    title: "Aún no hay fuentes",
    description:
      "Aprueba el plan de investigación e inicia una ejecución; las fuentes descubiertas aparecerán aquí.",
  },
  summary: {
    all: "Todas",
    high: "Alta calidad",
    medium: "Media",
    pending: "Por evaluar",
  },
  search: "Buscar fuentes o palabras clave",
  searchPlaceholder: "Buscar títulos o direcciones…",
  filter: {
    all: "Todos los tipos",
    paper: "Artículos",
    documentation: "Documentación oficial",
  },
  count: "{{total}} fuentes",
  noMatch: "No hay fuentes coincidentes; prueba otras palabras clave o limpia los filtros.",
};

export default sources;
