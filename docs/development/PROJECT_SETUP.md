# Project Setup Status

The repository currently contains architecture, governance, documentation, contract drafts, GitHub templates, and an initial CI check. It intentionally contains no production frontend, Rust core, Python worker, Research Agent, search implementation, or knowledge extractor. Development is divided into small public slices; private batching and timing stay outside Git.

## Structural directories

- `apps/desktop/` — reserved for Tauri and React application code.
- `apps/research-worker/` — reserved for the Python worker process.
- `packages/schemas/` — canonical cross-language contracts.
- `packages/ui/` — tokenized UI primitives and registered components.
- `packages/prompts/` — versioned prompt assets.
- `examples/fixtures/` — deterministic, offline research fixtures.
- `tests/` — cross-boundary and end-to-end test support.

Empty directories are placeholders for later phases; no implementation should be added until the corresponding phase specification is approved.
