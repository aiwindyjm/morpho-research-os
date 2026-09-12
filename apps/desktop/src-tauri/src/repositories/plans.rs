//! Plan/section/task repository with atomic draft creation.
//!
//! A plan draft inserts the plan, its sections, its tasks, and the task
//! dependencies in one transaction. Duplicate idempotency keys or missing
//! dependencies abort the whole draft. Cycle detection is owned by the task
//! DAG work (RES-02); the schema only rejects self-dependencies.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct NewPlan {
    pub project_id: String,
    pub research_config_id: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanRecord {
    pub id: String,
    pub project_id: String,
    pub research_config_id: String,
    pub title: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SectionRecord {
    pub id: String,
    pub plan_id: String,
    pub title: String,
    pub order_index: i64,
    pub summary: String,
    pub created_at: i64,
}

/// A task to create inside a plan draft. `section_index` links the task to a
/// section by its index in `PlanDraft::sections`; `depends_on` lists
/// idempotency keys of other tasks in the same draft.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NewTask {
    pub title: String,
    pub task_type: String,
    pub idempotency_key: String,
    pub section_index: Option<i64>,
    pub depends_on: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskRecord {
    pub id: String,
    pub plan_id: String,
    pub section_id: Option<String>,
    pub run_id: Option<String>,
    pub title: String,
    pub task_type: String,
    pub status: String,
    pub idempotency_key: String,
    /// JSON task parameters / checkpoint state for resumable execution.
    pub checkpoint: Option<String>,
    pub retry_count: i64,
    pub max_retries: i64,
    pub cache_ref: Option<String>,
    pub result_ref: Option<String>,
    pub error_ref: Option<String>,
    /// Why the task was explicitly skipped (migration 002).
    pub skip_reason: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Everything needed to create a plan atomically.
#[derive(Debug, Clone, PartialEq)]
pub struct PlanDraft {
    pub plan: NewPlan,
    pub sections: Vec<(String, i64, String)>, // (title, order_index, summary)
    pub tasks: Vec<NewTask>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CreatedPlan {
    pub plan: PlanRecord,
    pub sections: Vec<SectionRecord>,
    pub tasks: Vec<TaskRecord>,
}

/// Task states allowed by the schema CHECK; which transitions between them
/// are legal is decided by [`crate::orchestrator`] (PRD §7).
pub const TASK_STATES: [&str; 10] = [
    "PENDING",
    "PLANNING",
    "RUNNING",
    "PAUSED",
    "VALIDATING",
    "NEEDS_REVIEW",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "SKIPPED",
];

/// Plan statuses allowed by the schema CHECK (`draft` -> `approved` /
/// `rejected`, with `superseded` for later plan generations). Whether a
/// specific transition is legal is the plan-review flow's decision, not this
/// repository's.
pub const PLAN_STATES: [&str; 4] = ["draft", "approved", "rejected", "superseded"];

pub struct Plans;

impl Plans {
    pub fn insert_draft(tx: &Transaction<'_>, draft: &PlanDraft) -> Result<CreatedPlan, CoreError> {
        let now = now_unix_ms();
        let plan = PlanRecord {
            id: new_id(),
            project_id: draft.plan.project_id.clone(),
            research_config_id: draft.plan.research_config_id.clone(),
            title: draft.plan.title.clone(),
            status: "draft".into(),
            created_at: now,
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO plans (id, project_id, research_config_id, title, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![
                plan.id,
                plan.project_id,
                plan.research_config_id,
                plan.title,
                plan.status,
                now
            ],
        )
        .map_err(CoreError::from)?;

        let mut sections = Vec::with_capacity(draft.sections.len());
        for (title, order_index, summary) in &draft.sections {
            let section = SectionRecord {
                id: new_id(),
                plan_id: plan.id.clone(),
                title: title.clone(),
                order_index: *order_index,
                summary: summary.clone(),
                created_at: now,
            };
            tx.execute(
                "INSERT INTO sections (id, plan_id, title, order_index, summary, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    section.id,
                    section.plan_id,
                    section.title,
                    section.order_index,
                    section.summary,
                    section.created_at
                ],
            )
            .map_err(CoreError::from)?;
            sections.push(section);
        }

        let mut tasks = Vec::with_capacity(draft.tasks.len());
        let mut key_to_id = std::collections::HashMap::new();
        for new_task in &draft.tasks {
            let section_id = new_task
                .section_index
                .and_then(|idx| sections.get(idx as usize))
                .map(|s| s.id.clone());
            let task = TaskRecord {
                id: new_id(),
                plan_id: plan.id.clone(),
                section_id,
                run_id: None,
                title: new_task.title.clone(),
                task_type: new_task.task_type.clone(),
                status: "PENDING".into(),
                idempotency_key: new_task.idempotency_key.clone(),
                checkpoint: None,
                retry_count: 0,
                max_retries: 3,
                cache_ref: None,
                result_ref: None,
                error_ref: None,
                skip_reason: None,
                created_at: now,
                updated_at: now,
            };
            tx.execute(
                "INSERT INTO tasks (id, plan_id, section_id, run_id, title, task_type, status,
                                    idempotency_key, retry_count, max_retries, created_at, updated_at)
                 VALUES (?1,?2,?3,NULL,?4,?5,?6,?7,?8,?9,?10,?10)",
                params![
                    task.id,
                    task.plan_id,
                    task.section_id,
                    task.title,
                    task.task_type,
                    task.status,
                    task.idempotency_key,
                    task.retry_count,
                    task.max_retries,
                    now
                ],
            )
            .map_err(CoreError::from)?;
            key_to_id.insert(task.idempotency_key.clone(), task.id.clone());
            tasks.push(task);
        }

        for new_task in &draft.tasks {
            let task_id = key_to_id
                .get(&new_task.idempotency_key)
                .expect("task inserted above");
            for dep_key in &new_task.depends_on {
                let depends_on_id = key_to_id.get(dep_key).ok_or_else(|| {
                    CoreError::database(format!(
                        "task dependency references unknown idempotency key '{dep_key}'"
                    ))
                })?;
                tx.execute(
                    "INSERT INTO task_dependencies (task_id, depends_on_task_id, created_at)
                     VALUES (?1, ?2, ?3)",
                    params![task_id, depends_on_id, now],
                )
                .map_err(CoreError::from)?;
            }
        }

        Ok(CreatedPlan {
            plan,
            sections,
            tasks,
        })
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<PlanRecord>, CoreError> {
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, research_config_id, title, status, created_at, updated_at
                 FROM plans WHERE id = ?1",
            )
            .map_err(CoreError::from)?;
        let mut rows = stmt.query(params![id]).map_err(CoreError::from)?;
        match rows.next().map_err(CoreError::from)? {
            Some(row) => Ok(Some(map_plan(row)?)),
            None => Ok(None),
        }
    }

    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<PlanRecord>, CoreError> {
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, research_config_id, title, status, created_at, updated_at
                 FROM plans WHERE project_id = ?1 ORDER BY created_at, id",
            )
            .map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_plan)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    /// Updates a plan status (the plan-review decision: `approved`,
    /// `rejected`, or `superseded`). The caller owns transition legality;
    /// unknown statuses or ids surface as structured errors.
    pub fn update_status(
        tx: &Transaction<'_>,
        id: &str,
        status: &str,
    ) -> Result<PlanRecord, CoreError> {
        if !PLAN_STATES.contains(&status) {
            return Err(CoreError::database(format!(
                "unknown plan status '{status}'"
            )));
        }
        let changed = tx
            .execute(
                "UPDATE plans SET status = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, status, now_unix_ms()],
            )
            .map_err(CoreError::from)?;
        if changed == 0 {
            return Err(CoreError::database(format!("plan '{id}' not found")));
        }
        let sql = "SELECT id, project_id, research_config_id, title, status, created_at, updated_at
             FROM plans WHERE id = ?1";
        tx.query_row(sql, params![id], map_plan)
            .map_err(CoreError::from)
    }

    pub fn tasks_for_plan(conn: &Connection, plan_id: &str) -> Result<Vec<TaskRecord>, CoreError> {
        let sql = task_select("WHERE plan_id = ?1 ORDER BY created_at, id");
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![plan_id], map_task)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }
}

