//! Task reads and status updates.
//!
//! The legal transition graph is owned by the task DAG work (RES-02); this
//! repository only persists and reads. Statuses are validated against the
//! schema's CHECK list before any write.

use crate::error::CoreError;
use crate::ids::now_unix_ms;
use crate::repositories::plans::TaskRecord;
use rusqlite::{params, Connection, Row, Transaction};

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
}

fn select_one(
    conn: &Connection,
    suffix: &str,
    params: impl rusqlite::Params,
) -> Result<Option<TaskRecord>, CoreError> {
    let sql = format!(
        "SELECT id, plan_id, section_id, run_id, title, task_type, status, idempotency_key,
                retry_count, max_retries, created_at, updated_at
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
                      retry_count, max_retries, created_at, updated_at
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
        retry_count: row.get(8)?,
        max_retries: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
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
}
