/**
 * English projects resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: project, plan,
 * task, source, knowledge, coverage).
 */
const projects = {
  kicker: "My Research",
  title: "All research projects",
  description:
    "Every topic is an independent research space. Switch, continue, or start new research at any time.",
  newResearch: "New research",
  empty: {
    title: "No research projects yet",
    description:
      "Create your first project and turn a research question into a knowledge base that keeps growing.",
  },
  search: "Search my research",
  count: "{{total}} projects",
  createCard: {
    title: "Start new research",
    hint: "Begin with a question",
  },
  card: {
    openAria: "Open project",
    statusDraft: "Draft",
    statusInProgress: "In progress",
    statusPaused: "Paused",
    coverage: "{{percent}}% coverage",
    notStarted: "Not started",
    taskCount: "{{total}} tasks",
    updatedAt: "Updated {{date}}",
    progressAria: "Project progress",
    enterWorkspace: "Open workspace",
    switchTo: "Switch to this project",
    configure: "Research config",
  },
  dialog: {
    title: "New research project",
    description:
      "Each project has its own configuration, plan, tasks, knowledge, and assistant context.",
    nameLabel: "Project name",
    namePlaceholder: "e.g. LLM inference optimization",
    descriptionLabel: "Description",
    descriptionPlaceholder:
      "In one sentence, what question should this project answer?",
    cancel: "Cancel",
    create: "Create project",
  },
  error: {
    nameRequired: "Project name cannot be empty.",
    createFailed: "Creation failed. Please try again.",
  },
};

export default projects;
