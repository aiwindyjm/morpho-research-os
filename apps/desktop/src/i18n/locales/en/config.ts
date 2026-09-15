/**
 * English config resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: research
 * config, plan, dimension, source, claim).
 */
const config = {
  kicker: "Research Config",
  title: "Define your research question",
  description:
    "These details determine the scope, depth, and source selection of the research plan.",
  cancel: "Cancel",
  discard: "Discard changes",
  save: "Save config",
  saveError: {
    title: "Cannot save",
    validation: "Config failed validation: {{issue}}",
    failed: "Saving failed. Please try again later.",
  },
  noProject: {
    title: "Select or create a project first",
    description:
      "Research config belongs to a specific project; switch to or create a project before configuring.",
  },
  section01: {
    title: "Research topic",
    help: "Start by clarifying what you want to understand and the end use.",
  },
  section02: {
    title: "Research scope",
    help: "The clearer the scope, the easier the plan is to execute and review.",
  },
  section03: {
    title: "Research dimensions",
    help: "Choose the angles the plan must cover; you can adjust them after the plan is generated.",
  },
  section04: {
    title: "Source preferences",
    help: "Morpho searches these sources first and keeps the provenance of every claim.",
  },
  field: {
    domain: "Research field",
    domainPlaceholder: "e.g. Neural engineering",
    topic: "Research topic",
    topicPlaceholder: "e.g. Brain–computer interfaces in motor rehabilitation",
    purpose: "Research purpose",
    audience: "Audience",
    audiencePlaceholder: "e.g. Rehabilitation medicine researchers",
    depth: "Research depth",
    timeRange: "Time range",
    yearStart: "Start year",
    yearStartPlaceholder: "e.g. 2015",
    yearEnd: "End year",
    yearEndPlaceholder: "e.g. 2026",
    yearTo: "to",
    languages: "Languages",
    geographicScope: "Geographic scope",
    geographicScopePlaceholder: "e.g. global",
  },
  dimensions: {
    custom: "Custom dimension",
    customTitle: "Desktop build only",
  },
  sourcePref: {
    paper: "Journals, preprints, and conference material",
    documentation: "Official docs and institutional guidance",
    web_page: "Industry reporting and specialist media",
    repository: "Code and open-source implementations",
    dataset: "Public data and experiment material",
    book: "Textbooks, monographs, and handbooks",
    video: "Lectures and conference recordings",
  },
  footer:
    "Update frequency is currently fixed to manual (update_frequency: manual); automatic incremental research arrives in a later release.",
};

export default config;
