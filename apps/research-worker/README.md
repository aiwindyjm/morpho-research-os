# Morpho Research Worker

The local Python research engine of Morpho Research OS. It plans research,
runs a durable task DAG, and turns sources into validated, layered research
records. It owns **no persistence**: records go to an injected result sink,
which the Rust core later backs through the worker protocol.

```text
ResearchConfig → Planner → Plan Review (gate) → Task DAG
  search → extract (dynamic fan-out) → normalize → claims → validate (fan-in)
→ validated records (Source / Content / Extraction / KnowledgeNode /
  Relation / Claim / Evidence / ValidationReport) → ResultSink
```

## Quickstart (CLI)

`run_research.py` closes the loop from one command: question → plan →
approval gate → run → JSON. Offline first (deterministic mocks, zero
network, zero credentials):

```bash
python apps/research-worker/run_research.py --profile offline --approve \
  --config-json '{"domain":"physics","topic":"quantum entanglement","purpose":"learning","depth":3,"dimensions":["concepts","history"],"languages":["en"],"source_types":["paper","web_page"]}' \
  --out-dir out/demo
```

Then a real local run on an installed Ollama model (no cloud key needed):

```bash
python apps/research-worker/run_research.py --profile local \
  --config-file research-config.json --out-dir out/local --approve
```

Without `--approve` only `plan.json` is written and the run never starts
(the CLI cannot bypass the plan review gate). With it, the run writes the
eight whitelisted result files into `--out-dir`. Exit codes: `0` success or
pending review, `1` failed run, `2` configuration error. Hardware → model
tiers, profile details, and the optional SearXNG search adapter are covered
in `docs/ai/LOCAL_COMPUTE.md`.

## Boundaries (non-negotiable)

- The worker **never** writes the Vault, SQLite, or any UI state, and never
  holds raw API keys. Configuration carries key *references*
  (`env:NAME` / `keychain:NAME`) only; values resolve at call time and are
  never logged or stored.
- LLM output always flows through the structured output gate
  (`parse → validate → normalize`) in `pipeline/structured.py`; it can never
  reach domain code unvalidated.
- Provider identities/models are configuration, never domain enums.
- Tests and offline mode use deterministic mocks only — no network, no
  credentials, no personal research content.

## Layout

```
src/morpho_worker/
  config.py          worker/provider config, role routing, env parsing
  errors.py          structured error envelope (code, user message, detail,
                     retryable, correlation id) per docs/api/ERRORS.md
  version.py         worker + draft protocol versions (W0-03/W2-02 own the
                     final rules)
  events.py          research.event.v1 envelopes, ordered append-only log,
                     cursor reconnect, redaction, JSONL/SSE codecs
  transport.py       draft HTTP transport (stdlib http.server): /health,
                     /version, /compatibility, plus the job routes below;
                     exact + {param} route tables and SSE stream replies
  jobs.py            draft job surface (W2-02): POST /jobs, GET /jobs/{id},
                     POST /jobs/{id}/cancel, GET /jobs/{id}/events (SSE);
                     per-job worker thread + per-job pinned event log
  providers/         ports, deterministic mocks, OpenAI-compatible adapter
                     (draft), factory/role routing, cache, retry, usage
  pipeline/          prompt registry (packages/prompts assets) and the
                     parse→validate→normalize gate
  domain/            ResearchConfig/Plan, Source, KnowledgeNode/Relation,
                     Claim/Evidence/ValidationReport, ExtractionResult
  stages/            planner, search, extraction, normalization, claims
  dag/               task state machine, DAG validation, state-store port,
                     thread-pool runner (pause/cancel/retry/checkpoint)
  orchestrator.py    plan lifecycle + DAG wiring + stage dispatch
  stores/            plan review store (versioned, approval gate)
  interfaces.py      stage ports, StageContext, idempotent result sink
tests/               pytest suite; fixtures under tests/fixtures
```

## HTTP surface (draft until W2-02)

`transport.WorkerService` serves on loopback; everything except a missing
token requires the session bearer token (`WorkerService(session_token=...)`
— the current draft also gates `/health`/`/version` behind it):

