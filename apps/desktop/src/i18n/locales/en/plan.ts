/**
 * English plan resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: plan, task,
 * run, review, approve/reject).
 */
const plan = {
  kicker: "Research plan / {{status}}",
  statusDraft: "Pending review",
  fallbackTitle: "Research plan",
  noPlanDescription:
    "Planner only produces plan drafts for review; runnable tasks are created after approval.",
  regenerate: "Regenerate",
  reject: "Reject plan",
  approveAria: "Approve plan",
  approve: "Confirm and start",
  startRun: "Start run",
  runStartedToast: {
    title: "Research run started",
    detail: "Watch live progress on the Tasks page.",
  },
  runStartFailed: "Starting the run failed.",
  regenerateApproved: "Regenerate plan",
  generate: "Generate research plan",
  actionError: {
    title: "Action not completed",
    fallback: "The action failed. Please try again.",
  },
  runAlert: {
    title: "Run state: {{state}}",
    detail:
      "The plan has entered execution ({{total}} tasks in total); to adjust the plan, pause tasks on the Tasks page or wait for this run to finish.",
  },
  empty: {
    title: "No research plan yet",
    description:
      "Complete the research config first, then click “Generate research plan”. The plan will list search and extraction tasks per dimension for your review.",
  },
  summary: {
    tasks: "Planned tasks",
    sources: "Sources",
    dimensions: "Research dimensions",
    reviews: "To review",
  },
  group: {
    expandAria: "Expand group",
    collapseAria: "Collapse group",
    taskCount: "{{total}} tasks",
  },
  task: {
    edit: "Edit task",
  },
  locked: {
    title: "Plan locked",
    detail:
      "This run has been created, so the plan can no longer be modified; pause tasks or regenerate the plan after the run finishes.",
  },
  editDialog: {
    title: "Edit plan task",
    description:
      "Only the title and description can be edited; task kind and execution order are decided by the Orchestrator.",
    titleLabel: "Task title",
    descriptionLabel: "Task description",
    cancel: "Cancel",
    save: "Save changes",
    saveFailed: "Saving changes failed.",
  },
};

export default plan;
