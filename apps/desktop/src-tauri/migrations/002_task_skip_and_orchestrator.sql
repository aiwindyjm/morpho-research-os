-- 002_task_skip_and_orchestrator.sql — explicit task skip + run needs_review
-- + dependency conditions (PRD §7, ADR-019).
-- SQLite cannot ALTER a CHECK constraint, and the migration runner keeps
-- foreign keys ON inside its transaction, so the affected tables are rebuilt
-- with the documented SQLite procedure adapted for that constraint:
--   1. plain CTAS backups of the tables being rebuilt and their children
--      (backups carry no constraints, so they never reference the dropped
--      tables),
--   2. child tables are dropped before their parents so no parent drop can
--      fire a cascade,
--   3. tables are recreated with the extended CHECKs / new columns,
--   4. data is restored in foreign-key-safe order and the backups dropped.
-- A failure at any statement rolls the whole migration back (the runner wraps
-- this file in one transaction together with its schema_meta row).
--
-- Changes:
--   * tasks.status gains 'SKIPPED' — explicit, operator-driven skip of work
--     that will not run (PRD §7: dependents wait for completed OR skipped);
--     skipping is only legal before completion (enforced by the Rust
--     orchestrator's transition table, not by SQL)
--   * tasks.skip_reason TEXT — why the task was skipped
--   * runs.status gains 'needs_review' — a task in NEEDS_REVIEW parks the
--     run until review.resolved; it is non-terminal (no finished_at stamp)
--   * task_dependencies.condition — 'completed' | 'completed-or-skipped'
--     (default), mirroring the canonical TaskDependencyCondition enum;
--     001 rows and new drafts default to the PRD §7 behavior

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------- backups
CREATE TABLE runs_bak AS SELECT * FROM runs;
CREATE TABLE tasks_bak AS SELECT * FROM tasks;
CREATE TABLE task_dependencies_bak AS SELECT * FROM task_dependencies;
CREATE TABLE events_bak AS SELECT * FROM events;
CREATE TABLE llm_usage_bak AS SELECT * FROM llm_usage;

-- ------------------------------------------- drop children, then parents
-- Child tables first: with foreign keys ON, DROP TABLE runs an implicit
-- DELETE, and by now no child references the parents dropped below.
DROP TABLE task_dependencies;
DROP TABLE events;
DROP TABLE llm_usage;
DROP TABLE tasks;
DROP TABLE runs;

-- ------------------------------------------------------------------- runs
CREATE TABLE runs (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    plan_id      TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'paused', 'needs_review',
                                   'completed', 'failed', 'cancelled')),
    started_at   INTEGER,
    finished_at  INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_runs_project ON runs (project_id);
CREATE INDEX idx_runs_plan ON runs (plan_id);
CREATE INDEX idx_runs_status ON runs (status);

-- ------------------------------------------------------------------ tasks
CREATE TABLE tasks (
    id               TEXT PRIMARY KEY,
    plan_id          TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    section_id       TEXT REFERENCES sections (id) ON DELETE SET NULL,
    run_id           TEXT REFERENCES runs (id) ON DELETE SET NULL,
    title            TEXT NOT NULL,
    task_type        TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'PLANNING', 'RUNNING', 'PAUSED',
                                       'VALIDATING', 'NEEDS_REVIEW', 'COMPLETED',
                                       'FAILED', 'CANCELLED', 'SKIPPED')),
    idempotency_key  TEXT NOT NULL UNIQUE,
    checkpoint       TEXT,          -- JSON task parameters / checkpoint state
    retry_count      INTEGER NOT NULL DEFAULT 0,
    max_retries      INTEGER NOT NULL DEFAULT 3,
    cache_ref        TEXT,
    result_ref       TEXT,
    error_ref        TEXT,
    skip_reason      TEXT,          -- why an explicitly skipped task was skipped
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_tasks_plan ON tasks (plan_id);
CREATE INDEX idx_tasks_run ON tasks (run_id);
CREATE INDEX idx_tasks_status ON tasks (status);

-- ----------------------------------------------------- task_dependencies
CREATE TABLE task_dependencies (
    task_id            TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    depends_on_task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    condition          TEXT NOT NULL DEFAULT 'completed-or-skipped'
                       CHECK (condition IN ('completed', 'completed-or-skipped')),
    created_at         INTEGER NOT NULL,
    PRIMARY KEY (task_id, depends_on_task_id),
    CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies (depends_on_task_id);

-- ----------------------------------------------------------------- events
CREATE TABLE events (
    id          TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    task_id     TEXT REFERENCES tasks (id) ON DELETE SET NULL,
    sequence    INTEGER NOT NULL,
    event_type  TEXT NOT NULL,
    payload     TEXT NOT NULL DEFAULT '{}',  -- JSON redacted event details
    created_at  INTEGER NOT NULL,
    UNIQUE (run_id, sequence)
);
CREATE INDEX idx_events_run ON events (run_id);
CREATE INDEX idx_events_task ON events (task_id);

-- -------------------------------------------------------------- llm_usage
CREATE TABLE llm_usage (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,          -- configuration string, not an enum
    model           TEXT NOT NULL,
    endpoint        TEXT NOT NULL DEFAULT '',
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    estimated_cost  REAL NOT NULL DEFAULT 0,
    cache_hit       INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);
CREATE INDEX idx_llm_usage_task ON llm_usage (task_id);
CREATE INDEX idx_llm_usage_endpoint ON llm_usage (provider, model, endpoint);

-- ---------------------------------------------------------------- restore
-- Foreign-key-safe order: parents (runs, tasks) before children. Existing
-- dependencies default to the PRD §7 condition ('completed-or-skipped').
INSERT INTO runs (id, project_id, plan_id, status, started_at, finished_at,
                  created_at, updated_at)
    SELECT id, project_id, plan_id, status, started_at, finished_at,
           created_at, updated_at
    FROM runs_bak;
INSERT INTO tasks (id, plan_id, section_id, run_id, title, task_type, status,
                   idempotency_key, checkpoint, retry_count, max_retries,
                   cache_ref, result_ref, error_ref, skip_reason,
                   created_at, updated_at)
    SELECT id, plan_id, section_id, run_id, title, task_type, status,
           idempotency_key, checkpoint, retry_count, max_retries,
           cache_ref, result_ref, error_ref, NULL,
           created_at, updated_at
    FROM tasks_bak;
INSERT INTO task_dependencies (task_id, depends_on_task_id, condition, created_at)
    SELECT task_id, depends_on_task_id, 'completed-or-skipped', created_at
    FROM task_dependencies_bak;
INSERT INTO events (id, run_id, task_id, sequence, event_type, payload, created_at)
    SELECT id, run_id, task_id, sequence, event_type, payload, created_at
    FROM events_bak;
INSERT INTO llm_usage (id, task_id, provider, model, endpoint, input_tokens,
                       output_tokens, duration_ms, estimated_cost, cache_hit,
                       created_at)
    SELECT id, task_id, provider, model, endpoint, input_tokens,
           output_tokens, duration_ms, estimated_cost, cache_hit, created_at
    FROM llm_usage_bak;

DROP TABLE runs_bak;
DROP TABLE tasks_bak;
DROP TABLE task_dependencies_bak;
DROP TABLE events_bak;
DROP TABLE llm_usage_bak;
