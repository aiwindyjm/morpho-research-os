# ADR-020 IPC Command Surface Completion (Batch 2)

## Status

Proposed (2026-09-13)

## Context

The frontend command registry (`apps/desktop/src/services/commands.ts`) freezes a 39-command typed surface (`CommandMap`) that both transports — the in-memory mock (`mocks/backend.ts`) and the real Tauri IPC transport (`tauriTransport.ts`) — must speak. Batch 1 (commit 0ef7189) wired the core read/creation commands, but the mock remained the only implementation of the plan-review, evidence, graph, gap-decision, and research-config flows, and `tauriTransport.ts` throws `unsupported` for them.

Surveying the two transports surfaced one contract split that previous docs never wrote down: the Rust `config_get`/`config_put` commands (`secrets.rs` `AppConfig`) transport the **app** configuration — worker wiring and provider secret references — while the frontend `config.get`/`config.update` `CommandMap` entries expect the **project-scoped research configuration** (domain/topic/purpose/depth/dimensions/…, `research-config.v1.json`). Mapping the frontend entries onto the existing Rust commands would hand the ConfigPage the wrong payload, so the research-config commands need their own dedicated Rust surface.

Two constraints shape the design. First, the Python worker wire protocol is frozen for this increment: no new job kinds, no new event types. Second, PRD §11's parse → validate → normalize → persist pipeline means commands persist through repositories inside one transaction; read models are projections over those rows, never a second source of truth.

## Decision

Nine new Tauri commands close the batch-2 gap. All follow the existing envelope (`{schema_version, request_id, data, error}`), delegate to `*_impl` functions testable against in-memory SQLite, and never touch the worker protocol.

