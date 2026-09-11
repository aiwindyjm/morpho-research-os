# AI Engineering Entry Point

Before changing code, read `DO_NOT_BREAK.md`, `docs/ARCHITECTURE.md`, the relevant feature/page spec, and applicable rules under `docs/`.

For the maintainer's local execution workflow, also read `private/LOCAL_AI_EXECUTION_RULES.md` when that file exists. It is intentionally ignored by Git and must never be copied into public documentation, commits, Issues, PRs, or releases. The public rules in this file and the architecture invariants always apply.

Implement approved specifications, fix bugs, refactor within boundaries, add tests, update docs, and extend registered components/providers. Changing technology, schemas, IPC/event contracts, navigation, global tokens, persistence semantics, worker protocol, or provider interfaces requires an ADR.

- Frontend never accesses SQLite, filesystem, secrets, or worker processes directly.
- LLM output is parsed, validated, normalized, then persisted; it never mutates the vault directly.
- Reuse registered components and tokens. No new UI framework or state library.
- Durable schema changes require a numbered migration and contract update.
- User-modified Markdown is never silently overwritten.
- Use mocks and fixtures; tests never call real providers.
- Work in small, independently verifiable increments. Each increment needs an explicit scope, acceptance checks, and a reviewable diff.
- The exact local batching and timing of future increments is private execution metadata. Public history must describe the actual change accurately; it must not contain private schedules or personal operating notes.
- Local conversation journals are private user data. Store them under `private/conversations/`, keep them out of Git, and never paste them into issues, PRs, logs, prompts, or telemetry without explicit user action.
- The prototype may use browser-local storage and explicit export. Only the Rust Core may later write daily conversation files to disk.
