/**
 * English reports resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: source,
 * knowledge node, claim, coverage, run).
 */
const reports = {
  kicker: "Reports",
  title: "Project research briefing",
  description:
    "A one-page summary generated from the current project's sources, knowledge, and coverage; full briefing export is coming later.",
  empty: {
    title: "Nothing to report yet",
    description:
      "Once research runs produce sources, knowledge nodes, and claims, the project briefing will be summarized here.",
  },
  metrics: {
    sources: "Sources",
    knowledge: "Knowledge nodes",
    claims: "Claims",
    coverage: "Research coverage",
  },
  dimensions: {
    kicker: "Coverage",
    title: "Dimension coverage table",
    caption: "Coverage and key inputs per research dimension",
    colDimension: "Dimension",
    colCoverage: "Coverage",
    colTasks: "Tasks completed",
    colNodes: "Knowledge nodes",
    colQualitySources: "High-quality sources",
  },
  runs: {
    kicker: "Run history",
    title: "Recent research runs",
    empty: "No research runs yet; events will appear here once a run starts.",
  },
  export: {
    kicker: "Export",
    soon: "Coming soon",
    title: "Export report",
    description:
      "The research briefing and Vault export arrive after pipeline integration; this page summarizes the data for now.",
  },
};

export default reports;
