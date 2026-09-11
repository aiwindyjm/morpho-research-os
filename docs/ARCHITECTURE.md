# Architecture

Tauri 2 hosts a React/TypeScript UI and Rust Core. Rust owns SQLite, filesystem, OS keychain, configuration, IPC, and Python worker lifecycle. A versioned local HTTP/JSONL worker protocol connects Rust to `apps/research-worker`, which runs a lightweight Orchestrator plus specialized workers. Shared JSON Schema is validated by Zod, Pydantic, and Serde.

Flow: UI → typed Tauri commands/events → Rust services/repositories → worker jobs/events → normalized domain records → SQLite indexes plus Markdown Vault artifacts. V0.1 uses one worker process, SQLite, filesystem cache, OpenAI-compatible providers, and a D3 2D graph. SSE streams append-only worker events; commands remain request/response. Jobs have durable IDs, leases, checkpoints, retries, cancellation, and crash recovery.
