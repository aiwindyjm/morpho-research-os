-- 003_plan_metadata_and_gap_decisions.sql — plan-review metadata + gap
-- proposal decisions (IPC batch 2, ADR-020).
--
-- Purely additive: plain ALTER TABLE ADD COLUMN statements (constant
-- defaults, no CHECK changes, no rebuilds) plus one new table. Existing rows
-- carry the empty-string/empty-JSON defaults and read back through the
-- repositories unchanged.
--
-- Changes:
--   * plans.rationale — the plan-level rationale the review UI renders
--     (docs/PRD.md §5); generated plans persist it instead of recomputing
--   * sections.dimension / sections.objectives — per-section research
--     dimension and objectives for the plan projection (frontend
--     ResearchSection contract)
--   * tasks.description — the task instructions edited through
--     plan.updateTask; previously only titles existed in the schema
--   * gap_decisions — the durable half of the gap flow (PRD §14): the gap
--     report itself recomputes from coverage on every read, but the user's
--     approve/dismiss decision per (project, dimension) persists here.
--     Approvals point at the created follow-up task.

PRAGMA foreign_keys = ON;

ALTER TABLE plans ADD COLUMN rationale TEXT NOT NULL DEFAULT '';

ALTER TABLE sections ADD COLUMN dimension TEXT NOT NULL DEFAULT '';
ALTER TABLE sections ADD COLUMN objectives TEXT NOT NULL DEFAULT '[]';  -- JSON array of strings

ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT '';

CREATE TABLE gap_decisions (
    project_id      TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    dimension       TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('approved', 'dismissed')),
    created_task_id TEXT REFERENCES tasks (id) ON DELETE SET NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (project_id, dimension)
);
CREATE INDEX idx_gap_decisions_project ON gap_decisions (project_id);
