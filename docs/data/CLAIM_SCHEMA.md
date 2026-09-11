# Claim Schema
Claim: id, subject_node_id, predicate, object/value, scope, status (confirmed/high/medium/low/unverified/conflicting), confidence, created/updated, and provenance links. Claims are never treated as entities.

Frozen contract: [`packages/schemas/claim.v1.json`](../../packages/schemas/claim.v1.json). `status` carries the six-state reviewable confidence; conflicting claims coexist (never overwritten) and surface via `review_state: needs-review` for user attention. `evidence_ids` links to Evidence records; `provenance` records whether the claim came from the user or a specific prompt version.
