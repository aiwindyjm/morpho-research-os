//! Task reads and status updates.
//!
//! The legal transition graph is owned by [`crate::orchestrator`]; this
//! repository only persists and reads. Statuses are validated against the
//! schema's CHECK list before any write.

use crate::error::CoreError;
use crate::ids::now_unix_ms;
use crate::repositories::plans::TaskRecord;
use rusqlite::{params, Connection, Row, Transaction};

/// One `task_dependencies` row (migration 002 adds `condition`; new rows
/// default to `'completed-or-skipped'`, the PRD §7 behavior).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskDependencyRecord {
    pub task_id: String,
    pub depends_on_task_id: String,
    /// `'completed'` or `'completed-or-skipped'`; interpretation lives in the
    /// orchestrator.
    pub condition: String,
}

pub struct Tasks;

impl Tasks {
    pub fn get(conn: &Connection, id: &str) -> Result<Option<TaskRecord>, CoreError> {
        select_one(conn, "WHERE id = ?1", params![id])
    }

    pub fn get_by_idempotency_key(
        conn: &Connection,
        key: &str,
    ) -> Result<Option<TaskRecord>, CoreError> {
        select_one(conn, "WHERE idempotency_key = ?1", params![key])
    }

    /// Updates a task status. The caller (orchestrator service) is
    /// responsible for transition legality; unknown status names are
    /// rejected here.
    pub fn update_status(
        tx: &Transaction<'_>,
        id: &str,
        status: &str,
    ) -> Result<TaskRecord, CoreError> {
        if !crate::repositories::plans::TASK_STATES.contains(&status) {
            return Err(CoreError::database(format!(
                "unknown task status '{status}'"
            )));
        }
        let changed = tx
            .execute(
                "UPDATE tasks SET status = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, status, now_unix_ms()],
            )
            .map_err(CoreError::from)?;
        if changed == 0 {
            return Err(CoreError::database(format!("task '{id}' not found")));
        }
        tx_immediate_get(tx, id)
    }

    /// Records a retry attempt (bump counter) without changing status.
    pub fn record_retry(tx: &Transaction<'_>, id: &str) -> Result<TaskRecord, CoreError> {
        let changed = tx
            .execute(
                "UPDATE tasks SET retry_count = retry_count + 1, updated_at = ?2 WHERE id = ?1",
                params![id, now_unix_ms()],
            )
            .map_err(CoreError::from)?;
        if changed == 0 {
            return Err(CoreError::database(format!("task '{id}' not found")));
        }
        tx_immediate_get(tx, id)
    }

    /// Persists JSON task parameters / checkpoint state for resumable
    /// execution (DO_NOT_BREAK #6). Status is untouched; transition legality
    /// stays with the orchestrator.
    pub fn set_checkpoint(
        tx: &Transaction<'_>,
        id: &str,
        checkpoint: &str,
    ) -> Result<TaskRecord, CoreError> {
        set_ref_column(
            tx,
            id,
            "UPDATE tasks SET checkpoint = ?2, updated_at = ?3 WHERE id = ?1",
            Some(checkpoint),
        )
    }

    /// Drops a stored checkpoint (for example after a completed run leaves
    /// nothing to resume).
    pub fn clear_checkpoint(tx: &Transaction<'_>, id: &str) -> Result<TaskRecord, CoreError> {
        set_ref_column(
            tx,
            id,
            "UPDATE tasks SET checkpoint = NULL, updated_at = ?3 WHERE id = ?1",
            None::<&str>,
        )
    }

    /// Records where a task's validated output lives (vault path or storage
    /// reference). The referenced bytes are owned by their producers; this
    /// column only points at them.
    pub fn set_result(
        tx: &Transaction<'_>,
        id: &str,
        result_ref: &str,
    ) -> Result<TaskRecord, CoreError> {
        set_ref_column(
            tx,
            id,
            "UPDATE tasks SET result_ref = ?2, updated_at = ?3 WHERE id = ?1",
            Some(result_ref),
        )
    }

    /// Clears a stale result reference.
    pub fn clear_result(tx: &Transaction<'_>, id: &str) -> Result<TaskRecord, CoreError> {
        set_ref_column(
            tx,
            id,
            "UPDATE tasks SET result_ref = NULL, updated_at = ?3 WHERE id = ?1",
            None::<&str>,
        )
    }

    /// Records where a task's structured failure detail lives (for example a
    /// redacted error report). Setting this does not change the task status;
    /// the orchestrator decides that transition.
    pub fn set_error(
        tx: &Transaction<'_>,
        id: &str,
        error_ref: &str,
    ) -> Result<TaskRecord, CoreError> {
        set_ref_column(
            tx,
            id,
            "UPDATE tasks SET error_ref = ?2, updated_at = ?3 WHERE id = ?1",
            Some(error_ref),
        )
    }

