# Relation Schema
Relation connects two knowledge nodes with typed predicate, direction, confidence, provenance, and lifecycle. Contradiction is stored as a relation between claims; conflicting claims coexist and are visualized for review.

Frozen contract: [`packages/schemas/relation.v1.json`](../../packages/schemas/relation.v1.json). `direction` is `directed`/`undirected`; `confidence` is five-state (`confirmed`/`high`/`medium`/`low`/`unverified` — `conflicting` is claim-level state, not a relation confidence); lifecycle `status` is `active`/`merged`/`superseded` so merged duplicates keep provenance.
