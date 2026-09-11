-- 001_initial.sql — V0.1 runtime/index schema (RUST-02).
-- Table set is fixed by packages/schemas/MIGRATIONS.md; column details follow
-- docs/DATA_MODEL.md and docs/PRD.md:
--   * primary keys are UUIDv7 TEXT strings
--   * timestamps are INTEGER unix epoch milliseconds (UTC)
--   * mutable tables carry created_at/updated_at
--   * foreign keys cascade deletes; project attribution is mandatory
--   * JSON columns are limited to the categories docs/DATA_MODEL.md allows
--     (provider payload metadata, task parameters, typed node metadata,
--     event details)
-- Future schema changes are new numbered files only; never edit this file.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- projects
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived')),
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

-- -------------------------------------------------------- research_configs
-- Columns mirror packages/schemas/research-config.v1.json.
CREATE TABLE research_configs (
    id               TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    schema_version   TEXT NOT NULL DEFAULT '1.0',
    domain           TEXT NOT NULL,
    topic            TEXT NOT NULL,
    purpose          TEXT NOT NULL,
    audience         TEXT NOT NULL DEFAULT '',
    depth            INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 5),
    dimensions       TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
    time_range_from  INTEGER,
    time_range_to    INTEGER,
    geographic_scope TEXT NOT NULL DEFAULT '',
    languages        TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
    source_types     TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
    source_domains   TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
    update_frequency TEXT NOT NULL DEFAULT 'manual',
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_research_configs_project ON research_configs (project_id);

-- ------------------------------------------------------------------ plans
CREATE TABLE plans (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    research_config_id  TEXT NOT NULL REFERENCES research_configs (id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
);
CREATE INDEX idx_plans_project ON plans (project_id);
CREATE INDEX idx_plans_config ON plans (research_config_id);

-- --------------------------------------------------------------- sections
CREATE TABLE sections (
    id           TEXT PRIMARY KEY,
    plan_id      TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    order_index  INTEGER NOT NULL,
    summary      TEXT NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL
);
CREATE INDEX idx_sections_plan ON sections (plan_id);

-- ------------------------------------------------------------------- runs
CREATE TABLE runs (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    plan_id      TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
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
                                       'FAILED', 'CANCELLED')),
    idempotency_key  TEXT NOT NULL UNIQUE,
    checkpoint       TEXT,          -- JSON task parameters / checkpoint state
    retry_count      INTEGER NOT NULL DEFAULT 0,
    max_retries      INTEGER NOT NULL DEFAULT 3,
    cache_ref        TEXT,
    result_ref       TEXT,
    error_ref        TEXT,
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
    created_at         INTEGER NOT NULL,
    PRIMARY KEY (task_id, depends_on_task_id),
    CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies (depends_on_task_id);

-- ---------------------------------------------------------------- sources
-- canonical_url is the stable dedup key inside a project (RES-03).
CREATE TABLE sources (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    url            TEXT NOT NULL,
    canonical_url  TEXT NOT NULL,
    title          TEXT NOT NULL DEFAULT '',
    source_type    TEXT NOT NULL DEFAULT 'web',
    published_at   INTEGER,
    retrieved_at   INTEGER NOT NULL,
    quality_score  REAL,
    quality_notes  TEXT,             -- JSON source quality metadata
    status         TEXT NOT NULL DEFAULT 'discovered'
                   CHECK (status IN ('discovered', 'evaluated', 'excluded', 'failed')),
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    UNIQUE (project_id, canonical_url)
);
CREATE INDEX idx_sources_project ON sources (project_id);
CREATE INDEX idx_sources_canonical_url ON sources (canonical_url);

-- ------------------------------------------------------- source_contents
CREATE TABLE source_contents (
    id            TEXT PRIMARY KEY,
    source_id     TEXT NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
    content_hash  TEXT NOT NULL,
    format        TEXT NOT NULL DEFAULT 'html',
    cache_path    TEXT NOT NULL DEFAULT '',
    byte_size     INTEGER NOT NULL DEFAULT 0,
    extracted_at  INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
);
CREATE INDEX idx_source_contents_source ON source_contents (source_id);
CREATE INDEX idx_source_contents_hash ON source_contents (content_hash);

