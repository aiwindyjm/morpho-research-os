/**
 * English assistant resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English. Saving to the journal is
 * always an explicit two-step action; the copy keeps that emphasis.
 */
const assistant = {
  aria: "AI research assistant",
  kicker: "Active project assistant",
  closeAria: "Close AI assistant",
  context: {
    loading: "Loading project context…",
    usingBefore: "Now using ",
    usingAfter: " as the research context",
  },
  navAria: "Assistant actions",
  error: {
    title: "Action not completed",
    fallback: "The assistant is temporarily unavailable. Please try again.",
  },
  decision: {
    empty: "Write the decision content first.",
    title: "Record decision",
    hint: "Decisions are saved within this project only; nothing is written until you click “Save decision”.",
    inputAria: "Decision content",
    inputPlaceholder: "e.g. Prioritize quantitative paper sources in the next round",
    save: "Save decision",
    saved: "Decision saved (explicit save; {{total}} in total).",
    listSummary: "Saved decisions ({{total}})",
  },
  journalSave: {
    title: "Save conversation to the journal",
    idle: "This conversation has {{total}} messages; nothing is written to the local journal until you click “Confirm save” — nothing is saved automatically.",
    groupAria: "Confirm saving the conversation",
    confirmDetail:
      "{{total}} messages will be saved to today's journal ({{date}}, local only).",
    confirm: "Confirm save",
    cancel: "Cancel",
    arm: "Save to journal",
    saved: "Saved {{total}} messages to today's journal.",
    viewJournal: "View journal →",
  },
  toast: {
    savedTitle: "Saved to the journal",
    savedDetail: "{{total}} messages in total (local only)",
  },
  entry: {
    header: "Conversation saved from the AI assistant (project: {{project}} · ID {{id}})",
    line: "[{{author}}] {{content}}",
    authorLabel: "User",
    unknownProject: "Unknown project",
  },
  footer: {
    note: "AI answers based on the current project workspace",
    openJournal: "Journal",
  },
};

export default assistant;