fn task_select(suffix: &str) -> String {
    format!(
        "SELECT id, plan_id, section_id, run_id, title, task_type, status, idempotency_key,
                checkpoint, retry_count, max_retries, cache_ref, result_ref, error_ref,
                skip_reason, created_at, updated_at
         FROM tasks {suffix}"
    )
}

fn map_plan(row: &Row<'_>) -> rusqlite::Result<PlanRecord> {
    Ok(PlanRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        research_config_id: row.get(2)?,
        title: row.get(3)?,
        status: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
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
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::with_write_tx;

    fn setup() -> (Connection, String, String) {
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
                    domain: "d".into(),
                    topic: "t".into(),
                    ..Default::default()
                },
            )
            .map(|c| c.id)
        })
        .unwrap();
        (conn, project_id, config_id)
    }

    fn sample_draft(project_id: &str, config_id: &str) -> PlanDraft {
        PlanDraft {
            plan: NewPlan {
                project_id: project_id.into(),
                research_config_id: config_id.into(),
                title: "LLM scaling survey".into(),
            },
            sections: vec![
                ("Foundations".into(), 0, "core concepts".into()),
                ("Experiments".into(), 1, String::new()),
            ],
            tasks: vec![
                NewTask {
                    title: "search foundations".into(),
                    task_type: "search".into(),
                    idempotency_key: "plan-1-search-foundations".into(),
                    section_index: Some(0),
                    depends_on: vec![],
                },
                NewTask {
                    title: "extract experiments".into(),
                    task_type: "extraction".into(),
                    idempotency_key: "plan-1-extract-experiments".into(),
                    section_index: Some(1),
                    depends_on: vec!["plan-1-search-foundations".into()],
                },
            ],
        }
    }

    #[test]
    fn draft_is_created_atomically_with_dependencies() {
        let (mut conn, project_id, config_id) = setup();
        let created = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(tx, &sample_draft(&project_id, &config_id))
        })
        .unwrap();

        assert_eq!(created.sections.len(), 2);
        assert_eq!(created.tasks.len(), 2);
        assert_eq!(created.tasks[0].status, "PENDING");
        for task in &created.tasks {
            assert!(task.checkpoint.is_none());
            assert!(task.cache_ref.is_none());
            assert!(task.result_ref.is_none());
            assert!(task.error_ref.is_none());
            assert!(task.skip_reason.is_none());
        }
        assert_eq!(
            created.tasks[1].section_id,
            Some(created.sections[1].id.clone())
        );

        let deps: i64 = conn
            .query_row("SELECT COUNT(*) FROM task_dependencies", [], |r| r.get(0))
            .unwrap();
        assert_eq!(deps, 1);

        let stored = Plans::get(&conn, &created.plan.id).unwrap().unwrap();
        assert_eq!(stored.title, "LLM scaling survey");
        assert_eq!(
            Plans::tasks_for_plan(&conn, &created.plan.id)
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn duplicate_idempotency_key_rejects_whole_draft() {
        let (mut conn, project_id, config_id) = setup();
        with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(tx, &sample_draft(&project_id, &config_id))
        })
        .unwrap();

        let err = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(tx, &sample_draft(&project_id, &config_id)).map(|_| ())
        })
        .unwrap_err();
        assert!(
            crate::repositories::is_unique_violation(&err, "idempotency_key"),
            "{err:?}"
        );

        // Nothing from the second draft survived.
        let plans: i64 = conn
            .query_row("SELECT COUNT(*) FROM plans", [], |r| r.get(0))
            .unwrap();
        assert_eq!(plans, 1);
        let tasks: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(tasks, 2);
    }

    #[test]
    fn unknown_dependency_key_rejects_draft() {
        let (mut conn, project_id, config_id) = setup();
        let mut draft = sample_draft(&project_id, &config_id);
        draft.tasks[0].depends_on = vec!["no-such-key".into()];
        let err =
            with_write_tx(&mut conn, |tx| Plans::insert_draft(tx, &draft).map(|_| ())).unwrap_err();
        assert!(err.developer_detail.contains("unknown idempotency key"));
    }

    #[test]
    fn list_for_project_and_update_status_work() {
        let (mut conn, project_id, config_id) = setup();
        let created = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(tx, &sample_draft(&project_id, &config_id))
        })
        .unwrap();

        let listed = Plans::list_for_project(&conn, &project_id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, created.plan.id);
        assert_eq!(listed[0].status, "draft");

        let approved = with_write_tx(&mut conn, |tx| {
            Plans::update_status(tx, &created.plan.id, "approved")
        })
        .unwrap();
        assert_eq!(approved.status, "approved");
        assert_eq!(
            Plans::get(&conn, &created.plan.id).unwrap().unwrap().status,
            "approved"
        );

        let err = with_write_tx(&mut conn, |tx| {
            Plans::update_status(tx, &created.plan.id, "teleported").map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("unknown plan status"));

        let err = with_write_tx(&mut conn, |tx| {
            Plans::update_status(tx, "ghost", "approved").map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }
}