-- -------------------------------------------------------- knowledge_nodes
CREATE TABLE knowledge_nodes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    node_type   TEXT NOT NULL,
    title       TEXT NOT NULL,
    slug        TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'draft',
    confidence  TEXT NOT NULL DEFAULT 'unverified'
                CHECK (confidence IN ('confirmed', 'high', 'medium', 'low',
                                      'unverified', 'conflicting')),
    aliases     TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
    tags        TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
    source_ids  TEXT NOT NULL DEFAULT '[]',  -- JSON array of source ids
    claim_ids   TEXT NOT NULL DEFAULT '[]',  -- JSON array of claim ids
    metadata    TEXT NOT NULL DEFAULT '{}',  -- JSON typed node metadata
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    UNIQUE (project_id, slug)
);
CREATE INDEX idx_knowledge_nodes_project ON knowledge_nodes (project_id);
CREATE INDEX idx_knowledge_nodes_type ON knowledge_nodes (node_type);

-- ----------------------------------------------------------------- claims
CREATE TABLE claims (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    subject      TEXT NOT NULL,
    predicate    TEXT NOT NULL,
    object_value TEXT NOT NULL DEFAULT '',
    scope        TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'draft',
    confidence   TEXT NOT NULL DEFAULT 'unverified'
                 CHECK (confidence IN ('confirmed', 'high', 'medium', 'low',
                                       'unverified', 'conflicting')),
    provenance   TEXT NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_claims_project ON claims (project_id);
CREATE INDEX idx_claims_status ON claims (status);

-- --------------------------------------------------------------- evidence
CREATE TABLE evidence (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    source_id     TEXT NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
    quote         TEXT NOT NULL DEFAULT '',
    value         TEXT NOT NULL DEFAULT '',
    locator       TEXT NOT NULL DEFAULT '',
    retrieved_at  INTEGER NOT NULL,
    direction     TEXT NOT NULL CHECK (direction IN ('support', 'contradict')),
    created_at    INTEGER NOT NULL
);
CREATE INDEX idx_evidence_project ON evidence (project_id);
CREATE INDEX idx_evidence_source ON evidence (source_id);

-- --------------------------------------------------- claim_evidence (N:N)
CREATE TABLE claim_evidence (
    claim_id    TEXT NOT NULL REFERENCES claims (id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL REFERENCES evidence (id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (claim_id, evidence_id)
);
CREATE INDEX idx_claim_evidence_evidence ON claim_evidence (evidence_id);

-- -------------------------------------------------------------- relations
CREATE TABLE relations (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    from_node_id   TEXT NOT NULL REFERENCES knowledge_nodes (id) ON DELETE CASCADE,
    to_node_id     TEXT NOT NULL REFERENCES knowledge_nodes (id) ON DELETE CASCADE,
    relation_type  TEXT NOT NULL,
    confidence     TEXT NOT NULL DEFAULT 'unverified',
    created_at     INTEGER NOT NULL,
    CHECK (from_node_id <> to_node_id)
);
CREATE INDEX idx_relations_project ON relations (project_id);
CREATE INDEX idx_relations_from ON relations (from_node_id);
CREATE INDEX idx_relations_to ON relations (to_node_id);

-- -------------------------------------------------------------- artifacts
-- Index of generated vault files; content_hash powers user-modification
-- detection for the vault writer (RES-07). origin marks who authored the
-- recorded bytes: 'core' (generated, may be regenerated) or 'user' (kept by
-- an explicit merge decision, never auto-overwritten).
CREATE TABLE artifacts (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    node_id      TEXT REFERENCES knowledge_nodes (id) ON DELETE SET NULL,
    path         TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    byte_size    INTEGER NOT NULL DEFAULT 0,
    origin       TEXT NOT NULL DEFAULT 'core'
                 CHECK (origin IN ('core', 'user')),
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    UNIQUE (project_id, path)
);
CREATE INDEX idx_artifacts_project ON artifacts (project_id);
CREATE INDEX idx_artifacts_node ON artifacts (node_id);

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

-- ------------------------------------------------------------- schema_meta
-- Written only by the migration runner after a migration commits. Version 0
-- means "no migrations applied" (table absent).
CREATE TABLE schema_meta (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at INTEGER NOT NULL
);
