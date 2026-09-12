# ADR-019 Rust Orchestrator as Projection Authority over Worker Events

## Status

Accepted (2026-09-12)

## Context

PRD §7 states the rule plainly: *"Only the Orchestrator transitions tasks. SQLite is authoritative and events are projections."* Until now the Rust core satisfied only half of it: the worker event pump (`state.rs`) persisted canonical events and re-emitted them, but nothing in the core owned what those events mean for persisted task state — task status never moved, checkpoints never landed, dependency gating and run rollup lived only inside the Python worker's in-memory DAG runner (`apps/research-worker/src/morpho_worker/dag/runner.py`). Two consequences:

- After a crash or restart, the core's `tasks` rows stayed `PENDING` even for work the worker had completed; the run view (`run_get`) could only echo the worker's live envelope, never the persisted truth.
- The Python runner is the only writer of its in-memory task store, so transition legality (its `dag/states.py` table) and dependency semantics (its `_cascade_dependency_failure`) were invisible to SQLite — violating the DO_NOT_BREAK #6 spirit (resumable, idempotent research execution) once the worker process is gone.

The canonical event vocabulary (`packages/schemas/event.v1.json`, ADR-015) now freezes what the worker emits, so the core can project it deterministically.

## Decision

The Rust core (`apps/desktop/src-tauri/src/orchestrator.rs`) becomes the **authority for persisted task state and transition legality**. The Python worker remains the **executor**. The event pump persists each canonical event first (the log is the source of the projection), then feeds it to `OrchestratorService::apply_event`, which validates against the *persisted* state (never memory), applies the transition, reference columns (`checkpoint`, `result_ref`, `error_ref`, `skip_reason`), dependency gating, and run rollup inside **one write transaction**. Illegal, duplicate, or out-of-order events are rejected with structured errors and roll back atomically; replaying the current transition is an idempotent no-op success. Emission to windows is unchanged.

### Transition table (PRD §7 plus the skip edges)

```text
PENDING -> PLANNING -> RUNNING -> VALIDATING -> COMPLETED
RUNNING  -> NEEDS_REVIEW | PAUSED -> RUNNING | FAILED -> RUNNING (retry) | CANCELLED
PENDING/PLANNING/RUNNING -> SKIPPED          (explicit skip; never after completion)
any non-terminal          -> CANCELLED        (run-cancellation closure)
FAILED                    -> CANCELLED | COMPLETED (terminal closure)
NEEDS_REVIEW              -> COMPLETED | RUNNING | CANCELLED (review resolution)
```

`FAILED` is not terminal for a task (retry stays open); it *settles* the run rollup. Run-level legality allows `failed -> running` so a retried task reopens a failed run; `completed`/`cancelled` runs are closed.

### Event-to-state mapping

Canonical types (`event.v1.json`) drive state: `task.started` → `RUNNING` (the worker emits no event for the internal `PLANNING -> RUNNING` hop, so `PLANNING` remains a legal state reserved for phase-2 dispatch); `task.completed`/`review.resolved` → `COMPLETED` (+`result_ref`, checkpoint cleared); `task.failed` → `FAILED` (+`error_ref`, cascade); `task.skipped` → `SKIPPED` (+`skip_reason`); `review.requested` → `NEEDS_REVIEW`; `task.progress`/`task.checkpoint` persist `payload.checkpoint` without a transition. Two worker-legacy projections are honored (ADR-015 renames): `task.skipped` with `outcome=cancelled` — and the passthrough `task.cancelled` — project as `CANCELLED`, not a skip. `run.started` claims the plan's unassigned `PENDING` tasks for the run and resumes paused ones; `run.paused` pauses running tasks; `run.cancelled` cancels every non-terminal task. `plan.*`/`source.*`/`claim.*` carry no task/run projection and pass through.

### Dependency gating and rollup

Dependencies carry a `condition` (`completed` or `completed-or-skipped`, the PRD §7 default): a dependent starts only when every dependency is satisfied — starting early is rejected with `TASK_DEPENDENCY_FAILED`; completing or explicitly skipping a task reports newly satisfied PENDING dependents (the phase-2 dispatch signal). A finally-failed task fails its transitive `PENDING` dependents with a structured `TASK_DEPENDENCY_FAILED` error reference. The run rollup: any `NEEDS_REVIEW` task parks the run at `needs_review` (non-terminal, no `finished_at`); once every task is settled the run closes as `failed` (any failure), `cancelled` (any cancellation), or else `completed`, with per-status counts surfaced through `run_get`.

### Migration 002 (`002_task_skip_and_orchestrator.sql`)

SQLite cannot alter a CHECK constraint, so `runs`, `tasks`, and their child tables (`task_dependencies`, `events`, `llm_usage`) are rebuilt inside the migration transaction using CTAS backups, child-first drops (foreign keys stay ON — the runner cannot turn them off inside a transaction), recreation, and restore. Changes: `tasks.status` gains `SKIPPED`; `tasks.skip_reason` is added; `runs.status` gains `needs_review`; `task_dependencies.condition` is added, defaulting existing and new rows to `completed-or-skipped`. Data preservation, foreign-key integrity, and fresh-install/upgrade schema parity are enforced by migration tests; `LATEST_SCHEMA_VERSION` is 2.

### Phase boundary

Phase 1 (this ADR) is projection-only: the core never dispatches tasks and the worker keeps its internal store. Worker task ids that do not resolve to core tasks are rejected harmlessly (logged, nothing corrupted) until phase 2 aligns ids. Phase 2 — Rust-driven per-task dispatch — reuses the same table, gating, and `claim_for_run` claiming, submitting jobs per ready task through the existing supervisor; no new schema is required for that step.

## Alternatives

- **Keep the worker as the sole state owner and mirror asynchronously:** rejected — mirrors drift after crashes, and PRD §7 already names SQLite authoritative.
- **Rust-driven dispatch now:** rejected for scope — per-task dispatch needs job-to-task id alignment, retry scheduling, and backpressure that deserve their own increment; the projection authority here is its prerequisite, not its competitor.
- **Persist status only from `run.*` summaries:** rejected — per-task checkpoints, refs, and dependency gating are PRD §7 requirements and cannot be reconstructed from run-level rollups.
- **New error code for illegal transitions:** deferred — `docs/api/ERRORS.md` codes are workgroup-A-frozen; illegal transitions surface as structured `DATABASE_ERROR` with an explicit `developer_detail`, and dependency violations already use `TASK_DEPENDENCY_FAILED`.

## Consequences

- `state.rs`'s pump persists, then projects, then emits; projection failures never take the pump down or block emission.
- `Tasks::update_status` gains `SKIPPED`; `Runs::update_status` gains `needs_review` and now clears `finished_at` when a run reopens.
- `run_get` (unchanged command set) attaches a read-only `task_rollup` (run status, per-status counts, per-task statuses) whenever the worker envelope names a run.
- The worker's draft extensions (`FAILED -> PENDING` requeue, crash recovery to `PENDING`) are not projected in phase 1; they surface as `task.progress` (`phase` payload) and remain phase-2 decisions.
- Migration 002 is the first table-rebuild migration; it establishes the rebuild pattern (backup, drop children first, restore) for future CHECK changes.
