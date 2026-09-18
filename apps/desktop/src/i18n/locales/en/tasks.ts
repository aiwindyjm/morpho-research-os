/**
 * English tasks resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English (glossary: task, run,
 * pause/resume/retry/cancel).
 */
const tasks = {
  kicker: "Research Tasks",
  title: "Work in progress",
  description: "Every task can be paused, retried, and traced back to its sources and results.",
  continueRun: "Continue run",
  runStartedToast: {
    title: "Research run started",
    detail: "Tasks will execute in dependency order.",
  },
  runBadge: "Run state: {{state}}",
  runDeliveryPending: "Finished; delivering results",
  runDeliveryFailed: "Finished; results not delivered",
  empty: {
    title: "No tasks yet",
    approved: "The plan is approved — click “Continue run” in the top right to create tasks.",
    draft: "Review and approve the plan on the Research Plan page first; tasks are created after approval.",
    generic: "Generate and approve a plan on the Research Plan page first.",
  },
  filterAria: "Filter by task state",
  tabs: {
    all: "All",
    active: "Active",
    review: "To review",
    done: "Completed",
  },
  lastUpdated: "Last updated {{date}}",
  col: {
    task: "Task",
    stage: "Stage",
    status: "State",
  },
  pill: {
    running: "Running",
    needsReview: "To review",
    completed: "Completed",
  },
  action: {
    menuAria: "Task actions",
    pause: "Pause",
    resume: "Resume",
    retry: "Retry",
    confirmContinue: "Confirm and continue",
    cancel: "Cancel",
    unsupportedTitle: "Not available in V0.1",
    unsupportedHint: "Per-task controls (pause/resume/retry/cancel) need per-task dispatch and arrive in a later version; for now you can stop the whole run with “Cancel run”.",
  },
  runStartFailedToast: {
    title: "Could not start the research run",
  },
};

export default tasks;
