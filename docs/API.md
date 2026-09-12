# API and Process Contracts

Typed Tauri commands use `{schema_version, request_id, data, error}`. Domain research events use the frozen [`event.v1.json`](../packages/schemas/event.v1.json) contract (ADR-015): `schema_version` `"1.0"`, `event_id`, `sequence`, `occurred_at` (RFC 3339 UTC), `run_id` (nullable and omittable), `project_id`, a closed `type` vocabulary (`task.`/`run.`/`plan.`/`source.`/`claim.`/`review.` prefixes, plus `run.incremental_report` from Amendment 1), optional `task_id`/`summary`, and an already-redacted `payload`. Transport-level worker SSE events are a separate contract (`worker-event.v1.json`, `job.*` vocabulary).

The worker protocol request/response envelopes are frozen in [`api/WORKER_PROTOCOL.md`](api/WORKER_PROTOCOL.md) with closed message envelopes in `packages/schemas/worker-*.v1.json`; the structured error envelope is frozen in [`api/ERRORS.md`](api/ERRORS.md) and `packages/schemas/worker-error.v1.json`. The rest of this page describes what the implemented Python worker (`apps/research-worker`, entrypoint `python -m morpho_worker.serve`) and the Rust client (`apps/desktop/src-tauri/src/worker/`) actually put on the wire today; divergences from the frozen W2-02 envelopes are marked **draft**.

## Worker serve entrypoint

`python -m morpho_worker.serve` boots the HTTP worker on loopback with offline/mock providers — the serve path never holds credentials; routing to real providers is the Rust supervisor's configuration, delivered through the worker's config boundary. Environment:

| Variable | Meaning |
|---|---|
| `MORPHO_WORKER_HOST` | Bind host; defaults to `127.0.0.1`. |
| `MORPHO_WORKER_PORT` | Bind port (required; integer in 1–65535). |
| `MORPHO_WORKER_SESSION_TOKEN` | Bearer token supplied by the Rust supervisor (required; every endpoint checks `Authorization: Bearer <token>`). |

Startup prints one line to stdout — `morpho-worker listening on http://HOST:PORT protocol=1` — so supervisors wait on readiness instead of polling. Shutdown is graceful and exits 0: SIGTERM, SIGINT, or EOF on stdin (the supervisor closing the pipe) all stop accepting jobs, join in-flight job threads (bounded), and close the listener. Missing or invalid required environment is a startup error printed to stderr with exit code 2.

## Job endpoints

| Endpoint | Behavior |
|---|---|
| `GET /health` | `{schema_version, status, worker_version, protocol_version}`. |
| `GET /version` | Compatibility handshake: `{schema_version, worker_version, protocol_version, accepted_protocol_versions}` (**draft**: the protocol version is the string `"1"`, not the frozen `"1.0"` minor form). |
| `POST /jobs` | Strict request envelope `{schema_version: "1", kind, config, approve_plan}`; unknown fields are rejected. Only `kind: "research_run"` exists; the request fails with `PLAN_NOT_APPROVED` unless `approve_plan` is `true` (no DAG is ever built before plan approval). The worker — not the Rust core — mints the `job_id` (**draft** divergence from `worker-job-request.v1.json`, which has a core-minted durable id and `idempotency_key`). |
| `GET /jobs/{job_id}` | Job envelope with the mapped status (`PENDING`/`PLANNING`/`RUNNING`/`VALIDATING`/`NEEDS_REVIEW`/`PAUSED`/`COMPLETED`/`FAILED`/`CANCELLED`) plus task counts (**draft** status vocabulary). |
| `POST /jobs/{job_id}/cancel` | Cooperative cancel through the DAG runner; idempotent — cancelling a terminal job returns the terminal state (**draft**: the frozen cancel contract specifies an error envelope there). |
| `GET /jobs/{job_id}/events` | SSE stream of the job's events; see below. |

A `POST /compatibility` probe (requested vs. worker protocol version) also exists on the transport (**draft**, test-facing).

Error codes on this surface reuse the frozen `worker-error.v1.json` envelope shape but are **draft** transport codes: `UNAUTHORIZED` (401; missing or invalid bearer token), `NOT_FOUND` (404; unknown endpoint or job id), `BAD_REQUEST` (400; malformed JSON, unknown/missing envelope fields, invalid `ResearchConfig`, or an invalid event cursor), `UNSUPPORTED_JOB_KIND` (400; kind other than `research_run`), and `PLAN_NOT_APPROVED` (400; `approve_plan` not true). Unexpected transport-internal failures answer 500 with `WORKER_NOT_AVAILABLE`. These codes are not yet in the frozen `worker-error.v1.json` enum — freezing them is outstanding W2-02 work.

## Event stream (SSE)

`GET /jobs/{job_id}/events` frames every event with `id: <sequence>`, `event: <type>`, and a `data:` line holding the canonical `event.v1` envelope (`schema_version` `"1.0"`). Reconnect cursors come from the `Last-Event-ID` header and/or `?after_sequence=`; when both are present the larger (safer) cursor wins, and invalid values fail with `BAD_REQUEST`. The stream replays the backlog, stays open with comment heartbeats (`: morpho keep-alive`), and ends with a sentinel comment (`: morpho stream end (job_id=..., status=...)`) plus clean EOF once the job is terminal and fully delivered. One totally ordered, append-only sequence space per job (plan, run, and task events fold into it); payloads are redacted before storage.

