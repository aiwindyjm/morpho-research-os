# Module Boundaries

React handles presentation and typed query state (Zustand for local UI, TanStack Query for async). Tauri Rust Core exposes commands/events and owns SQLite repositories, filesystem/vault service, OS keychain, config, and worker supervisor. Python Worker owns orchestration and provider/search adapters; it returns validated results and events. Knowledge and vault engines are domain services, never UI concerns. Frontend cannot read DB, keys, files, or processes; worker cannot write UI or bypass Rust persistence.

## Capability ownership matrix

Each row names the single layer that owns a sensitive capability. "Injected reference" means the owning layer resolves the reference and hands over only what the consuming layer is allowed to see.

| Capability | React UI | Rust Core | Python Worker |
|---|---|---|---|
| SQLite (runtime/index state) | Forbidden | **Owns** | Forbidden |
| Filesystem / Markdown Vault writes | Forbidden | **Owns** (atomic writes, user-edit detection) | Forbidden (returns validated records only) |
| OS keychain / secret values | Forbidden | **Owns** | Never persists or logs values |
| Provider credentials at call time | Forbidden | Resolves key reference, injects into worker process environment at spawn | Receives resolved value in memory only; never echoes it into events, logs, or job payloads |
| Worker process lifecycle | Forbidden | **Owns** (start, health, bounded restart, cancel, shutdown) | N/A |
| Network (external providers) | Forbidden | Local protocol traffic only | **Owns** through registered provider adapters |
| Prompt assets and LLM orchestration | Forbidden | Forbidden | **Owns** (Parse → Validate → Normalize → Persist hand-off) |
| Navigation and global design tokens | **Owns** (within approved registry) | N/A | N/A |

## Forbidden cross-layer behaviors

- UI importing or invoking SQLite, file APIs, keychain, worker processes, or Rust internals outside typed Tauri commands/events.
- Rust implementing research planning/extraction logic or calling provider HTTP APIs directly.
- Worker writing Markdown, mutating SQLite, or emitting UI state; worker output is always parsed, validated, and normalized before persistence.
- Provider-specific types leaking past adapters into the domain.
- A second copy of any contract: all cross-process payloads reference the frozen schemas in `packages/schemas/`.
- Any layer silently overwriting user-modified Markdown; Vault writes must go through the Rust merge-protection path.
