/**
 * English sources resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: source,
 * quality, claim).
 */
const sources = {
  kicker: "Source Library",
  title: "Discovered sources",
  description:
    "Every source keeps its normalized address, type, quality information, and the claims it contributed to.",
  importLinks: "Import links",
  desktopOnly: "Desktop build only",
  qualityToggle: "Filter by quality",
  empty: {
    title: "No sources yet",
    description:
      "Approve the research plan and start a run; discovered sources will appear here.",
  },
  summary: {
    all: "All",
    high: "High quality",
    medium: "Medium",
    pending: "To evaluate",
  },
  search: "Search sources or keywords",
  searchPlaceholder: "Search titles or addresses…",
  filter: {
    all: "All types",
    paper: "Papers",
    documentation: "Official docs",
  },
  count: "{{total}} sources",
  noMatch: "No matching sources; try different keywords or clear the filters.",
};

export default sources;
