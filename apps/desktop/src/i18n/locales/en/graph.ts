/**
 * English graph resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: knowledge
 * graph, node, relation, dimension, confidence, evidence).
 */
const graph = {
  kicker: "Knowledge Graph",
  title: "Research relationship map",
  description:
    "Follow node relations back to sources and evidence instead of admiring a pretty picture.",
  showList: "List view (accessible)",
  showGraph: "Graph view",
  exportImage: "Export image",
  desktopOnly: "Desktop build only",
  empty: {
    title: "The graph is still empty",
    description:
      "Once a research run finishes normalization, entities and relations are projected into a 2D graph.",
  },
  filter: {
    byType: "Filter by type",
    typeAll: "All nodes",
    typeConcept: "Concepts",
    typeTechnology: "Technology",
    typeCompany: "Companies",
    typePaper: "Papers",
    cluster: "Cluster by dimension",
    clusterTitle: "Lay out columns per research dimension",
    search: "Search nodes",
    searchPlaceholder: "Search by title…",
    byDimension: "Filter by dimension",
    dimensionAll: "All dimensions",
    byConfidence: "Filter by confidence state",
    confidenceAll: "All confidence",
    byRelation: "Filter by relation type",
    relationAll: "All relations",
    yearFrom: "Start year",
    yearFromOption: "From year",
    yearTo: "End year",
    yearToOption: "to",
  },
  counts: "{{nodes}} nodes · {{relations}} relations",
  inspector: {
    aria: "Graph inspector",
    placeholderList: "Select a node in the list to see details.",
    placeholderGraph: "Select a node to see details.",
    current: "Current selection",
    closeAria: "Close details",
    noSummary: "No summary yet",
    sourceCount: "Sources",
    relationCount: "Relations",
    relationsHeading: "Relations ({{total}})",
    openMarkdown: "Open in Markdown",
  },
  canvas: {
    aria: "Knowledge graph (2D force-directed layout)",
    caption: "Knowledge node list (graph alternative view)",
    nodeAria: "{{title}} ({{type}}, confidence {{confidence}})",
    edgeAria: "Relation: {{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "Node",
    type: "Type",
    dimension: "Dimension",
    confidence: "Confidence",
    year: "Year",
    sourcesClaims: "Sources/Claims",
  },
};

export default graph;
