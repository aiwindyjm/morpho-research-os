//! Startup recovery: converge runs that a core restart interrupted
//! (review E).
//!
//! The worker is a child process of the core; when the core exits, the
//! worker's stdin closes and it stops accepting jobs (`morpho_worker.serve`
//! watches EOF). A run that was still `running` or `paused` at exit can
//! therefore never continue — its events and ingested domain rows remain
//! persisted, but no worker will finish it. Recovery converges those runs
//! explicitly instead of leaving them dangling at `running`:
//!
//! * every `running`/`paused` run receives a core-originated
//!   `run.cancelled` event (persisted + projected through the ADR-019
//!   orchestrator, same mechanism `run_cancel` uses when the worker no
//!   longer knows a job), closing its claimed non-terminal tasks as
//!   CANCELLED. The reason is recorded in the event payload so the closure
//!   is auditable;
//! * `needs_review` runs are PARKED, not cancelled: a review request awaits
//!   a local, user-driven resolution (`run_cancel` converges one if the
//!   user chooses to abandon it), so restarting the core must not erase
//!   pending review work;
//! * terminal runs (completed/failed/cancelled) are untouched — reopening a
//!   finished database changes nothing.
//!
//! This is convergence, not resumption: mid-flight research work cannot
//! resume because V0.1 has no persistent job queue (the supervisor's active
//! set is in-memory). The un-executed remainder of a plan is addressed by
//! the plan-reuse rule in `run_start` (regenerate → approve → run).

use crate::error::CoreError;
use crate::ipc::ResearchEvent;
use crate::orchestrator::CanonicalEvent;
use crate::repositories::with_write_tx;
use rusqlite::Connection;

/// What recovery did on one startup.
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct RecoveryReport {
    /// Runs converged to `cancelled` because the worker that executed them
    /// died with the previous core process.
    pub interrupted_runs_cancelled: Vec<String>,
    /// Runs parked at `needs_review`, awaiting local review resolution.
    pub parked_review_runs: Vec<String>,
    /// Terminal runs whose undelivered results converged to durable
    /// `delivery_status='failed'` (round-2 review P1).
    pub delivery_converged_runs: Vec<String>,
}

impl RecoveryReport {
    pub fn is_empty(&self) -> bool {
        self.interrupted_runs_cancelled.is_empty() && self.parked_review_runs.is_empty()
    }
}

