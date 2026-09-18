-- 005_source_content_class.sql — persist the worker's content-availability
-- classification (review R8): the worker's SourceContent.locator_base says
-- whether the stored payload is the source's full text, only the search
-- snippet, or nothing was retrievable. The class must survive worker exit so
-- evidence locators stay auditable; a row count alone is not a basis.
--
-- Backfill by verifiable fact (round-2 review P2): every row written before
-- this migration has cache_path='' — no body was ever persisted — so
-- existing rows are 'unavailable', never 'full-text'. (Migration 006 carries
-- a corrective UPDATE for databases that applied the earlier draft of this
-- file, whose DEFAULT was 'full-text'.)

ALTER TABLE source_contents ADD COLUMN content_class TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (content_class IN ('full-text', 'snippet', 'unavailable'));