    /// Clears an error reference (for example before a retry attempt).
    pub fn clear_error(tx: &Transaction<'_>, id: &str) -> Result<TaskRecord, CoreError> {
        set_ref_column(
            tx,
            id,
            "UPDATE tasks SET error_ref = NULL, updated_at = ?3 WHERE id = ?1",
            None::<&str>,
        )
    }

    /// Records why a task was explicitly skipped (migration 002). Setting a
    /// reason never changes the task status; the SKIPPED transition itself is
    /// the orchestrator's decision.
    pub fn set_skip_reason(
        tx: &Transaction<'_>,
        id: &str,
        reason: &str,
    ) -> Result<TaskRecord, CoreError> {
        let changed = tx
            .execute(
                "UPDATE tasks SET skip_reason = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, reason, now_unix_ms()],
            )
            .map_err(CoreError::from)?;
        if changed == 0 {
            return Err(CoreError::database(format!("task '{id}' not found")));
        }
        tx_immediate_get(tx, id)
    }

    /// All tasks assigned to a run, oldest first (the orchestrator's run
    /// rollup input).
    pub fn list_for_run(conn: &Connection, run_id: &str) -> Result<Vec<TaskRecord>, CoreError> {
        let sql = format!(
            "SELECT id, plan_id, section_id, run_id, title, task_type, status, idempotency_key,
                    checkpoint, retry_count, max_retries, cache_ref, result_ref, error_ref,
                    skip_reason, created_at, updated_at
             FROM tasks WHERE run_id = ?1 ORDER BY created_at, id"
        );
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![run_id], map_task)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    /// Direct dependencies of a task: rows where the task is the dependent.
    pub fn dependencies_of(
        conn: &Connection,
        task_id: &str,
    ) -> Result<Vec<TaskDependencyRecord>, CoreError> {
        dependency_rows(
            conn,
            "WHERE task_id = ?1 ORDER BY depends_on_task_id",
            task_id,
        )
    }

    /// Direct dependents of a task: rows where the task is depended on.
    pub fn dependents_of(
        conn: &Connection,
        task_id: &str,
    ) -> Result<Vec<TaskDependencyRecord>, CoreError> {
        dependency_rows(
            conn,
            "WHERE depends_on_task_id = ?1 ORDER BY task_id",
            task_id,
        )
    }

    /// Claims every still-unassigned PENDING task of a plan for a run.
    /// Idempotent: only rows with a NULL `run_id` are touched, so replays and
    /// later runs of the same plan never steal tasks from another run.
    /// Returns the number of tasks claimed.
    pub fn claim_for_run(
        tx: &Transaction<'_>,
        plan_id: &str,
        run_id: &str,
    ) -> Result<usize, CoreError> {
        tx.execute(
            "UPDATE tasks SET run_id = ?2, updated_at = ?3
             WHERE plan_id = ?1 AND run_id IS NULL AND status = 'PENDING'",
            params![plan_id, run_id, now_unix_ms()],
        )
        .map_err(CoreError::from)
    }
}

