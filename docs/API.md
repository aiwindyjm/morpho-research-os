# API and Process Contracts

Typed Tauri commands use `{schema_version, request_id, data, error}`. Events use `research.event.v1` with run/task IDs, sequence, timestamp, type, and redacted payload.

Worker: `GET /health`, `GET /version`, `POST /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, `GET /jobs/{id}/events` (SSE). Startup passes an ephemeral session token and protocol version. Rust checks compatibility, restarts with bounded backoff, marks interrupted tasks resumable, and reports `WORKER_NOT_AVAILABLE` after exhaustion. Secrets remain in the OS keychain.

The worker protocol (v1.0) is frozen in [`api/WORKER_PROTOCOL.md`](api/WORKER_PROTOCOL.md) with closed message envelopes in `packages/schemas/worker-*.v1.json`; the structured error envelope is frozen in [`api/ERRORS.md`](api/ERRORS.md) and `packages/schemas/worker-error.v1.json`.