| Endpoint | Behavior |
|---|---|
| `GET /health`, `GET /version`, `POST /compatibility` | Process/protocol metadata and the draft compatibility probe |
| `POST /jobs` | Strict job request envelope (`schema_version "1"`, `kind`, `config`, optional `approve_plan`); unknown fields rejected. `research_run` runs the full pipeline (offline/mock providers by default in mock mode). `approve_plan=true` is the caller's plan review decision — without it the request fails with `PLAN_NOT_APPROVED` and no DAG is built. Returns `201` + job envelope (job_id, status, created_at, protocol_version, counts) |
| `GET /jobs/{id}` | Job envelope with the mapped status (PENDING / PLANNING / RUNNING / VALIDATING / NEEDS_REVIEW / PAUSED / COMPLETED / FAILED / CANCELLED) and task counts |
| `POST /jobs/{id}/cancel` | Cooperative cancel via the DAG runner; idempotent (a terminal job returns its terminal state) |
| `GET /jobs/{id}/events` | SSE stream (`text/event-stream`) of the per-job `EventLog`: `id: <sequence>` framing, replay from `Last-Event-ID` header or `?after_sequence=`, comment heartbeats, clean EOF (sentinel comment) on terminal state |

Unknown ids return the structured `NOT_FOUND` envelope (404); auth failures
`UNAUTHORIZED` (401); malformed bodies `BAD_REQUEST` (400). Job events are
redacted through `events.py` — provider keys, raw prompts, and raw responses
never appear.

## Running tests

```bash
pip install -e apps/research-worker[dev]
cd apps/research-worker && python -m pytest tests
```

Everything runs offline; `FakeClock` and scripted mock providers make runs
deterministic.

## Model routing (defaults, all overridable)

| Role | Default | Notes |
|---|---|---|
| extraction / summarization / classification | local Ollama `qwen3:8b` (`qwen2.5:7b` fallback entry) | OpenAI-compatible endpoint at `http://127.0.0.1:11434/v1`, no credential |
| planner / validation | OpenAI-compatible strong model (GLM default) | credential via `env:GLM_API_KEY` reference |
| embedding | replaceable mock | V0.1 has no vector database |
| search | mock adapter | defaults to the mock (offline fixture corpus); an optional SearXNG adapter is available behind explicit config selection (`--search-provider` / factory flag) — see `docs/ai/LOCAL_COMPUTE.md` |

Environment overrides: `MORPHO_WORKER_OFFLINE`, `MORPHO_MAX_CONCURRENCY`,
`MORPHO_PROMPTS_DIR`, `MORPHO_PROVIDER_<NAME>_*`, `MORPHO_ROLE_<ROLE>`.
`MORPHO_WORKER_OFFLINE=1` (or the reserved `mock` provider id) runs the full
pipeline on deterministic mocks. When a configured model is unreachable the
adapter raises the explicit `PROVIDER_UNAVAILABLE` error — the worker never
silently falls back to a different provider; mock mode is an explicit
configuration decision.

The plain-http transport rule: `https://` to any host, plain `http://` only
to loopback (the local-model case). Redirects are not followed.

## Contract status (draft until frozen by workgroup A)

Implemented against documented drafts; **not** second contracts:

- ResearchConfig mirrors `packages/schemas/research-config.v1.json`.
- Domain records implement `docs/DATA_MODEL.md` and `docs/data/*.md`.
- Event envelopes follow `research.event.v1` per `docs/API.md`.
- Error codes follow `docs/api/ERRORS.md`.
- Prompt assets use the structure of `docs/ai/PROMPT_ARCHITECTURE.md`.

**Contract proposals pending ratification** (single additions, flagged in
code, to be settled at the W2 freeze):

1. `PROVIDER_UNAVAILABLE` — provider configured but unreachable/unavailable
   (distinct from `PROVIDER_TIMEOUT` and `WORKER_NOT_AVAILABLE`). Required
   by the "clear error when the model is unavailable" acceptance.
2. `PLAN_NOT_APPROVED` — execution requested before plan approval. Required
   by the "no DAG before approval" acceptance.
3. Draft state-machine extensions: `FAILED → PENDING` (scheduler requeue /
   manual retry), `PENDING → FAILED` (dependency-failure cascade, named by
   RESEARCH_ENGINE.md), interruptible states → `PENDING` (crash recovery).
4. Draft transport codes (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`,
   `UNSUPPORTED_JOB_KIND`) for HTTP-level errors; the worker protocol
   itself freezes at W2-02.
5. Confidence aggregation heuristic for nodes: agreement from ≥ 2
   independent sources raises confidence; a single mention with no numeric
   confidence stays `unverified`. A claim without located evidence can
   never reach `confirmed`.

Until W2 freezes these, the Rust side should treat the payloads as draft
and pin the worker protocol compatibility check accordingly.
