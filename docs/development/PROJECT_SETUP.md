# Project Setup Status

The repository contains architecture, governance, documentation, contract drafts, GitHub templates, an initial CI check, the monorepo toolchain contracts, the production frontend (`apps/desktop`), and the Tauri Rust core (`apps/desktop/src-tauri`). The Python worker, Research Agent, search implementation, and knowledge extractor are added only by their owning tasks (see the ownership map in `docs/architecture/REPOSITORY.md`). Development is divided into small public slices; private batching and timing stay outside Git.

## Structural directories

- `apps/desktop/` — the Tauri and React application code (frontend scope B, `src-tauri` scope C); the production frontend and Rust core are implemented here.
- `apps/research-worker/` — reserved for the Python worker process (scope D).
- `packages/schemas/` — canonical cross-language contracts with Zod/Pydantic/Serde binding entries (scope A).
- `packages/ui/` — tokenized UI primitives and registered components (scope B).
- `packages/prompts/` — versioned prompt assets with metadata (assets scope D, metadata specification scope A).
- `examples/fixtures/` — deterministic, offline research fixtures (specification and seeds scope A, golden datasets scope E).
- `tests/` — cross-boundary and end-to-end test support (scope E).
- `scripts/` — setup, check, and codegen entry points (scope A).

Directories that are still placeholders must not receive implementation until the corresponding phase specification and its owning task are approved. Toolchain entry points and commands are defined in [Toolchain and commands](#toolchain-and-commands) below and in `docs/DEVELOPMENT.md`.

## Toolchain and commands

The root workspace wires three toolchains; each owns a disjoint directory set. Commands run from the repository root unless noted. Workspace membership is glob-based and activates when a package directory gains a manifest — no manual registry edits when a new app or package lands.

| Toolchain | Workspace file | Member globs | Primary commands |
|---|---|---|---|
| pnpm | `pnpm-workspace.yaml`, root `package.json` | `apps/*`, `packages/*`, `packages/*/ts` | `pnpm install`, `pnpm -r run test`, `pnpm -r run typecheck` |
| Cargo | root `Cargo.toml` | `packages/*/rust` and `apps/desktop/src-tauri` (explicit members) | `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --locked` |
| uv (Python) | root `pyproject.toml` | `packages/*/py` and later `apps/research-worker` (explicit members) | `uv sync --all-packages`, `uv run --package <name> pytest` |

- `scripts/check-toolchain.ps1` verifies that every toolchain which currently has targets is callable with an acceptable minimum version; toolchains without targets are skipped explicitly, mirroring the `hashFiles` conditions in CI. Run it with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-toolchain.ps1` (the same invocation style applies to the other scripts under `scripts/`).
- Lockfiles (`pnpm-lock.yaml`, `Cargo.lock`, `uv.lock`) are committed; CI installs with `--frozen-lockfile` / `--locked` / `--frozen`.
- Node.js version policy comes from root `package.json` (`packageManager` pins pnpm; `engines` sets the minimum Node); Rust uses stable; Python is managed by uv per the root `pyproject.toml`.
