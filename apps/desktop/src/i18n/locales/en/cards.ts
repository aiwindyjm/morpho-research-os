/**
 * English cards resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: source, claim,
 * evidence, knowledge node).
 */
const cards = {
  tier: {
    pending: "To evaluate",
    high: "High quality",
    medium: "Medium",
  },
  sourceRow: {
    openAria: "Open source",
  },
  quality: {
    rationale:
      "Source quality: authority {{authority}} · fitness {{fitness}} — {{rationale}} (quality describes fitness for purpose, not factual truth)",
    pending: "Source quality not yet evaluated.",
  },
  knowledge: {
    sourceCount: "{{total}} sources",
    claimCount: "{{total}} claims",
  },
  evidence: {
    none: "No evidence recorded for this claim.",
    locator: "Locator: {{kind}} · {{value}} · retrieved {{date}}",
    quote: "“{{quote}}”",
    directionSupport: "Supports",
    directionContradict: "Contradicts",
  },
  claim: {
    meta: "Subject: {{subject}} · confidence {{confidence}} · scope: {{scope}}",
    collapse: "Hide evidence",
    expand: "View evidence ({{total}})",
  },
};

export default cards;
