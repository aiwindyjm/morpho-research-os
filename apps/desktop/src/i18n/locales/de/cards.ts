/**
 * Deutsche Cards-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Quelle, Aussage, Beleg, Wissensknoten).
 */
const cards = {
  tier: {
    pending: "Zu bewerten",
    high: "Hohe Qualität",
    medium: "Mittel",
  },
  sourceRow: {
    openAria: "Quelle öffnen",
  },
  quality: {
    rationale:
      "Quellenqualität: Autorität {{authority}} · Eignung {{fitness}} — {{rationale}} (Qualität beschreibt die Eignung für den Zweck, nicht die faktische Wahrheit)",
    pending: "Quellenqualität noch nicht bewertet.",
  },
  knowledge: {
    sourceCount: "{{total}} Quellen",
    claimCount: "{{total}} Aussagen",
  },
  evidence: {
    none: "Für diese Aussage sind keine Belege erfasst.",
    locator: "Fundstelle: {{kind}} · {{value}} · abgerufen am {{date}}",
    quote: "„{{quote}}“",
    directionSupport: "Stützt",
    directionContradict: "Widerspricht",
  },
  claim: {
    meta: "Subjekt: {{subject}} · Konfidenz {{confidence}} · Geltungsbereich: {{scope}}",
    collapse: "Belege ausblenden",
    expand: "Belege ansehen ({{total}})",
  },
};

export default cards;
