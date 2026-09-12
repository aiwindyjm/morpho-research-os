# ADR-016 Split Claim `status` Into Review Lifecycle and Confidence

## Status

Accepted (2026-09-12)

## Context

PRD §6 requires claims to carry both `status` and `confidence` ("Claims carry subject, predicate, object/value, scope, status, confidence, and provenance"), and defines confidence states as `confirmed, high, medium, low, unverified, conflicting`. The frozen `claim.v1.json` (W2-06, minor 1.0) has no `confidence` field: its `status` enum is `confirmed | high | medium | low | unverified | conflicting`, i.e. pure confidence values, so lifecycle ("has a human reviewed this?") and evidence strength ("how well is it supported?") are conflated in one field. A separate `review_state` (`unreviewed | needs-review | reviewed`) covers extraction-queue triage but not the editorial lifecycle.

## Decision

Amend `claim.v1.json` to minor 1.1 (same major, file name unchanged) and all three bindings, with corpus cases updated in the same change:

1. **New optional `confidence`** field: enum `confirmed | high | medium | low | unverified | conflicting` (the PRD §6 states, identical to the knowledge-node contract), defaulting to `unverified` when omitted (JSON Schema `default` annotation; Zod `.default`, Pydantic field default, Serde `#[serde(default)]`).
2. **`status` is redefined as the review lifecycle**: enum `draft | needs_review | confirmed | superseded`. `confirmed` is the only value carried over from the old enum — it was the only genuinely lifecycle-like value ("confirmed by review"). All other legacy values move to `confidence`.
3. **Migration mapping** (documented for readers of pre-1.1 data):

   | Legacy `status` (1.0) | New `status` | New `confidence` |
   |---|---|---|
   | `confirmed` | `confirmed` | `confirmed` |
   | `high` | `needs_review` (unless `review_state` says `reviewed`, then `confirmed`) | `high` |
   | `medium` | `needs_review` / `confirmed` (same rule) | `medium` |
   | `low` | `needs_review` / `confirmed` (same rule) | `low` |
   | `unverified` | `draft` | `unverified` |
   | `conflicting` | `needs_review` | `conflicting` |

   Legacy confidence values in `status` are rejected by the 1.1 enum (corpus case `claim/invalid-002.json`).
4. **`schema_version` enum becomes `["1.0", "1.1"]`** and the claim bindings gain a contract-local version type (`ClaimSchemaVersion`), because the shared `SchemaVersionV1` stays `["1.0"]` for every other contract. Writers target `1.1`.
5. **Why an in-place minor, not `claim.v2.json`:** the 1.0 freeze never reached a persisted writer — no runtime component creates or stores claim records yet (application claim types are drafts; the only instances are the shared corpus, updated here). Minting a v2 that nothing can produce would duplicate the binding surface for no reader. The redefinition is recorded as minor 1.1 with the mapping above; a `docs/development/VERSIONS.md` matrix note is left as a maintainer follow-up (outside this task's file scope).

## Alternatives

- **Keep 1.0 and add only `confidence`:** leaves two overlapping confidence-ish fields and no lifecycle vocabulary; PRD §6's status/confidence distinction stays unimplementable.
- **`claim.v2.json` breaking change:** the README breaking-change checklist is designed for contracts with persisted readers; none exist here, so the cost is duplication without benefit.
- **Reuse `review_state` as the lifecycle:** its values (`unreviewed/needs-review/reviewed`) describe extraction triage, not editorial outcome (draft/superseded do not fit); folding both semantics would be a second conflation.

## Consequences

- PRD §6 semantics are now expressible: lifecycle transitions (draft → needs_review → confirmed/superseded) are independent of evidence strength.
- Worker extraction prompts and frontend domain types that still emit/read the legacy conflated values align in a later task; no `apps/**` code changes here. The golden extraction prompt template already asks for a numeric confidence and stays untouched.
- `review_state` remains frozen as-is; consolidating it into `status` once apps migrate is a possible follow-up and is intentionally not decided here.
- Adding further lifecycle or confidence enum values later requires updating writers and readers in the same change (README rule 4).
