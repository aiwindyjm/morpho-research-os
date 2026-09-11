# AI Engineering Entry Point

Before changing code, read `DO_NOT_BREAK.md`, `docs/ARCHITECTURE.md`, the relevant feature/page spec, and applicable rules under `docs/`.

Implement approved specifications, fix bugs, refactor within boundaries, add tests, update docs, and extend registered components/providers. Changing technology, schemas, IPC/event contracts, navigation, global tokens, persistence semantics, worker protocol, or provider interfaces requires an ADR.

- Frontend never accesses SQLite, filesystem, secrets, or worker processes directly.
- LLM output is parsed, validated, normalized, then persisted; it never mutates the vault directly.
- Reuse registered components and tokens. No new UI framework or state library.
- Durable schema changes require a numbered migration and contract update.
- User-modified Markdown is never silently overwritten.
- Use mocks and fixtures; tests never call real providers.
