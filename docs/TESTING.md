# Testing

Rust unit/IPC integration; frontend Vitest/component tests; worker pytest; Playwright E2E against mock worker/providers. Required scenarios: task state/DAG recovery, deduplication, claim/evidence validation, vault merge protection, retry/cache reuse, and worker crash recovery. Golden fixtures live in `examples/fixtures`.

## Quality gates

Gates are offline: no test may call a real provider, use an API key, or require network access to an external service. A gate that has no runnable target yet is skipped explicitly (in CI via the `hashFiles` conditions in `.github/workflows/ci.yml`) — it never passes vacuously, and it activates automatically once its target lands.

| Gate | Command (repository root) | Covers | Status |
|---|---|---|---|
| Docs & boundary | `scripts/check-task-status.ps1`, `scripts/check-public-boundary.ps1` | Required files, bilingual README parity, task tracking, private boundary | Active |
| Fixture envelope | `uv run --with jsonschema python scripts/validate-fixture.py --all` | Offline fixtures validate against `fixture-envelope` schema | Active with W0-05 |
| Contract (TypeScript) | `pnpm -r run typecheck && pnpm -r run test` | Zod bindings + canonical JSON Schema on the shared corpus | Active with W2 freezes |
| Contract (Python) | `uv run --package morpho-schemas pytest packages/schemas/py/tests -q` | Pydantic bindings + canonical JSON Schema on the shared corpus | Active with W2 freezes |
| Contract (Rust) | `cargo fmt --all --check && cargo clippy -p morpho-schemas --all-targets -- -D warnings && cargo test --workspace --locked` | Serde bindings on the shared corpus; workspace tests cover all member crates | Active with W2 freezes |
| Whitespace hygiene | `git diff --check` | No trailing whitespace / conflict markers before commits | Active (local, per task) |

Local commands match CI exactly; CI is the same invocation, not a stricter variant. Future gates (frontend Vitest, Playwright E2E, migration and architecture checks) are added by TEST-03/TEST-04/REL-01 under the same rules.

## Mocks and fixtures

Mock providers and golden fixtures follow [`docs/testing/MOCKS.md`](testing/MOCKS.md) and the envelope specification in [`examples/fixtures/README.md`](../examples/fixtures/README.md). Contract validation uses the shared corpus under `packages/schemas/fixtures/cases/` (see [`packages/schemas/README.md`](../packages/schemas/README.md)).
