/**
 * English shell resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English. Brand names ("Morpho",
 * "Research project" fragment, "AI") stay as-is.
 */
const shell = {
  // Workspace view nav labels (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "My Research",
    overview: "Overview",
    config: "Research Config",
    plan: "Research Plan",
    tasks: "Tasks",
    sources: "Sources",
    knowledge: "Knowledge",
    graph: "Graph",
    journal: "Journal",
    settings: "Settings",
    reports: "Reports",
  },

  // Topbar
  breadcrumb: "Breadcrumb",
  noProjectSelected: "No project selected",
  saved: "Saved",
  helpUnavailable: "Help documentation is not available in the local build",
  help: "Help",
  localUser: "Local user",

  // Sidebar
  primaryNav: "Primary navigation",
  localWorkspace: "Local workspace",
  dataStaysLocal: "Data is stored on this device",
  closeNavigation: "Close navigation",
  navigationMenu: "Navigation menu",

  // WorkspaceLayout + AssistantDock
  skipToContent: "Skip to main content",
  mainViewAria: "{{view}} view",
  openNavigationMenu: "Open navigation menu",
  menu: "Menu",
  openAssistant: "Open AI assistant",
  assistant: "AI Assistant",
  closeAssistantPanel: "Close assistant panel",
  assistantPanelAria: "Morpho AI assistant",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "Loading…",
    noProjectSelected: "No project selected",
    researchProject: "Research project",
    currentWorkspace: "Current workspace",
    manageAll: "Manage all",
    projectListAria: "Project list",
    emptyProjects: "No projects yet — create your first one.",
    newProject: "New project",
    newProjectDialogTitle: "New research project",
    newProjectDialogDescription:
      "Each project has its own configuration, plan, tasks, knowledge, and assistant context.",
    nameLabel: "Project name",
    namePlaceholder: "e.g. LLM inference optimization",
    descriptionLabel: "Description",
    descriptionPlaceholder:
      "In one sentence, what question should this project answer?",
    cancel: "Cancel",
    create: "Create project",
    nameRequired: "Project name cannot be empty.",
    createFailed: "Creation failed. Please try again.",
    status: {
      draft: "Draft · not started",
      inProgress: "In progress · {{percent}}%",
      paused: "Paused · {{percent}}%",
    },
  },
};

export default shell;
