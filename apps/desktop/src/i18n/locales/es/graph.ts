/**
 * Spanish graph resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: grafo de conocimiento,
 * nodo, relación, dimensión, confianza, evidencia).
 */
const graph = {
  kicker: "Grafo de conocimiento",
  title: "Mapa de relaciones de la investigación",
  description:
    "Sigue las relaciones de los nodos hasta las fuentes y la evidencia, en vez de quedarte mirando una imagen bonita.",
  showList: "Vista de lista (accesible)",
  showGraph: "Vista de grafo",
  exportImage: "Exportar imagen",
  desktopOnly: "Solo en la versión de escritorio",
  empty: {
    title: "El grafo aún está vacío",
    description:
      "Cuando una ejecución de investigación termine la normalización, las entidades y relaciones se proyectan en un grafo 2D.",
  },
  filter: {
    byType: "Filtrar por tipo",
    typeAll: "Todos los nodos",
    typeConcept: "Conceptos",
    typeTechnology: "Tecnología",
    typeCompany: "Empresas",
    typePaper: "Artículos",
    cluster: "Agrupar por dimensión",
    clusterTitle: "Organiza las columnas por dimensión de investigación",
    search: "Buscar nodos",
    searchPlaceholder: "Buscar por título…",
    byDimension: "Filtrar por dimensión",
    dimensionAll: "Todas las dimensiones",
    byConfidence: "Filtrar por estado de confianza",
    confidenceAll: "Todos los niveles de confianza",
    byRelation: "Filtrar por tipo de relación",
    relationAll: "Todas las relaciones",
    yearFrom: "Año de inicio",
    yearFromOption: "Desde el año",
    yearTo: "Año de fin",
    yearToOption: "a",
  },
  counts: "{{nodes}} nodos · {{relations}} relaciones",
  inspector: {
    aria: "Inspector del grafo",
    placeholderList: "Selecciona un nodo de la lista para ver los detalles.",
    placeholderGraph: "Selecciona un nodo para ver los detalles.",
    current: "Selección actual",
    closeAria: "Cerrar detalles",
    noSummary: "Aún no hay resumen",
    sourceCount: "Fuentes",
    relationCount: "Relaciones",
    relationsHeading: "Relaciones ({{total}})",
    openMarkdown: "Abrir en Markdown",
  },
  canvas: {
    aria: "Grafo de conocimiento (diseño de fuerzas 2D)",
    caption: "Lista de nodos de conocimiento (vista alternativa al grafo)",
    nodeAria: "{{title}} ({{type}}, confianza {{confidence}})",
    edgeAria: "Relación: {{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "Nodo",
    type: "Tipo",
    dimension: "Dimensión",
    confidence: "Confianza",
    year: "Año",
    sourcesClaims: "Fuentes/Afirmaciones",
  },
};

export default graph;
