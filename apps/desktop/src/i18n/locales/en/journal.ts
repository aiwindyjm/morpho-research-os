/**
 * English journal resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English. The journal is private
 * local-only data (never uploaded, never in Git).
 */
const journal = {
  kicker: "Private Journal",
  title: "Journal",
  description:
    "Today's architecture and product discussions stay on this machine — never in Git or the research Vault.",
  downloadJson: "Download JSON",
  downloadMarkdown: "Download today's Markdown",
  count: "{{total}} entries",
  localOnly: "Local only",
  authorUser: "User",
  listEmpty: "No entries yet. Write down today's product decisions, questions, or next steps.",
  inputAria: "Journal entry",
  inputPlaceholder: "Record today's product decisions, questions, or next steps…",
  errorEmpty: "Write something to record first.",
  storageNote: "Saved to browser-local storage",
  save: "Save entry",
  rules: {
    kicker: "Storage rules",
    title: "A development record that is yours alone",
    items: {
      byLocalDate: "Grouped by local date",
      neverUploaded: "Never uploaded, never in Git",
      explicitDownload: "Explicit Markdown download when needed",
      privateFolder: "Can be moved into private/conversations/ manually",
    },
  },
  limits: {
    title: "Current limitations",
    detail:
      "The web preview cannot write to the workspace directly. The desktop build's Rust Core appends local files daily.",
  },
};

export default journal;