| Frontend command | Rust command | Request | Response | Semantics and storage |
| --- | --- | --- | --- | --- |
| `plan.regenerate` | `plan_regenerate` | `{project_id}` | `PlanView` | Deterministic scripted V0.1 planner (`PlanService::regenerate_plan`): resolves the project's latest research config, supersedes every earlier plan generation, inserts the new draft atomically. One section per dimension (capped at `depth + 3`) with search / source-evaluation / normalization tasks, plus a cross-validation section (validation + synthesis). `plans`, `sections`, `tasks`. LLM regeneration is deferred (below). |
| `plan.updateTask` | `plan_update_task` | `{project_id, task_id, title, description}` | `PlanView` | Edits a task's title and description; blank title keeps the previous one (mock parity). Only draft plans are editable; cross-project task ids are rejected. `tasks` (`set_title_and_description`). |
| `plan.reject` | `plan_reject` | `{project_id}` | `PlanView` | Marks the project's latest plan generation `rejected`. `plans.status`. |
| `evidence.listByClaim` | `evidence_list_by_claim` | `{project_id, claim_id}` | `Evidence[]` (`EvidenceView`) | Evidence linked through `claim_evidence`, filtered to the project; unknown claims list nothing (mock parity). Read-only over `evidence`, `claim_evidence`. The mock's reveal-gating is simulation-only and does not project onto persisted state. |
| `graph.get` | `graph_get` | `{project_id}` | `GraphProjection` | Assembled from `knowledge_nodes` + `relations`; dangling edges (either endpoint outside the project's node set) are omitted. No graph-specific tables. |
| `gap.approveProposal` | `gap_approve_proposal` | `{project_id, gap_id}` | `GapReport` | Creates a PENDING follow-up task keyed by the stable gap id (`gap:{project}:{dimension}`, idempotency key) attached to the current plan's first section, records the decision, returns the recomputed report. Idempotent for already-approved gaps. `tasks`, `gap_decisions`. |
| `gap.dismissProposal` | `gap_dismiss_proposal` | `{project_id, gap_id}` | `GapReport` | Records the dismissal; the dimension disappears from subsequent reports and the gap id stops resolving. `gap_decisions`. |
| `config.get` | `research_config_get` | `{project_id}` | `ResearchConfigView` | Returns the project's latest `research_configs` generation in the frontend `ResearchConfig` shape. Distinct from the app-config `config_get` (see context). |
| `config.update` | `research_config_put` | `{project_id, config: ResearchConfig}` | `ResearchConfigView` | Validates the research-config.v1.json value constraints the frontend schema also enforces (purpose enum, depth 1–5, `update_frequency` literal "manual", ISO-8601 time bounds — parsed by the new `vault::parse_rfc3339_to_unix_ms`) and **appends a new `research_configs` generation** rather than editing in place: earlier plans keep referencing the exact configuration they were built from (`plans.research_config_id`), while reads and future regenerations resolve the newest generation. |

### Response envelopes for the transport

`PlanView`, `EvidenceView`, `GraphProjection`, and `GapReportView` live in the new `projections.rs` (transport DTOs, not domain records: epoch-milliseconds become UTC ISO-8601 strings; documented bridges cover schema gaps — section `summary` doubles as review rationale, node dimension is the first tag, relation confidence projects onto a [0, 1] scale, evidence locator kinds are inferred from the raw string).

`ResearchConfigView` matches the frontend `researchConfigSchema` field-for-field with one intentional difference from the worker wire payload: `time_range` is **always an object** `{from: string|null, to: string|null}` — never bare `null` — because the frontend zod contract requires the object; the worker's strict pydantic model (`research_config_wire`) keeps its own shape unchanged. `config_id`, `project_id`, `created_at`, and `updated_at` ride along as the persisted-record form of `research-config.v1.json`; the frontend zod object strips unknown keys, so they validate cleanly.

### Migration 003 (`003_plan_metadata_and_gap_decisions.sql`)

Purely additive (plain `ALTER TABLE ADD COLUMN` with constant defaults, no CHECK changes, no rebuilds) plus one new table:

- `plans.rationale` — the plan-level rationale the review UI renders (PRD §5).
- `sections.dimension`, `sections.objectives` (JSON array) — per-section research dimension and objectives for the plan projection.
- `tasks.description` — task instructions edited through `plan.updateTask`.
- `gap_decisions` — `(project_id, dimension)` primary key, `status ∈ {approved, dismissed}`, optional `created_task_id`. The gap report itself stays derived (recomputed from coverage on every read); only the user's decision is durable. Pre-003 rows read back through the repositories with empty-string/empty-array defaults; `LATEST_SCHEMA_VERSION` becomes 3, and the migration-runner tests cover gapless ordering, upgrade-from-v2, and idempotence.

### Deferred

- **`task.pause` / `task.resume` / `task.retry` / `task.cancel`** — per-task lifecycle actions are phase-2 of ADR-019 (Rust-driven dispatch and job-to-task id alignment). The projection table and `PAUSED`/`FAILED` states already exist; what is missing is the dispatch authority to move individual tasks on command rather than on events.
- **`assistant.*` (getContext / act / saveDecision / listDecisions)** — scripted-V0.1 scope: the assistant is frontend-canned responses over existing reads for now; persisting a decisions store and an LLM-backed act surface deserves its own contract proposal once the review and gap loops above are live.
- **LLM plan regeneration** — the worker protocol has no plan-regeneration job kind. `plan_regenerate` implements the domain-side scripted planner (mirroring `mocks/planner.ts`); swapping in the LLM planner later changes the draft *producer* only, behind the same command and schema.

## Alternatives

- **Map frontend `config.get/update` onto the existing app-config `config_get/config_put`:** rejected — wrong payload domain (worker/secrets wiring vs research scope); silent shape mismatch on the ConfigPage.
- **Edit `research_configs` in place on update:** rejected — plans reference a specific generation (`plans.research_config_id`); in-place edits would rewrite what historical plans were built from and break reproducibility of past runs' `params`.
- **Store gap reports as rows:** rejected — a report recomputed from coverage can never contradict current task state; only the user decision needs durability (PRD §14).
- **New `graph` tables:** rejected — the graph is a projection of knowledge nodes and relations; dedicated tables would be a second source of truth.
- **Widen the worker protocol for plan regeneration:** rejected — protocol changes are out of scope for this increment (frozen wire); the scripted planner is the documented V0.1 stand-in.

## Consequences

- 31 of the 39 frontend commands now have a Rust surface; the remaining eight are the deferred `task.*` lifecycle and `assistant.*` groups above. `tauriTransport.ts` can map `config.get`/`config.update` to the new research-config commands.
- `plan_regenerate` is deterministic and offline: it never calls a provider. When the LLM planner lands, its output flows through the same parse → validate → persist path.
- Gap approvals create real `PENDING` tasks claimable by the next run (`claim_for_run`), so an approved gap survives restarts — the approval is not a UI-only note.
- The scripted planner's task mix and section structure mirror `mocks/planner.ts`; divergence between mock and core planner output is a test-enforced contract (same section count, same task kinds).
- `vault::parse_rfc3339_to_unix_ms` adds the inverse of `format_rfc3339_utc` with no new dependency; strict RFC 3339 acceptance (padded fields, valid ranges) is test-covered.
