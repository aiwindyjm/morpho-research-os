# API and Process Contracts

Typed Tauri commands use `{schema_version, request_id, data, error}`. Events use `research.event.v1` with run/task IDs, sequence, timestamp, type, and redacted payload.

Worker: `GET /health`, `GET /version`, `POST /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, `GET /jobs/{id}/events` (SSE). Startup passes an ephemeral session token and protocol version. Rust checks compatibility, restarts with bounded backoff, marks interrupted tasks resumable, and reports `WORKER_NOT_AVAILABLE` after exhaustion. Secrets remain in the OS keychain.
