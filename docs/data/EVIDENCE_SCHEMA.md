# Evidence Schema
Evidence links a claim to a source and precise locator (quote, page/section, URL fragment, retrieved_at), extraction method, and support/contradict direction. Evidence is auditable and may be revised without deleting history.

Frozen contract: [`packages/schemas/evidence.v1.json`](../../packages/schemas/evidence.v1.json). `source_id` must reference a Source record ([`source.v1.json`](../../packages/schemas/source.v1.json)) — evidence never embeds raw content. The closed `locator` block carries quote/page/section/fragment; carrying at least one locating field is a writer obligation verified in golden cases. Revisions supersede via `superseded_by` instead of deleting history.
