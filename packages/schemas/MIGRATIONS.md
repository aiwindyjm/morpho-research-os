# V0.1 SQLite Migration Plan
`migrations/001_initial.sql` creates projects, research_configs, plans, sections, runs, tasks, task_dependencies, sources, source_contents, knowledge_nodes, claims, evidence, relations, artifacts, events, llm_usage, and schema_meta. All tables have UUIDv7 primary keys, created_at/updated_at where mutable, foreign keys, and indexes required by docs/DATA_MODEL.md. Future changes are new numbered files only.

- `002_task_skip_and_orchestrator.sql`: adds `SKIPPED` + `skip_reason` to tasks, `needs_review` to runs, and `task_dependencies.condition` (table rebuild).
- `003_plan_metadata_and_gap_decisions.sql`: plan metadata columns and the `gap_decisions` table.
- `004_run_worker_job_id.sql`: adds the nullable, indexed `runs.worker_job_id` — the persisted run → worker-job binding so `run_latest_get`/`run_cancel` survive restarts (ADR-024).
