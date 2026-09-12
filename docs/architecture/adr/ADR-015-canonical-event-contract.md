# ADR-015 Canonical Event Contract (`event.v1.json`)

## Status

Accepted (2026-09-12)

## Context

`Event` was the only one of the 16 PRD §6 domain objects without a canonical schema in `packages/schemas`. Three divergent draft shapes exist in application code:

| Producer | File | Shape |
|---|---|---|
| Rust IPC | `apps/desktop/src-tauri/src/ipc.rs` `ResearchEvent` | `schema`, `run_id`, `task_id?`, `sequence`, `timestamp_ms` (epoch ms), `event_type`, `payload` |
| TS domain types | `apps/desktop/src/types/domain.ts` `RunEvent` | `id`, `run_id`, `seq`, `timestamp` (RFC 3339), `type`, `summary` |
| Python worker | `apps/research-worker/src/morpho_worker/events.py` `EventEnvelope` | `schema_version`, `event_id`, `job_id`, `sequence`, `timestamp`, `type`, `task_id?`, `payload` |

`docs/API.md` documents a `research.event.v1` draft, and `worker-event.v1.json` already freezes the *transport-level* SSE event (`job.*` vocabulary) — but the domain event (task/run/plan/source/claim/review activity that SQLite persists as a projection and the timeline UI renders) had no contract. DO_NOT_BREAK #8 requires the contract to precede implementation.

## Decision

Add `packages/schemas/event.v1.json` (minor 1.0) as the canonical domain event envelope, with Zod/Pydantic/Serde mirrors and shared corpus cases, following the package conventions (`packages/schemas/README.md`):

1. **Field names take the union of the drafts, converged:** `event_id` (Python/TS `id`), `sequence` (TS `seq`), `occurred_at` (Rust `timestamp_ms` / TS+Python `timestamp`; RFC 3339 UTC string by convention, consistent with every other domain schema), `run_id`, `task_id` (optional; present in 2 of 3 drafts), `project_id` (new — events must be attributable to a project even when the run is gone), `type` (2 of 3 drafts plus `worker-event.v1.json` use `type`; Rust's `event_type` renames), `summary` (optional; TS draft's human-readable timeline line), `payload` (all three drafts).
2. **`run_id` is nullable-and-omittable.** Project-level events (e.g. `plan.approved`, `review.requested`) have no run. Writers omit the field (the package convention "optional means absent"); readers must also accept `null` because two of the three drafts serialize absent as `null`. The schema uses `"type": ["string", "null"]` and bindings map to `Option`/`Optional`/`nullable().optional()`.
3. **Closed record, permissive payload.** `additionalProperties: false` on the envelope (typo protection at a dispatch boundary, per README rule 7); `payload` is a plain object whose shape is discriminated by `type` and governed by the emitting side. Payload contracts may be frozen per event type later; freezing them now would couple the envelope to stage implementations that do not exist yet.
4. **Closed `type` vocabulary** grouped by prefix and aligned with the existing status machines: `task.*` (created/started/progress/checkpoint/completed/failed/skipped), `run.*` (started/paused/completed/failed/cancelled — `research-run.v1.json`), `plan.*` (drafted/approved/rejected/superseded — `research-plan.v1.json`), `source.*` (discovered/fetched/evaluated), `claim.*` (created/updated/superseded), `review.*` (requested/resolved). Transport `job.*` types stay in `worker-event.v1.json`; mixing the two vocabularies is a corpus-invalid case.
5. **Redaction is a contract rule, not just an implementation detail.** The schema description states: payloads must never contain secrets, credentials, raw provider prompts, or raw provider responses. Emitters redact at construction (worker `events.py`, Rust `redact_json`); PRD §7 keeps keys out of events entirely.
6. **Relationship to `worker-event.v1.json`:** unchanged. Worker events are the transport SSE frame (`seq`, `job_id`, `job.*` types); domain events are the persisted projection. A worker event may *carry* a domain event in its payload; that mapping is defined when the apps migrate.

## Alternatives

- **Freeze the worker draft (`research.event.v1` with `job_id`) as-is:** couples the domain projection to transport job identity; project-level events and cross-run replay would not fit.
- **Rust draft's `timestamp_ms` epoch integer:** every frozen domain schema uses RFC 3339 UTC strings; introducing a second timestamp convention harms convergence.
- **Open record:** events cross the Rust/worker/UI boundary and are dispatched on `type`; a closed envelope catches field typos in all three stacks (README rule 7).

## Consequences

- Schema registry, bindings, and corpus grow one contract (`event`); CI corpus tests enforce tri-language accept/reject parity.
- Apps migrate in a later task: `ipc.rs` `ResearchEvent`, `domain.ts` `RunEvent`, and worker `events.py` converge onto this contract (field renames `event_type`→`type`, `timestamp_ms`/`timestamp`→`occurred_at`, `seq`→`sequence`, `id`→`event_id`; add `project_id`). No application code changes in this task.
- New event types are enum additions: allowed only when the emitting and consuming sides are updated in the same change (README rule 4).
