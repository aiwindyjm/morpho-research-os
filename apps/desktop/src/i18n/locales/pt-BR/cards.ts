/**
 * Brazilian Portuguese cards resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary: fonte,
 * afirmação, evidência, nó de conhecimento).
 */
const cards = {
  tier: {
    pending: "Para avaliar",
    high: "Alta qualidade",
    medium: "Média",
  },
  sourceRow: {
    openAria: "Abrir fonte",
  },
  quality: {
    rationale:
      "Qualidade da fonte: autoridade {{authority}} · adequação {{fitness}} — {{rationale}} (a qualidade descreve a adequação ao propósito, não a veracidade factual)",
    pending: "A qualidade da fonte ainda não foi avaliada.",
  },
  knowledge: {
    sourceCount: "{{total}} fontes",
    claimCount: "{{total}} afirmações",
  },
  evidence: {
    none: "Nenhuma evidência registrada para esta afirmação.",
    locator: "Localizador: {{kind}} · {{value}} · recuperado em {{date}}",
    quote: "“{{quote}}”",
    directionSupport: "Apoia",
    directionContradict: "Contradiz",
  },
  claim: {
    meta: "Assunto: {{subject}} · confiança {{confidence}} · escopo: {{scope}}",
    collapse: "Ocultar evidências",
    expand: "Ver evidências ({{total}})",
  },
};

export default cards;
