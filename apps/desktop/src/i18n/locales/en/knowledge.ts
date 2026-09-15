/**
 * English knowledge resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: knowledge node,
 * claim, evidence, Vault, source).
 */
const knowledge = {
  kicker: "Knowledge Base",
  title: "Extracted knowledge",
  description: "Nodes are entities and concepts; claims and evidence are stored separately.",
  filterAria: "Filter by type",
  filterAll: "All types",
  exportVault: "Export Vault",
  exportTitle: "Export knowledge, sources, and claims as a Markdown Vault",
  toolbar: {
    sources: "Sources {{total}}",
    nodes: "Knowledge nodes {{total}}",
    claims: "Claims {{total}}",
  },
  empty: {
    title: "The knowledge base is still empty",
    description:
      "Once a research run finishes normalization, entities, claims, and evidence will appear here.",
  },
  tabs: {
    label: "Knowledge views",
    nodes: "Knowledge nodes",
    claims: "Claims & evidence",
  },
  search: "Search knowledge nodes",
  searchPlaceholder: "Search titles, summaries, or aliases…",
  nodeCount: "{{total}} nodes",
  noMatch: "No matching knowledge nodes; try different keywords or clear the filters.",
  claimsIntro:
    "Claims are independent of knowledge nodes; contradictory claims coexist, each keeping its own evidence.",
  unknownSubject: "Unknown subject",
  conflictBadge: "Conflicting: supporting and contradicting evidence are both preserved",
  evidenceLoading: "Loading evidence…",
  toast: {
    conflictTitle: "Export finished, but conflicts need manual handling",
    conflictDetail:
      "{{written}} files written, {{unchanged}} unchanged; {{conflicts}} files kept as merge proposals due to local modifications ({{proposals}}). Export directory: {{root}}",
    successTitle: "Vault export complete",
    successDetail:
      "{{written}} files written ({{sources}} sources, {{claims}} claims, {{maps}} maps), {{unchanged}} unchanged. Export directory: {{root}}",
    errorTitle: "Vault export failed",
    listSeparator: ", ",
    moreSuffix: "…",
  },
};

export default knowledge;
