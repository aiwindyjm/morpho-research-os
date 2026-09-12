# Changelog
All notable changes are documented here. Architecture Phase initialization begins in 0.1.0-alpha.

## Unreleased

Rapid feature push — NOT yet verified by the maintainer. Merged the three workgroup branches (contracts, fixture tooling, Python research engine) and added the local-compute research loop: provider routing profiles (default/local/offline), optional SearXNG search adapter, and the `run_research` CLI with plan approval gate. Verified by automated suites only (pytest 193, vitest 99, cargo 86, cross-language fixture checks); the real-model smoke run used a local Ollama qwen3:8b. Contract ratification items (error codes, protocol version, event field names) remain open — see `docs/development/TASK_STATUS.md`.

Second functional push against a full PRD regression audit — again automated-suites-only, NOT yet verified by the maintainer:

- **Worker protocol**: full job HTTP surface (`POST /jobs`, `GET /jobs/{id}`, cancel, SSE `GET /jobs/{id}/events` with cursor replay), bearer-token auth, structured error envelopes, and the `python -m morpho_worker.serve` entrypoint (ADR-015-amended event contract on the wire).
- **Desktop integration**: real Rust↔worker HTTP transport and process supervision, event pump persisting canonical events into SQLite and re-emitting them to windows, and a 20-command Tauri IPC surface (projects, configs, plans, runs, sources/knowledge/claims/relations, secrets references, coverage, vault export). The frontend gained a real `TauriTransport` (auto-detected via `window.__TAURI__`, mock fallback for web preview/tests).
- **Task engine**: Rust-side orchestrator projection authority (ADR-019, migration 002) — PRD §7 state machine, dependency gating with explicit skip, checkpoint/result/error persistence, run rollup.
- **Research features**: incremental research (cross-run new/changed/conflicting fingerprint diff), writer stage (PRD §10 note projections with generated wikilinks), Rust coverage engine (0.4/0.3/0.2/0.1 formula with gap rules), native Claude and Gemini adapters.
- **Vault & secrets**: all 15 PRD vault folders incl. Sources/Claims/Maps MOC notes, idempotent wikilink rendering, optional OS-keychain secret store (off by default).
- **Frontend**: mobile navigation drawer fix (real defect), graph relation/confidence/year filters and dimension clustering, real reports view, explicit assistant-conversation-to-journal save, orphan card adoption.
- **Contracts & testing**: claim.v1.1 status/confidence split, unified fixture envelope, prompt frontmatter metadata (ADR-016–018); Playwright E2E suite (11 specs over the first-journey, drawer, journal save, states) and worker pytest now run in CI.
- Verified by: cargo 190+3 (desktop, schemas), pytest 255 (worker) + 68 (schemas), vitest 146 + 21 (desktop, ui), Playwright 11/11, fixture/contract gates — no human or real-provider testing performed; a real-python-process end-to-end smoke run and 17 not-yet-mapped frontend commands remain open (see ADR-019 phase 2).