fn dependency_rows(
    conn: &Connection,
    suffix: &str,
    task_id: &str,
) -> Result<Vec<TaskDependencyRecord>, CoreError> {
    let sql =
        format!("SELECT task_id, depends_on_task_id, condition FROM task_dependencies {suffix}");
    let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
    let rows = stmt
        .query_map(params![task_id], |row| {
            Ok(TaskDependencyRecord {
                task_id: row.get(0)?,
                depends_on_task_id: row.get(1)?,
                condition: row.get(2)?,
            })
        })
        .map_err(CoreError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(CoreError::from)?;
    Ok(rows)
}

/// Applies one static per-column UPDATE (`?1` = task id, `?2` = new value or
/// NULL, `?3` = updated_at) and returns the refreshed record. Unknown ids
/// surface as a structured not-found error.
fn set_ref_column(
    tx: &Transaction<'_>,
    id: &str,
    sql: &'static str,
    value: Option<&str>,
) -> Result<TaskRecord, CoreError> {
    let changed = tx
        .execute(sql, params![id, value, now_unix_ms()])
        .map_err(CoreError::from)?;
    if changed == 0 {
        return Err(CoreError::database(format!("task '{id}' not found")));
    }
    tx_immediate_get(tx, id)
}

fn select_one(
    conn: &Connection,
    suffix: &str,
    params: impl rusqlite::Params,
) -> Result<Option<TaskRecord>, CoreError> {
    let sql = format!(
        "SELECT id, plan_id, section_id, run_id, title, task_type, status, idempotency_key,
                checkpoint, retry_count, max_retries, cache_ref, result_ref, error_ref,
                skip_reason, created_at, updated_at
         FROM tasks {suffix}"
    );
    let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
    let mut rows = stmt.query(params).map_err(CoreError::from)?;
    match rows.next().map_err(CoreError::from)? {
        Some(row) => Ok(Some(map_task(row)?)),
        None => Ok(None),
    }
}

fn tx_immediate_get(tx: &Transaction<'_>, id: &str) -> Result<TaskRecord, CoreError> {
    let sql = "SELECT id, plan_id, section_id, run_id, title, task_type, status, idempotency_key,
                      checkpoint, retry_count, max_retries, cache_ref, result_ref, error_ref,
                      skip_reason, created_at, updated_at
               FROM tasks WHERE id = ?1";
    tx.query_row(sql, params![id], map_task)
        .map_err(CoreError::from)
}

fn map_task(row: &Row<'_>) -> rusqlite::Result<TaskRecord> {
    Ok(TaskRecord {
        id: row.get(0)?,
        plan_id: row.get(1)?,
        section_id: row.get(2)?,
        run_id: row.get(3)?,
        title: row.get(4)?,
        task_type: row.get(5)?,
        status: row.get(6)?,
        idempotency_key: row.get(7)?,
        checkpoint: row.get(8)?,
        retry_count: row.get(9)?,
        max_retries: row.get(10)?,
        cache_ref: row.get(11)?,
        result_ref: row.get(12)?,
        error_ref: row.get(13)?,
        skip_reason: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::configs::{NewResearchConfig, ResearchConfigs};
    use crate::repositories::plans::{NewPlan, NewTask, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::with_write_tx;

    fn task_in_db() -> (Connection, TaskRecord) {
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
                        project_id,
                        research_config_id: config_id,
                        title: "T".into(),
                    },
                    sections: vec![],
                    tasks: vec![NewTask {
                        title: "s".into(),
                        task_type: "search".into(),
                        idempotency_key: "k-1".into(),
                        section_index: None,
                        depends_on: vec![],
                    }],
                },
            )
        })
        .unwrap();
        (conn, created.tasks.into_iter().next().unwrap())
    }

    #[test]
    fn update_status_persists_and_rejects_unknown_states() {
        let (mut conn, task) = task_in_db();
        with_write_tx(&mut conn, |tx| {
            Tasks::update_status(tx, &task.id, "RUNNING")
        })
        .unwrap();
        assert_eq!(
            Tasks::get(&conn, &task.id).unwrap().unwrap().status,
            "RUNNING"
        );

        let err = with_write_tx(&mut conn, |tx| {
            Tasks::update_status(tx, &task.id, "EXPLODING")
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("unknown task status"));

        let err = with_write_tx(&mut conn, |tx| Tasks::update_status(tx, "ghost", "RUNNING"))
            .unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn lookup_by_idempotency_key_works() {
        let (conn, task) = task_in_db();
        let found = Tasks::get_by_idempotency_key(&conn, "k-1")
            .unwrap()
            .unwrap();
        assert_eq!(found.id, task.id);
        assert!(Tasks::get_by_idempotency_key(&conn, "missing")
            .unwrap()
            .is_none());
    }

    #[test]
    fn record_retry_increments_counter() {
        let (mut conn, task) = task_in_db();
        let updated = with_write_tx(&mut conn, |tx| Tasks::record_retry(tx, &task.id)).unwrap();
        assert_eq!(updated.retry_count, 1);
    }

    #[test]
    fn checkpoint_result_and_error_refs_round_trip_and_clear() {
        let (mut conn, task) = task_in_db();

        let with_checkpoint = with_write_tx(&mut conn, |tx| {
            Tasks::set_checkpoint(tx, &task.id, r#"{"cursor":"page-2"}"#)
        })
        .unwrap();
        assert_eq!(
            with_checkpoint.checkpoint.as_deref(),
            Some(r#"{"cursor":"page-2"}"#)
        );
        // Setting a reference never changes the task status.
        assert_eq!(with_checkpoint.status, "PENDING");

        let with_result = with_write_tx(&mut conn, |tx| {
            Tasks::set_result(tx, &task.id, "vault://out/a.md")
        })
        .unwrap();
        assert_eq!(with_result.result_ref.as_deref(), Some("vault://out/a.md"));
        assert_eq!(
            with_result.checkpoint.as_deref(),
            Some(r#"{"cursor":"page-2"}"#)
        );

        let with_error = with_write_tx(&mut conn, |tx| {
            Tasks::set_error(tx, &task.id, "errors/task-1.json")
        })
        .unwrap();
        assert_eq!(with_error.error_ref.as_deref(), Some("errors/task-1.json"));

        let cleared = with_write_tx(&mut conn, |tx| {
            Tasks::clear_checkpoint(tx, &task.id)?;
            Tasks::clear_result(tx, &task.id)?;
            Tasks::clear_error(tx, &task.id)
        })
        .unwrap();
        assert!(cleared.checkpoint.is_none());
        assert!(cleared.result_ref.is_none());
        assert!(cleared.error_ref.is_none());

        // Reads through the plain SELECT also expose the columns.
        let stored = Tasks::get(&conn, &task.id).unwrap().unwrap();
        assert_eq!(stored, cleared);
    }

    #[test]
    fn ref_setters_reject_unknown_tasks() {
        let (mut conn, _task) = task_in_db();
        let err = with_write_tx(&mut conn, |tx| {
            Tasks::set_checkpoint(tx, "ghost", "{}").map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    /// Project -> config -> plan (two dependent tasks) -> run fixture.
    fn run_with_dependency_dag() -> (Connection, String, String, String) {
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
                        project_id,
                        research_config_id: config_id,
                        title: "T".into(),
                    },
                    sections: vec![],
                    tasks: vec![
                        NewTask {
                            title: "a".into(),
                            task_type: "search".into(),
                            idempotency_key: "dag-a".into(),
                            section_index: None,
                            depends_on: vec![],
                        },
                        NewTask {
                            title: "b".into(),
                            task_type: "extraction".into(),
                            idempotency_key: "dag-b".into(),
                            section_index: None,
                            depends_on: vec!["dag-a".into()],
                        },
                    ],
                },
            )
        })
        .unwrap();
        let plan_id = created.plan.id.clone();
        let (a_id, b_id) = (created.tasks[0].id.clone(), created.tasks[1].id.clone());
        let run_id = with_write_tx(&mut conn, |tx| {
            crate::repositories::runs::Runs::insert(
                tx,
                &crate::repositories::runs::NewRun {
                    id: None,
                    project_id: created.plan.project_id.clone(),
                    plan_id: plan_id.clone(),
                    started_at: None,
                },
            )
            .map(|r| r.id)
        })
        .unwrap();
        (conn, run_id, a_id, b_id)
    }

    #[test]
    fn claim_for_run_is_idempotent_and_scoped_to_unassigned_pending_tasks() {
        let (mut conn, run_id, a_id, b_id) = run_with_dependency_dag();
        let plan_id = plan_of(&conn, &a_id);
        let claimed =
            with_write_tx(&mut conn, |tx| Tasks::claim_for_run(tx, &plan_id, &run_id)).unwrap();
        assert_eq!(claimed, 2);
        let listed = Tasks::list_for_run(&conn, &run_id).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().all(|t| t.status == "PENDING"));

        // Replaying claims nothing; already-assigned tasks are untouched.
        let again =
            with_write_tx(&mut conn, |tx| Tasks::claim_for_run(tx, &plan_id, &run_id)).unwrap();
        assert_eq!(again, 0);

        // A task moved out of PENDING is not claimable either.
        with_write_tx(&mut conn, |tx| Tasks::update_status(tx, &b_id, "COMPLETED")).unwrap();
        let after =
            with_write_tx(&mut conn, |tx| Tasks::claim_for_run(tx, &plan_id, &run_id)).unwrap();
        assert_eq!(after, 0);
    }

    fn plan_of(conn: &Connection, task_id: &str) -> String {
        conn.query_row(
            "SELECT plan_id FROM tasks WHERE id = ?1",
            params![task_id],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn dependency_rows_expose_the_condition_column() {
        let (conn, _run_id, a_id, b_id) = run_with_dependency_dag();
        let deps = Tasks::dependencies_of(&conn, &b_id).unwrap();
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].depends_on_task_id, a_id);
        assert_eq!(deps[0].condition, "completed-or-skipped");

        let dependents = Tasks::dependents_of(&conn, &a_id).unwrap();
        assert_eq!(dependents.len(), 1);
        assert_eq!(dependents[0].task_id, b_id);
        assert!(Tasks::dependencies_of(&conn, &a_id).unwrap().is_empty());
    }

    #[test]
    fn skip_reason_round_trips_without_touching_status() {
        let (mut conn, task) = task_in_db();
        let updated = with_write_tx(&mut conn, |tx| {
            Tasks::set_skip_reason(tx, &task.id, "covered by another run")
        })
        .unwrap();
        assert_eq!(
            updated.skip_reason.as_deref(),
            Some("covered by another run")
        );
        assert_eq!(updated.status, "PENDING");

        let err = with_write_tx(&mut conn, |tx| {
            Tasks::set_skip_reason(tx, "ghost", "x").map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }
}
