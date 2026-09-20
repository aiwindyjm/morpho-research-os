# Private Conversation Journal

The Morpho development process may produce useful design decisions in conversations with AI coding tools. These conversations are stored as a local private journal, separate from product knowledge and source code.

## Rules

- The canonical private location is `private/conversations/`.
- Files use one Markdown file per local calendar day: `YYYY-MM-DD.md`.
- The entire `private/` directory is ignored by Git, including placeholders such as `.gitkeep`. No files under it may be tracked. Create the local journal directory when needed.
- Conversation capture is explicit. Morpho must never silently upload, publish, or add conversation text to prompts, logs, Issues, PRs, telemetry, or the research Vault.
- A user may deliberately promote a decision into public documentation, an ADR, a PRD section, or a commit message after reviewing and redacting it.
- API keys, access tokens, private source content, and personal data must be removed before any promotion.

## Prototype behavior

The HTML prototype stores entries in browser `localStorage` and supports an explicit Markdown/JSON download. The browser cannot write directly into the workspace, so the downloaded daily file must be placed manually in `private/conversations/`.

## Product implementation

In the Tauri application, the React UI will call a typed command. Rust Core will append to the current local-day file using an atomic write, preserve prior entries, and keep the path outside the research Vault. The Worker and external providers receive no journal content unless a future feature explicitly includes selected, user-approved context.