### Canonical field names and read tolerance

Emitted envelopes use the canonical `event.v1.json` field names. Reading stays backward tolerant — the legacy draft names are accepted on parse so logs written by older workers keep parsing, but they are never emitted:

| Legacy (read-only) | Canonical (emitted) |
|---|---|
| `job_id` | `run_id` |
| `timestamp` | `occurred_at` |
| `seq` | `sequence` |
| `id` | `event_id` |
| `event_type` | `type` |
| `schema_version: "research.event.v1"` | `schema_version: "1.0"` |

### Type renames at append time

The worker's legacy draft event types canonicalize onto the closed `event.v1` vocabulary when appended. When several legacy types fold onto one canonical type, the original name is preserved in the payload (`phase`/`outcome`). Unknown types — including the transport `job.*` vocabulary and `run.incremental_report` — pass through unchanged.

| Legacy type | Canonical type | Payload note |
|---|---|---|
| `plan.created` | `plan.drafted` | — |
| `task.needs_review` | `review.requested` | — |
| `run.review_resolved` | `review.resolved` | — |
| `task.cancelled` | `task.skipped` | `outcome=cancelled` |
| `task.dependency_failed` | `task.failed` | `outcome=dependency_failed` |
| `task.recovered` / `task.requeued` / `task.retry_requested` | `task.progress` | `phase=<original suffix>` |
| `run.created` | dropped | Folded into `run.started`; never emitted. |

## Rust client contract

The Rust core (`src/worker/http.rs`, hand-rolled HTTP/1.1 over `TcpStream`, loopback only) mirrors this wire format: bearer-token framing, content-length/chunked/connection-close response bodies, and SSE decoding in which canonical field names are preferred and legacy spellings (`type`/`event_type`/`kind`, `sequence`/`seq`) are tolerated, with the SSE `id:` line as the sequence fallback and the `event:` line as the type fallback. Canonical envelope fields (`event_id`, `run_id`, `project_id`, `occurred_at`, `task_id`) are folded into the persisted payload. Non-2xx bodies map onto `CoreError`: the frozen error-envelope codes map 1:1 keeping the worker's `retryable` flag; every unknown code — including the draft transport codes above — becomes a generic non-retryable `WORKER_NOT_AVAILABLE` that preserves the worker's developer detail and correlation id. A body that is not a parseable envelope is itself a protocol failure.

`src/worker/process.rs` launches `python -m morpho_worker.serve` with exactly the three environment variables above, drains the child's stderr into the app log, waits for loopback readiness, and kills the child on shutdown or drop. The supervisor restarts a dead worker with bounded backoff and reports `WORKER_NOT_AVAILABLE` after exhaustion. The event pump (`src/state.rs`) persists every forwarded event through the events repository (monotonic per-run sequence) and re-emits it to all windows as `morpho://events` — payloads already redacted. Secrets remain in the OS keychain.

## Providers

Provider configuration lives in the worker's config boundary (`morpho_worker/config.py`): provider ids and model names are configuration, never domain enums, and credentials are key references only (`env:NAME` or `keychain:NAME`, never raw values). Each `ProviderConfig` carries a `protocol` field selecting the LLM wire adapter: `openai` (default; OpenAI-compatible adapter), `anthropic` (native Claude Messages API), or `gemini` (native Google generateContent API).

The conventional provider ids `anthropic` (base `https://api.anthropic.com`, key reference `env:ANTHROPIC_API_KEY`) and `gemini` (base `https://generativelanguage.googleapis.com`, key reference `env:GEMINI_API_KEY`) are registered in the default config but **unrouted and model-less**: opting in is an explicit configuration change (set the model and route a role to it), never a silent call to a real endpoint. Default routing stays planner/validation on a strong OpenAI-compatible model, extraction/summarization/classification on local Ollama, embeddings on the mock.

Environment overrides (missing variables keep defaults; provider ids use hyphens in config and underscores in variable names): `MORPHO_PROVIDER_<NAME>_{KIND,BASE_URL,MODEL,KEY_REF,PROTOCOL,TIMEOUT,RETRIES}`, `MORPHO_ROLE_<ROLE>`, `MORPHO_PROFILE=local|offline|default` (the profile applies before explicit `MORPHO_ROLE_*` overrides, so a per-role variable always wins), plus `MORPHO_WORKER_OFFLINE`, `MORPHO_MAX_CONCURRENCY`, and `MORPHO_PROMPTS_DIR`. **Draft**: the worker's `ProviderConfig` field set (`timeout_seconds`, `max_retries`, `retry_backoff_seconds`, `protocol`, cost hints) has not yet been reconciled with the frozen `provider-config.v1.json` names (`timeout_ms`, `retry {max_attempts, backoff_ms}`).
