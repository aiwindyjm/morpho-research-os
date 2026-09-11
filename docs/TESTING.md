# Testing

Rust unit/IPC integration; frontend Vitest/component tests; worker pytest; Playwright E2E against mock worker/providers. Required scenarios: task state/DAG recovery, deduplication, claim/evidence validation, vault merge protection, retry/cache reuse, and worker crash recovery. Golden fixtures live in `examples/fixtures`.
