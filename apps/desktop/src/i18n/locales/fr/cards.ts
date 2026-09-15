/**
 * Ressources cards françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise (glossaire :
 * source, affirmation, preuve, nœud de connaissance).
 */
const cards = {
  tier: {
    pending: "À évaluer",
    high: "Haute qualité",
    medium: "Moyenne",
  },
  sourceRow: {
    openAria: "Ouvrir la source",
  },
  quality: {
    rationale:
      "Qualité de la source : autorité {{authority}} · pertinence {{fitness}} — {{rationale}} (la qualité décrit la pertinence pour l'usage, pas la véracité factuelle)",
    pending: "Qualité de la source pas encore évaluée.",
  },
  knowledge: {
    sourceCount: "{{total}} sources",
    claimCount: "{{total}} affirmations",
  },
  evidence: {
    none: "Aucune preuve enregistrée pour cette affirmation.",
    locator: "Localisation : {{kind}} · {{value}} · récupérée le {{date}}",
    quote: "« {{quote}} »",
    directionSupport: "Corrobore",
    directionContradict: "Contredit",
  },
  claim: {
    meta: "Sujet : {{subject}} · confiance {{confidence}} · portée : {{scope}}",
    collapse: "Masquer les preuves",
    expand: "Voir les preuves ({{total}})",
  },
};

export default cards;
