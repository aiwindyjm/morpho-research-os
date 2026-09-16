-- 004: persist the worker job binding on runs (ADR-024).
--
-- The worker job id returned by POST /jobs was previously held only in the
-- supervisor's memory, so a restart lost the run -> job association and
-- run.get / run.cancel could no longer reach the executing job. The binding
-- is nullable: legacy runs (and hermetic fakes) carry no worker job.

ALTER TABLE runs ADD COLUMN worker_job_id TEXT;

CREATE INDEX idx_runs_worker_job ON runs (worker_job_id);
