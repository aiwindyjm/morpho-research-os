# Worker Protocol (v1.0)

Normative contract between the Tauri Rust Core and the Python research worker. The request/response and event schemas are frozen in [`packages/schemas/`](../../packages/schemas/README.md) (`worker-*.v1.json`); every message is a **closed envelope** — unknown fields are rejected by all three validation stacks. Implementations (Rust supervisor in scope C, worker transport in scope D) must consume these schemas; they must not extend them ad hoc.

## Transport and lifecycle

- The Rust Core spawns one worker process and supplies, at spawn time (process environment, never inside job payloads): an **ephemeral session token** and the **protocol version** it expects.
- Every request carries `Authorization: Bearer <session-token>`; the worker rejects other tokens with the error envelope (`WORKER_NOT_AVAILABLE`, retryable `false`).
- The supervisor polls `GET /health` during startup, performs the compatibility handshake via `GET /version`, and restarts the process with bounded backoff on crash. A protocol **major mismatch is not restartable**: the supervisor refuses to submit jobs and reports `WORKER_NOT_AVAILABLE` with a developer detail naming both versions (see `docs/development/VERSIONS.md`).
- The protocol version equals the major.minor of the frozen `worker-*.v1` schemas (`"1.0"` today); implementations must not declare an independent number.

## Endpoints

| Endpoint | Request schema | Response schema | Notes |
|---|---|---|---|
| `GET /health` | — | `worker-health.v1.json` | Process status (`ok`/`degraded`), worker version, protocol version. |
| `GET /version` | — | `worker-version.v1.json` | Compatibility handshake; `capabilities` lists executable job types. |
| `POST /jobs` | `worker-job-request.v1.json` | `worker-job-response.v1.json` | `job_id` is minted by the Rust Core. Same `idempotency_key` returns the existing job with `duplicate: true`. |
| `GET /jobs/{id}` | — | `worker-job-status.v1.json` | Transport-level status; domain task state lives in `ResearchTask` records owned by the core. |
| `POST /jobs/{id}/cancel` | — | `worker-cancel-response.v1.json` | Cooperative cancellation at the next checkpoint boundary. Cancelling a finished job returns the error envelope. |
| `GET /jobs/{id}/events` (SSE) | — | `worker-event.v1.json` stream | Ordered, append-only, reconnectable. |

Errors: every non-2xx response uses `worker-error.v1.json` with the frozen code list in [`ERRORS.md`](ERRORS.md).

## Event stream semantics

- **Ordering:** `seq` is strictly increasing per job; the worker never re-numbers events.
- **Reconnect:** clients pass the last seen `event_id`/`seq` (SSE `Last-Event-ID` or `from_seq`); the worker replays from the next `seq` and signals gaps instead of silently skipping.
- **Append-only:** events are never mutated or deleted during a job's lifetime.
- **Redaction:** `payload` and `error.developer_detail` must never contain secrets, raw LLM responses, or user vault content. Redaction happens in the worker before emission; the supervisor forwards events verbatim.
- **Termination:** exactly one terminal event (`job.completed`, `job.failed`, or `job.cancelled`) ends a stream; no events follow a terminal one.

## Status vocabulary

Worker job status (`queued | running | succeeded | failed | cancelled`) is transport-level and deliberately distinct from the domain task state machine (`PENDING → … → COMPLETED`, PRD section 7). The Orchestrator maps worker outcomes onto domain transitions; only it may write domain state.

## Worked examples

Valid instances of every message live in the contract corpus: `packages/schemas/fixtures/cases/worker-*/valid-001.json`. The invalid counterparts (`invalid-*.json`) document guaranteed rejections (unknown enum values, out-of-range `seq`, non-closed envelopes, empty identifiers).

## Draft extensions (ADR-024, Proposed — NOT covered by the frozen v1.0 gates)

ADR-024 (status: Proposed, awaiting maintainer ratification) extends the draft W2-02 job envelope and adds a results endpoint. **None of this is part of the frozen `worker-*.v1.json` schemas above**; passing those schema gates does not validate these surfaces. The deltas, itemized:

1. **`POST /jobs` optional `plan` member** (envelope extension): when present, the worker executes exactly the given task tree (core task ids verbatim, dependency edges, per-task `params` including `query`, `topic`, `languages`, `source_types`, `source_domains`) and neither re-plans nor self-approves. `approve_plan: true` remains required as defense in depth.
2. **`GET /jobs/{id}/results`** returns `{ "schema_version": "1", "job_id": "...", "records": [ { "kind": ..., "record": ... } ] }` where `kind` ∈ `source | source-content | extraction | node | relation | claim | evidence | dropped | validation-report | note | incremental-report` and each `record` is the worker's strict pydantic model (`extra="forbid"`). There is no frozen JSON Schema for this envelope yet — ratifying one (and where it lives in `packages/schemas/`) is part of the pending ADR-024 decision.

The Rust core's ingestion enforces the following semantics on this surface regardless (review R6 — `deny_unknown_fields` alone is not validation):

- `schema_version` must be a supported version (`"1"`); anything else is rejected.
- The envelope's `job_id` must equal the job the core drained, and the referenced run must exist, belong to the target project, and carry that job as its persisted `worker_job_id` (migration 004 binding). `records` is a required member.
- Closed vocabularies are enforced per record: source types, node types, claim review statuses (ADR-016), confidence states, relation directions, evidence directions, and content classes; evidence records must carry at least one locator anchor (RES-06).
- Cross-record references must resolve (sources within the batch; nodes and claims within the batch or already ingested for the same project). Unresolved references reject the whole batch — references are never silently skipped.
- The whole batch commits or rolls back atomically; re-ingesting the same batch is a no-op. The atomicity extends to the CONTENT CACHE: every `source-content` payload's SHA-256 must equal its declared fingerprint (the worker's `content_fingerprint` is sha256 of the bytes), payloads publish through unique temp files + atomic rename, a rolled-back batch removes the files it created, and a committed cache payload can never be mutated by a later failing batch (see `docs/DATA_MODEL.md`).
- Worker-minted ids are stored under project-scoped primary keys (see `docs/DATA_MODEL.md`).
- Result DELIVERY is a separate durable fact from execution: the core's `runs.delivery_status` (`pending`/`delivered`/`failed`/`unknown`, migration 006) flips to `delivered` only inside the ingestion transaction; exhausted automatic delivery retries park durably as `failed` (observable in every read model) and re-arm with backoff while the job lives; a core restart converges undeliverable runs to `failed` with an auditable event. `run.completed`/`job.completed` therefore never imply the results are committed.

## Change policy

Additive changes (new optional fields, new event types) bump the schema minor and the `protocol_version` enum within major 1. Breaking changes require new `worker-*.v2.json` schemas, an ADR, and a version-policy update per `packages/schemas/README.md` and `docs/development/VERSIONS.md`.
