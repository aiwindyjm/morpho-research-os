# ADR-024 Plan-Driven Worker Execution and Result Ingestion

## Status

Proposed (2026-09-16) — awaiting maintainer ratification. Implementation lands behind this ADR so the change is reviewable end to end; nothing here self-ratifies. Scope stays inside ADR-019's accepted phase boundary (the worker remains the executor; the Rust core remains the projection and persistence authority) and extends the still-draft W2-02 job envelope rather than the frozen `worker-*.v1.json` schemas.

## Context

The 2026-09-16 project audit (F1/F2/F4/F5) documented four integration breaks in the V0.1 loop:

1. **The user-approved plan is not what executes.** `run_start` ships only the research config plus an `approve_plan` boolean; the Python worker re-runs its planner and self-approves that new plan. Core task rows stay `PENDING` forever because worker-minted task ids never resolve to core tasks (the documented ADR-019 phase-1 boundary).
2. **Validated research records evaporate.** Worker stages persist sources, contents, knowledge nodes, relations, claims, and evidence into an `InMemoryResultSink`; nothing carries them into SQLite, so knowledge/coverage/graph views and the Vault export see an empty project after a real run.
3. **Readback depends on session memory.** The frontend bridges `run.get`/`plan.get`/`gap.list` through per-window maps because no committed command reads the persisted facts, and the worker job id ↔ run binding lives only in the supervisor's memory.
4. **Event acknowledgment precedes persistence.** The pump advances the poll cursor as events are forwarded, before the events repository commits them; a transient database failure silently skips those events, and a cancelled job stops being polled before its terminal events arrive.

## Decision

### 1. The approved plan travels with the job (envelope extension, additive)

`POST /jobs` (draft W2-02 envelope) gains one optional member `plan`:

```json
{
  "schema_version": "1",
  "kind": "research_run",
  "config": { "...": "ResearchConfig" },
  "approve_plan": true,
  "plan": {
    "plan_id": "core plan id",
    "project_id": "core project id",
    "sections": [
      {
        "section_id": "core section id",
        "title": "...", "dimension": "...",
        "tasks": [
          { "task_id": "core task id", "title": "...", "runtime_type": "search",
            "params": { "query": "...", "dimension": "..." } }
        ]
      }
    ]
  }
}
```

When `plan` is present the worker **does not plan or approve anything**: it builds its DAG from the given tasks, keeps the given `task_id` values verbatim as runtime task ids, and derives DAG edges from the core's `task_dependencies`. Core task types map onto worker runtime types (`search`→SEARCH, `source_evaluation`→SOURCE_EVALUATION (content + quality + LLM extraction per section source), `normalization`→NORMALIZATION (entity + relation normalization and claim/evidence building), `validation`→VALIDATE, `synthesis`→WRITER). Worker-native fan-out tasks (`extract`, `claims`) remain available for worker-planned runs (CLI) but are not created for provided plans — the fan-out runs inline inside the section's `source_evaluation`/`normalization` tasks. The envelope still requires `approve_plan: true` (defense in depth; the core only submits approved plans).

The Rust core's `run_start` refuses to create a run for a plan that is not currently `approved` (draft/rejected/superseded), and refuses while another non-terminal run of the same plan is active. The core plan carries explicit dependencies (search → source_evaluation → normalization per section; validation waits for every normalization; synthesis waits for validation), so what the user approved — task ids, edited titles/descriptions, and dependency edges — is exactly what executes.

### 2. Worker results endpoint and Rust ingestion (new endpoint, additive)

`GET /jobs/{job_id}/results` returns every validated record the job's result sink collected:

```json
{ "schema_version": "1", "job_id": "...", "records": [ { "kind": "source", "record": { } } ] }
```

`kind` ∈ `source | source-content | extraction | node | relation | claim | evidence | dropped | validation-report | note | incremental-report` (the sink's vocabulary). Records are the worker's validated pydantic models — normalized domain records, never raw provider output.

The Rust pump, upon forwarding a terminal job event, drains the endpoint once and ingests inside one write transaction per batch: every record is re-validated through typed serde structs (`deny_unknown_fields`, mirroring the frozen `packages/schemas` models) before any write. Identity rules: sources upsert by `(project, canonical_url)` and knowledge nodes by `(project, slug)` (per their repositories), with worker→core id maps threaded into evidence `source_id`s and relation endpoints; claims, evidence, and relations keep their worker-minted ids (idempotent by primary key on re-ingest). V0.1 persists the traceability chain `source → source-content → knowledge node → relation → claim → evidence (+ claim_evidence)`; `extraction`, `dropped`, and the report kinds stay in the worker payload and event log only.

### 3. Persisted job binding and three read commands (migration 004 + IPC batch 3)

Migration 004 adds `runs.worker_job_id TEXT` (nullable, indexed) so the job binding survives restarts. Three IPC commands join the committed surface (ADR-020 batch 3, same Proposed status as batch 2):

- `run_latest_get {project_id}` — latest run from SQLite, its persisted task rollup, the frozen config snapshot (the config generation the executed plan was generated from), and plan title; the live worker envelope is optional enrichment (ignored when the worker no longer knows the job).
- `plan_latest_view {project_id}` — the full sectioned `PlanView` for the latest plan generation, from `projections::plan_view`.
- `gap_report_get {project_id}` — the decision-merged gap report (persisted `gap_decisions` included).

The frontend transport reads these instead of its session maps; `run.cancel` resolves the job through the run's persisted `worker_job_id`. If the worker no longer knows the job (post-restart), cancellation applies a local `run.cancelled` projection through the ADR-019 orchestrator so core state converges instead of dangling at `running`.

### 4. Pump acknowledgment semantics

The supervisor exposes fetch/commit cursor phases: events are fetched without advancing the cursor; the pump persists each event (events repository), then — only on success — projects it and advances the cursor through that sequence. Failed persists leave the cursor untouched so the next cycle re-fetches from the worker (SSE replay). UI emission follows persistence: only persisted events reach windows (SQLite is authoritative, PRD §7). Cancelling a job keeps it pollable until its terminal event has been forwarded (or the worker process dies, which follows the existing interrupted-job path); only then is it retired from the active set, after its results are drained.

## Alternatives

- **Implement the frozen per-task `worker-job-request.v1.json` dispatch now (ADR-019 phase 2):** rejected for this round — per-task dispatch needs the dynamic extract fan-out to create core tasks mid-run, retry scheduling, and backpressure protocol work that deserves its own increment; the envelope unification is an explicit open loop owned by the maintainer.
- **Stream records as `source.*`/`claim.*` events:** rejected — the frozen `event.v1.json` vocabulary has no `knowledge.*`/`relation.*`/`evidence.*` types, so record carriage would require a vocabulary amendment; the results endpoint keeps events as progress projections and records as validated data, with no schema change.
- **Keep the session-map bridges and fix them in the UI:** rejected — restart recovery cannot be faked in the frontend; persisted facts are the only honest source.

## Consequences

- The draft W2-02 envelope, worker endpoints, IPC surface, and SQLite schema all gain additive members; all three validation stacks stay strict (unknown fields still rejected everywhere).
- `real_worker_smoke` becomes a true loop assertion: core tasks advance to `COMPLETED`, domain rows exist from an empty database, the Vault export writes sources/claims, and a restart readback returns the same facts.
- If the maintainer rejects any part, the corresponding additive member can be removed without breaking the frozen v1.0 contracts (nothing shipped in a release depends on this ADR until it is Accepted).
