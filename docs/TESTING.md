# Testing

Rust unit/IPC integration; frontend Vitest/component tests; worker pytest; Playwright E2E against mock worker/providers. Required scenarios: task state/DAG recovery, deduplication, claim/evidence validation, vault merge protection, retry/cache reuse, and worker crash recovery. Golden fixtures live in `examples/fixtures`.

## Quality gates

Gates are offline: no test may call a real provider, use an API key, or require network access to an external service. A gate that has no runnable target yet is skipped explicitly (in CI via the `hashFiles` conditions in `.github/workflows/ci.yml`) — it never passes vacuously, and it activates automatically once its target lands.

| Gate | Command (repository root) | Covers | Status |
|---|---|---|---|
| Docs & boundary | `scripts/check-task-status.ps1`, `scripts/check-public-boundary.ps1` | Required files, bilingual README parity, task tracking, private boundary | Active (`ci.yml` docs job; public boundary also in `contracts.yml`) |
| Fixture envelope | `uv run --with jsonschema python scripts/validate-fixture.py --all` | Every fixture under `examples/fixtures/` — contract variant (`minimal/`) and dataset variant (three golden datasets) — validates against the unified `fixture-envelope` schema (ADR-017) and its referenced contracts | Active (`ci.yml` fixture-envelope job) |
| Contract (TypeScript) | `pnpm -r run typecheck && pnpm -r run test` | Zod bindings + canonical JSON Schema on the shared corpus | Active (`ci.yml` schemas-typescript job) |
| Contract (Python) | `uv run --package morpho-schemas pytest packages/schemas/py/tests -q` | Pydantic bindings + canonical JSON Schema on the shared corpus | Active (`ci.yml` schemas-python job) |
| Contract (Rust) | `cargo fmt --all --check && cargo clippy -p morpho-schemas --all-targets -- -D warnings && cargo test --workspace --locked` | Serde bindings on the shared corpus; workspace tests cover all member crates, including the SQLite migration tests (`apps/desktop/src-tauri/tests/migrations.rs`) | Active (`ci.yml` schemas-rust job) |
| Contract drift & fixtures | `powershell -File scripts/check-contracts.ps1` | Schema registry consistency and every golden fixture envelope | Active (`contracts.yml`) |
| Architecture boundary | `powershell -File scripts/check-architecture.ps1` and `... -SelfTest` | Frontend/worker boundary detector and its self-test | Active (`contracts.yml`) |
| Cross-language fixture loaders | `powershell -File tests/fixtures-support/run-fixture-checks.ps1` (Node `--test`, pytest, and cargo loader suites) | Tri-language loader parity on the golden fixtures | Active (`contracts.yml`) |
| Frontend Vitest | `pnpm -r run test` | Every workspace package with a `test` script, including the desktop frontend's Vitest suites, runs in CI via the same `pnpm -r run test` invocation as the contract leg | Active (`ci.yml` schemas-typescript job) |
| Migration checks | `cargo test --workspace --locked` (covers `apps/desktop/src-tauri/tests/migrations.rs`) | Numbered SQLite migration validity | Active (`ci.yml` schemas-rust job) |
| Playwright E2E | — | E2E against the mock worker/providers | Future (TEST-04) |
| Whitespace hygiene | `git diff --check` | No trailing whitespace / conflict markers before commits | Active (local, per task) |

Local commands match CI exactly; CI is the same invocation, not a stricter variant. Playwright E2E is added by TEST-04 under the same rules; any new gate names its workflow and job here when it lands.

## Mocks and fixtures

Mock providers and golden fixtures follow [`docs/testing/MOCKS.md`](testing/MOCKS.md) and the envelope specification in [`examples/fixtures/README.md`](../examples/fixtures/README.md). Contract validation uses the shared corpus under `packages/schemas/fixtures/cases/` (see [`packages/schemas/README.md`](../packages/schemas/README.md)).
