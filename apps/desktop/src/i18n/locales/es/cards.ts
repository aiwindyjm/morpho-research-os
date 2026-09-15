/**
 * Spanish cards resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: fuente, afirmación,
 * evidencia, nodo de conocimiento).
 */
const cards = {
  tier: {
    pending: "Por evaluar",
    high: "Alta calidad",
    medium: "Media",
  },
  sourceRow: {
    openAria: "Abrir fuente",
  },
  quality: {
    rationale:
      "Calidad de la fuente: autoridad {{authority}} · pertinencia {{fitness}} — {{rationale}} (la calidad describe la aptitud para el propósito, no la verdad factual)",
    pending: "La calidad de la fuente aún no se ha evaluado.",
  },
  knowledge: {
    sourceCount: "{{total}} fuentes",
    claimCount: "{{total}} afirmaciones",
  },
  evidence: {
    none: "No hay evidencia registrada para esta afirmación.",
    locator: "Localizador: {{kind}} · {{value}} · recuperado {{date}}",
    quote: "«{{quote}}»",
    directionSupport: "Apoya",
    directionContradict: "Contradice",
  },
  claim: {
    meta: "Tema: {{subject}} · confianza {{confidence}} · alcance: {{scope}}",
    collapse: "Ocultar evidencia",
    expand: "Ver evidencia ({{total}})",
  },
};

export default cards;
