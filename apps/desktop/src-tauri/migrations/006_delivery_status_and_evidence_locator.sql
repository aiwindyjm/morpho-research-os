-- 006_delivery_status_and_evidence_locator.sql — durable result-delivery
-- state and lossless evidence locators (round-2 review P1/P2).
--
-- runs.delivery_status separates the two terminal facts of a run
-- (round-2 review P1): `status` stays the EXECUTION projection of the
-- worker's events (ADR-019), while delivery_status records whether the
-- run's validated result records were committed to the domain tables.
--   pending   — results not yet delivered (every fresh run)
--   delivered — results committed (set inside the ingestion transaction)
--   failed    — delivery failed past the automatic retry budget, or the
--               worker died before delivery (startup convergence); durable,
--               observable, and re-armed automatically with backoff while
--               the job lives
--   unknown   — legacy runs migrated before this fact existed whose
--               delivery can never be proven (backfill below)
ALTER TABLE runs ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'unknown'));
CREATE INDEX idx_runs_delivery_status ON runs (delivery_status);

-- Backfill by verifiable facts only: pre-migration runs have no delivery
-- record. Terminal ones can never be proven delivered -> unknown (never
-- 'delivered'); non-terminal ones stay pending and the startup recovery
-- converges them explicitly.
UPDATE runs SET delivery_status = 'unknown'
    WHERE status IN ('completed', 'failed', 'cancelled');

-- Corrective backfill (round-2 review P2): pre-005 content rows never
-- persisted a body (the old writer hardcoded cache_path=''), so a row
-- without a cache path cannot claim full-text. Heals databases that already
-- applied the original 005 default; a no-op for fresh v4->v5->v6 upgrades.
UPDATE source_contents SET content_class = 'unavailable'
    WHERE cache_path = '' AND content_class = 'full-text';

-- Lossless evidence locators (round-2 review P2): locator_detail stores the
-- worker's structured locator as JSON (quote/section/url_fragment/position/
-- retrieved_at) next to the flattened display string, and evidence.
-- retrieved_at now carries the WORKER's retrieval time instead of the
-- ingestion clock (backfill: existing rows keep their stored value).
ALTER TABLE evidence ADD COLUMN locator_detail TEXT NOT NULL DEFAULT '';
