/**
 * English overview resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: coverage,
 * dimension, source, knowledge node, claim, gap, run).
 */
const overview = {
  kicker: "Research project / {{status}}",
  notStarted: "Not started",
  fallbackTitle: "Overview",
  editConfig: "Edit config",
  viewTasks: "View tasks →",
  planDraftTitle: "Approve the plan on the research plan page first",
  continueResearch: "Continue research →",
  empty: {
    title: "No project selected",
    description:
      "Select or create a research project in My Research first; its overview will appear here.",
    action: "Go to My Research",
  },
  metrics: {
    coverage: "Research coverage",
    coverageMeta: "{{done}} / {{total}} core dimensions complete",
    sources: "Sources",
    sourcesMeta: "{{total}} high quality",
    knowledge: "Knowledge nodes",
    knowledgeMeta: "{{total}} types",
    reviews: "Claims to review",
    reviewsMeta: "{{total}} conflicting",
    coverageProgressAria: "Coverage progress",
  },
  path: {
    kicker: "Research progress",
    title: "Current research path",
    viewAll: "View all →",
    empty:
      "No runnable tasks yet; approve the plan and start a run and tasks will appear here in dependency order.",
    executing: "Executing",
    waitingPredecessor: "Waiting on predecessors",
    progressAria: "Task completion progress",
    stateDone: "Done",
    stateReview: "To review",
    stateWaiting: "Waiting",
  },
  activity: {
    kicker: "Research activity",
    title: "Just now",
    live: "Live",
    empty:
      "No activity yet; once a research run starts, sources, claims, and knowledge nodes will appear here over time.",
  },
  dimensions: {
    kicker: "Coverage",
    title: "Research dimensions",
    viewKnowledge: "View knowledge →",
    progressAria: "{{dimension}} coverage progress",
  },
  coverage: {
    why: "Why this score?",
    taskCompletion: "Task completion {{score}} (weight {{weight}}): {{done}}/{{total}} tasks completed",
    knowledgeBreadth: "Knowledge breadth {{score}} (weight {{weight}}): {{total}} nodes",
    evidenceDensity: "Evidence density {{score}} (weight {{weight}}): {{total}} pieces of evidence",
    sourceDiversity:
      "Source diversity {{score}} (weight {{weight}}): {{total}} independent high-quality sources",
  },
  next: {
    kicker: "Next step",
    title: "Suggested next research",
    triggerCoverage: "Low coverage",
    triggerSources: "Not enough sources",
    createdTask: "Task “{{title}}” created.",
    createdTaskHint: "The new task appears on the Tasks page; pause or retry it at any time.",
    createTask: "Create research task →",
    dismissAria: "Dismiss this suggestion",
    dismiss: "Dismiss",
    empty: "No gap suggestions — coverage looks good.",
  },
};

export default overview;