/// Converges one run locally: persists a `run.cancelled` event, projects it,
/// and marks the run's result delivery `failed` (the worker that held the
/// results is gone) — all in ONE write transaction, the same atomicity rule
/// as the pump (round-2 review P1/P4). Shared by startup recovery and
/// `run_cancel`'s worker-gone fallback; errors propagate so no caller can
/// report success on top of a failed projection.
pub fn converge_cancelled_run(
    conn: &mut Connection,
    run_id: &str,
    reason: &str,
) -> Result<(), CoreError> {
    let worker_job_id: Option<String> = conn
        .query_row(
            "SELECT worker_job_id FROM runs WHERE id = ?1",
            rusqlite::params![run_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    let event = ResearchEvent::new(
        run_id.to_string(),
        None,
        0,
        crate::ids::now_unix_ms() as u64,
        "run.cancelled",
        serde_json::json!({
            "reason": reason,
            "worker_job_id": worker_job_id,
            "results_undelivered": true,
        }),
    );
    with_write_tx(conn, |tx| {
        crate::repositories::events::Events::append(
            tx,
            &crate::repositories::events::NewEvent {
                run_id: event.run_id.clone(),
                task_id: event.task_id.clone(),
                event_type: event.event_type.clone(),
                payload: serde_json::to_string(&event.payload).map_err(|err| {
                    CoreError::database(format!("serialize recovery payload failed: {err}"))
                })?,
            },
        )?;
        crate::orchestrator::OrchestratorService::apply_event_tx(
            tx,
            &CanonicalEvent::from(&event),
        )?;
        // The worker died with the previous core process: its undelivered
        // result records are unrecoverable, which is a durable, observable
        // fact — never a silent "completed".
        crate::repositories::runs::Runs::set_delivery_status(tx, run_id, "failed")?;
        Ok(())
    })
}

/// Marks every terminal run whose results were never delivered (migration
/// 006 `pending`/`failed` delivery): the worker is gone, so delivery can
/// never complete — the run converges to durable `delivery_status='failed'`
/// with an auditable note event (round-2 review P1). Legacy `unknown` rows
/// are left untouched: nothing can be proven about them.
fn converge_undelivered_runs(
    conn: &mut Connection,
    already_cancelled: &[String],
) -> Result<Vec<String>, CoreError> {
    let mut converged = Vec::new();
    for run in crate::repositories::runs::Runs::list_terminal_undelivered(conn)? {
        // Runs this same pass cancelled already carry the delivery-failed
        // fact from their convergence transaction; no second note.
        if already_cancelled.contains(&run.id) {
            continue;
        }
        let event = ResearchEvent::new(
            run.id.clone(),
            None,
            0,
            crate::ids::now_unix_ms() as u64,
            "run.result_delivery_failed",
            serde_json::json!({
                "reason": "core restarted before the run's results were delivered; the worker \
                           process died with them",
                "worker_job_id": run.worker_job_id,
                "execution_status": run.status,
            }),
        );
        with_write_tx(conn, |tx| {
            crate::repositories::events::Events::append(
                tx,
                &crate::repositories::events::NewEvent {
                    run_id: event.run_id.clone(),
                    task_id: event.task_id.clone(),
                    event_type: event.event_type.clone(),
                    payload: serde_json::to_string(&event.payload).map_err(|err| {
                        CoreError::database(format!(
                            "serialize delivery-note payload failed: {err}"
                        ))
                    })?,
                },
            )?;
            // No task/run projection for this vocabulary; the note is the
            // auditable record next to the durable status.
            crate::orchestrator::OrchestratorService::apply_event_tx(
                tx,
                &CanonicalEvent::from(&event),
            )?;
            crate::repositories::runs::Runs::set_delivery_status(tx, &run.id, "failed")?;
            Ok(())
        })?;
        converged.push(run.id);
    }
    Ok(converged)
}

/// Converges every non-terminal run that cannot continue after a restart,
/// then every terminal run whose results were never delivered.
/// Idempotent: a run already converged (or a clean database) reports
/// nothing.
pub fn converge_interrupted_runs(conn: &mut Connection) -> Result<RecoveryReport, CoreError> {
    let mut report = RecoveryReport::default();
    let rows: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, status FROM runs
                 WHERE status IN ('running', 'paused', 'needs_review')
                 ORDER BY created_at, id",
            )
            .map_err(CoreError::from)?;
        let mapped = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        mapped
    };
    for (run_id, status) in rows {
        if status == "needs_review" {
            report.parked_review_runs.push(run_id);
            continue;
        }
        converge_cancelled_run(
            conn,
            &run_id,
            "core restarted while the run was in flight; the worker process died with it",
        )?;
        report.interrupted_runs_cancelled.push(run_id);
    }
    report.delivery_converged_runs =
        converge_undelivered_runs(conn, &report.interrupted_runs_cancelled)?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::configs::{NewResearchConfig, ResearchConfigs};
    use crate::repositories::plans::{NewPlan, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::runs::{NewRun, RunRecord, Runs};
    use crate::repositories::tasks::Tasks;
    use serde_json::json;

    /// One project + plan with a single task + a run in the given status;
    /// returns (conn, run_id, task_id).
    fn fixture(run_status: &str, task_status: &str, claim: bool) -> (Connection, String, String) {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = with_write_tx(&mut conn, |tx| {
            Projects::insert(
                tx,
                &NewProject {
                    name: "P".into(),
                    description: String::new(),
                },
            )
            .map(|p| p.id)
        })
        .unwrap();
        let config_id = with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: project_id.clone(),
                    ..Default::default()
                },
            )
            .map(|c| c.id)
        })
        .unwrap();
        let created = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.clone(),
                        research_config_id: config_id,
                        title: "T".into(),
                        rationale: String::new(),
                    },
                    sections: vec![],
                    tasks: vec![crate::repositories::plans::NewTask {
                        title: "search".into(),
                        description: String::new(),
                        task_type: "search".into(),
                        idempotency_key: "k1".into(),
                        section_index: None,
                        depends_on: vec![],
                    }],
                },
            )
        })
        .unwrap();
        let task_id = created.tasks[0].id.clone();
        let run = with_write_tx(&mut conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id: project_id.clone(),
                    plan_id: created.plan.id.clone(),
                    started_at: None,
                },
            )
        })
        .unwrap();
        if run_status != "running" || task_status != "PENDING" || claim {
            with_write_tx(&mut conn, |tx| Runs::update_status(tx, &run.id, run_status)).unwrap();
        }
        if claim || task_status != "PENDING" {
            with_write_tx(&mut conn, |tx| {
                tx.execute(
                    "UPDATE tasks SET run_id = ?2, status = ?3 WHERE id = ?1",
                    rusqlite::params![task_id, run.id, task_status],
                )
                .map_err(CoreError::from)
            })
            .unwrap();
        }
        (conn, run.id, task_id)
    }

    fn run(conn: &Connection, run_id: &str) -> RunRecord {
        Runs::get(conn, run_id).unwrap().unwrap()
    }

    /// Scenario 1 — the core died mid-execution: a running run with a
    /// RUNNING task. Reopening converges both to cancelled with an auditable
    /// event; nothing is fabricated as completed.
    #[test]
    fn a_mid_execution_exit_converges_to_cancelled() {
        let (mut conn, run_id, task_id) = fixture("running", "RUNNING", true);
        let report = converge_interrupted_runs(&mut conn).unwrap();
        assert_eq!(report.interrupted_runs_cancelled, vec![run_id.clone()]);
        assert_eq!(run(&conn, &run_id).status, "cancelled");
        assert!(run(&conn, &run_id).finished_at.is_some());
        assert_eq!(
            Tasks::get(&conn, &task_id).unwrap().unwrap().status,
            "CANCELLED"
        );
        // The closure is auditable: the recovery event is in the log.
        let events =
            crate::repositories::events::Events::list_after(&conn, &run_id, 0, 10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "run.cancelled");
        assert!(events[0].payload.contains("core restarted"));

        // Idempotent: a second convergence (another restart) changes nothing.
        let again = converge_interrupted_runs(&mut conn).unwrap();
        assert!(again.is_empty());
        assert_eq!(run(&conn, &run_id).status, "cancelled");
    }

    /// Scenario 2 — the terminal job event was persisted but the results
    /// were never ingested before the exit: the run still converges (the
    /// worker is gone; the un-ingested records are honestly lost, and the
    /// event log records what happened — no fabricated delivery).
    #[test]
    fn a_terminal_but_undelivered_run_converges_without_fabricating_results() {
        let (mut conn, run_id, task_id) = fixture("running", "RUNNING", true);
        // A terminal job event landed in the log, but no domain rows did.
        with_write_tx(&mut conn, |tx| {
            crate::repositories::events::Events::append(
                tx,
                &crate::repositories::events::NewEvent {
                    run_id: run_id.clone(),
                    task_id: None,
                    event_type: "job.completed".into(),
                    payload: json!({}).to_string(),
                },
            )
            .map(|_| ())
        })
        .unwrap();

        let report = converge_interrupted_runs(&mut conn).unwrap();
        assert_eq!(report.interrupted_runs_cancelled, vec![run_id.clone()]);
        assert_eq!(run(&conn, &run_id).status, "cancelled");
        assert_eq!(
            Tasks::get(&conn, &task_id).unwrap().unwrap().status,
            "CANCELLED"
        );
        // No domain rows were invented.
        let project_id = run(&conn, &run_id).project_id;
        assert!(
            crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                .unwrap()
                .is_empty()
        );
    }

    /// Scenario 3 — SQL failures before the exit leave the same interrupted
    /// shape; recovery converges it (covered by the same convergence path,
    /// asserted here with a paused run).
    #[test]
    fn a_paused_run_from_a_failed_cycle_converges() {
        let (mut conn, run_id, _task_id) = fixture("paused", "PAUSED", true);
        let report = converge_interrupted_runs(&mut conn).unwrap();
        assert_eq!(report.interrupted_runs_cancelled, vec![run_id.clone()]);
        assert_eq!(run(&conn, &run_id).status, "cancelled");
    }

    /// Scenario 4 — reopening after completion: the EXECUTION facts are
    /// untouched, but an undelivered completed run (round-2 review P1) now
    /// converges its delivery fact durably instead of silently passing as
    /// fully done.
    #[test]
    fn a_completed_run_keeps_execution_but_converges_undelivered_results() {
        let (mut conn, run_id, task_id) = fixture("completed", "COMPLETED", true);
        let report = converge_interrupted_runs(&mut conn).unwrap();
        assert!(report.interrupted_runs_cancelled.is_empty());
        assert_eq!(report.delivery_converged_runs, vec![run_id.clone()]);
        assert_eq!(run(&conn, &run_id).status, "completed");
        assert_eq!(
            Tasks::get(&conn, &task_id).unwrap().unwrap().status,
            "COMPLETED"
        );
        assert_eq!(run(&conn, &run_id).delivery_status, "failed");
        // Exactly one auditable delivery-failure note; the execution was
        // never rewritten (no run.cancelled).
        let events = crate::repositories::events::Events::list_after(&conn, &run_id, 0, 10)
            .unwrap()
            .iter()
            .map(|event| event.event_type.clone())
            .collect::<Vec<_>>();
        assert_eq!(events, vec!["run.result_delivery_failed".to_string()]);

        // A DELIVERED completed run is fully untouched.
        let (mut conn, run_id, task_id) = fixture("completed", "COMPLETED", true);
        with_write_tx(&mut conn, |tx| {
            Runs::set_delivery_status(tx, &run_id, "delivered").map(|_| ())
        })
        .unwrap();
        let report = converge_interrupted_runs(&mut conn).unwrap();
        assert!(report.is_empty());
        assert_eq!(run(&conn, &run_id).status, "completed");
        assert_eq!(
            Tasks::get(&conn, &task_id).unwrap().unwrap().status,
            "COMPLETED"
        );
        assert!(
            crate::repositories::events::Events::list_after(&conn, &run_id, 0, 10)
                .unwrap()
                .is_empty(),
            "no recovery event for a delivered run"
        );
    }

    /// A run created but never bound to a worker job (crash between the run
    /// insert and the binding) also converges instead of dangling.
    #[test]
    fn an_unbound_running_run_converges() {
        let (mut conn, run_id, _task_id) = fixture("running", "PENDING", false);
        let report = converge_interrupted_runs(&mut conn).unwrap();
        assert_eq!(report.interrupted_runs_cancelled, vec![run_id.clone()]);
        assert_eq!(run(&conn, &run_id).status, "cancelled");
    }

    /// Review-parked runs survive a restart: the pending review is local,
    /// user-driven work, not worker-dependent state.
    #[test]
    fn a_needs_review_run_is_parked_not_cancelled() {
        let (mut conn, run_id, task_id) = fixture("needs_review", "NEEDS_REVIEW", true);
        let report = converge_interrupted_runs(&mut conn).unwrap();
        assert!(report.interrupted_runs_cancelled.is_empty());
        assert_eq!(report.parked_review_runs, vec![run_id.clone()]);
        assert_eq!(run(&conn, &run_id).status, "needs_review");
        assert_eq!(
            Tasks::get(&conn, &task_id).unwrap().unwrap().status,
            "NEEDS_REVIEW"
        );
    }
}
