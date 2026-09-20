# Repository Structure

`apps/desktop`: React/Vite UI plus Tauri Rust shell. `apps/research-worker`: Python package and process entrypoint. `packages/schemas`: canonical JSON Schema and generated Zod/Pydantic/Serde bindings. `packages/types`: shared TypeScript domain types. `packages/ui`: tokenized primitives and registered components. `packages/prompts`: versioned prompt assets. `docs`: normative product, architecture, data, API, frontend, backend, AI, testing, development rules. `scripts`: setup/check/codegen. `examples/fixtures`: offline golden datasets. `tests`: cross-boundary and E2E support.

## Directory ownership map

Each directory has exactly one responsibility and one owning scope. First-round ownership follows the five parallel build workgroups (A foundation/contracts, B frontend, C Rust core, D Python engine, E integration quality); later work follows the same boundaries through task packages.

| Path | Responsibility | Owning scope | Boundaries |
|---|---|---|---|
| `apps/desktop/` (frontend) | React presentation, typed query state, registered components | B | No SQLite, filesystem, secrets, worker process, or Rust-internal imports. |
| `apps/desktop/src-tauri/` | Tauri 2 Rust Core: IPC, SQLite, migrations, filesystem/Vault, keychain, config, worker supervisor | C | No research logic, no UI components, no provider network calls. |
| `apps/research-worker/` | Python worker: orchestration, provider/search adapters, extraction, validation, normalization | D | Returns validated results and events; never writes Vault, SQLite, or UI state. |
| `packages/schemas/` | Canonical versioned JSON Schemas, Zod/Pydantic/Serde binding entries, contract fixtures | A | Contract source of truth; no business logic, no runtime services. |
| `packages/types/` | Shared TypeScript domain types derived from `packages/schemas` | B | Must re-export/derive from `@morpho/schemas`; must not redefine contract fields. |
| `packages/ui/` | Design-token primitives and the component registry | B | No business components, no direct service/IPC calls, no token drift. |
| `packages/prompts/` | Versioned prompt assets with metadata | D (prompt assets), A (metadata specification) | Every prompt declares input/output schema references and golden cases. |
| `examples/fixtures/` | Offline synthetic fixtures and golden research datasets | A (envelope specification and seed fixtures), E (golden datasets) | Synthetic or clearly licensed content only; no private research data. |
| `tests/` | Cross-boundary fixture loaders, architecture checks, E2E harness | E | Mocks and fixtures only; never real providers or keys. |
| `scripts/` | Setup, check, and codegen entry points | A | Read-only checks; no product runtime code. |
| `docs/` | Normative specifications | All groups within their task scope | Must not create competing product versions; `docs/PRD.md` is canonical. |
| `prototype/` | Static pre-architecture prototype | Maintainer | Reference only; not part of the product build. |
| `private/` | Local execution rules and conversation journals | Maintainer | Local-only; no files or placeholders may be tracked by Git. |

## Dependency direction

```text
apps/desktop (frontend)
  ├──> packages/ui, packages/types ──> packages/schemas (Zod bindings)
  └──> typed Tauri commands/events only (never direct backend access)
apps/desktop/src-tauri (Rust Core)
  └──> Python worker via the versioned worker protocol only
apps/research-worker (Python)
  └──> packages/schemas (Pydantic bindings); results flow back as validated records
```

Allowed imports always point inward or sideways against this graph: UI packages may depend on `packages/schemas`; nothing under `apps/` is imported by `packages/`; the Rust core and the worker communicate only through the frozen worker protocol, never by direct function calls, shared database handles, or ad-hoc files.
