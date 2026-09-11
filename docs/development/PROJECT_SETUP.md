# Project Setup Status

The repository contains architecture, governance, documentation, contract drafts, GitHub templates, an initial CI check, and the monorepo toolchain contracts. Production frontend, Rust core, Python worker, Research Agent, search implementation, and knowledge extractor are added only by their owning tasks (see the ownership map in `docs/architecture/REPOSITORY.md`). Development is divided into small public slices; private batching and timing stay outside Git.

## Structural directories

- `apps/desktop/` — reserved for the Tauri and React application code (frontend scope B, `src-tauri` scope C).
- `apps/research-worker/` — reserved for the Python worker process (scope D).
- `packages/schemas/` — canonical cross-language contracts with Zod/Pydantic/Serde binding entries (scope A).
- `packages/ui/` — tokenized UI primitives and registered components (scope B).
- `packages/prompts/` — versioned prompt assets with metadata (assets scope D, metadata specification scope A).
- `examples/fixtures/` — deterministic, offline research fixtures (specification and seeds scope A, golden datasets scope E).
- `tests/` — cross-boundary and end-to-end test support (scope E).
- `scripts/` — setup, check, and codegen entry points (scope A).

Directories that are still placeholders must not receive implementation until the corresponding phase specification and its owning task are approved. Toolchain entry points and commands are defined in [Toolchain and commands](#toolchain-and-commands) below and in `docs/DEVELOPMENT.md`.

## Toolchain and commands

The root workspace wires three toolchains; each owns a disjoint directory set. Commands run from the repository root unless noted.

| Toolchain | Workspace file | Members | Primary commands |
|---|---|---|---|
| pnpm | `pnpm-workspace.yaml`, root `package.json` | `apps/desktop`, `packages/*` (TypeScript packages) | `pnpm install`, `pnpm -r run test`, `pnpm -r run typecheck` |
| Cargo | root `Cargo.toml` | Rust crates under `packages/*/rust` and later `apps/desktop/src-tauri` | `cargo fmt --check`, `cargo check --workspace`, `cargo test --workspace` |
| uv (Python) | root `pyproject.toml` | Python packages under `packages/*/py` and later `apps/research-worker` | `uv sync --all-packages`, `uv run --package <name> pytest` |

- `scripts/check-toolchain.ps1` verifies that the pinned tools are callable with the expected minimum versions.
- CI (`.github/workflows/ci.yml`) invokes the same commands; no check exists only in CI.
- Node.js is installed via the version pinned in root `package.json` (`packageManager` + `engines`); Rust uses stable; Python uses the version required by the root `pyproject.toml`.
