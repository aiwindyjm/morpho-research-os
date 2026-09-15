/**
 * Spanish knowledge resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure; glossary: nodo de
 * conocimiento, afirmación, evidencia, Vault, fuente).
 */
const knowledge = {
  kicker: "Base de conocimiento",
  title: "Conocimiento extraído",
  description: "Los nodos son entidades y conceptos; las afirmaciones y la evidencia se guardan por separado.",
  filterAria: "Filtrar por tipo",
  filterAll: "Todos los tipos",
  exportVault: "Exportar Vault",
  exportTitle: "Exporta el conocimiento, las fuentes y las afirmaciones como un Vault de Markdown",
  toolbar: {
    sources: "Fuentes {{total}}",
    nodes: "Nodos de conocimiento {{total}}",
    claims: "Afirmaciones {{total}}",
  },
  empty: {
    title: "La base de conocimiento aún está vacía",
    description:
      "Cuando una ejecución de investigación termine la normalización, las entidades, afirmaciones y evidencias aparecerán aquí.",
  },
  tabs: {
    label: "Vistas de conocimiento",
    nodes: "Nodos de conocimiento",
    claims: "Afirmaciones y evidencia",
  },
  search: "Buscar nodos de conocimiento",
  searchPlaceholder: "Buscar títulos, resúmenes o alias…",
  nodeCount: "{{total}} nodos",
  noMatch: "No hay nodos de conocimiento coincidentes; prueba otras palabras clave o limpia los filtros.",
  claimsIntro:
    "Las afirmaciones son independientes de los nodos de conocimiento; las afirmaciones contradictorias coexisten y cada una conserva su propia evidencia.",
  unknownSubject: "Tema desconocido",
  conflictBadge: "En conflicto: se conservan tanto la evidencia que apoya como la que contradice",
  evidenceLoading: "Cargando evidencia…",
  toast: {
    conflictTitle: "La exportación terminó, pero hay conflictos que requieren atención manual",
    conflictDetail:
      "{{written}} archivos escritos, {{unchanged}} sin cambios; {{conflicts}} archivos se conservaron como propuestas de fusión por modificaciones locales ({{proposals}}). Directorio de exportación: {{root}}",
    successTitle: "Exportación del Vault completada",
    successDetail:
      "{{written}} archivos escritos ({{sources}} fuentes, {{claims}} afirmaciones, {{maps}} mapas), {{unchanged}} sin cambios. Directorio de exportación: {{root}}",
    errorTitle: "Falló la exportación del Vault",
    listSeparator: ", ",
    moreSuffix: "…",
  },
};

export default knowledge;
