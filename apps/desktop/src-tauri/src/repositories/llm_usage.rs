//! LLM usage repository: per-call token and cost accounting.
//!
//! Usage rows hang off a task; run- and project-level views join through
//! `tasks` (run) and `tasks -> plans` (project), because the table itself
//! carries only `task_id`. `provider`/`model`/`endpoint` are configuration
//! strings, not enums (see the schema comment); no secrets are ever stored
//! here, only counters and an estimate.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct NewLlmUsage {
    /// Supply an explicit id to make replays idempotent by primary key;
    /// `None` generates a fresh UUIDv7.
    pub id: Option<String>,
    pub task_id: String,
    pub provider: String,
    pub model: String,
    pub endpoint: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub duration_ms: i64,
    pub estimated_cost: f64,
    pub cache_hit: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LlmUsageRecord {
    pub id: String,
    pub task_id: String,
    pub provider: String,
    pub model: String,
    pub endpoint: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub duration_ms: i64,
    pub estimated_cost: f64,
    pub cache_hit: bool,
    pub created_at: i64,
}

/// Aggregated usage over a set of calls.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct UsageSums {
    pub calls: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub estimated_cost: f64,
}

pub struct LlmUsage;

const COLS: &str = "id, task_id, provider, model, endpoint, input_tokens, output_tokens, \
                    duration_ms, estimated_cost, cache_hit, created_at";

/// Same column list, prefixed for queries that join `tasks`/`plans` (which
/// also carry `id`/`created_at`).
const UCOLS: &str = "u.id, u.task_id, u.provider, u.model, u.endpoint, u.input_tokens, \
                     u.output_tokens, u.duration_ms, u.estimated_cost, u.cache_hit, \
                     u.created_at";

impl LlmUsage {
    pub fn insert(tx: &Transaction<'_>, new: &NewLlmUsage) -> Result<LlmUsageRecord, CoreError> {
        let now = now_unix_ms();
        let record = LlmUsageRecord {
            id: new.id.clone().unwrap_or_else(new_id),
            task_id: new.task_id.clone(),
            provider: new.provider.clone(),
            model: new.model.clone(),
            endpoint: new.endpoint.clone(),
            input_tokens: new.input_tokens,
            output_tokens: new.output_tokens,
            duration_ms: new.duration_ms,
            estimated_cost: new.estimated_cost,
            cache_hit: new.cache_hit,
            created_at: now,
        };
        tx.execute(
            "INSERT INTO llm_usage (id, task_id, provider, model, endpoint, input_tokens,
                                     output_tokens, duration_ms, estimated_cost, cache_hit,
                                     created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                record.id,
                record.task_id,
                record.provider,
                record.model,
                record.endpoint,
                record.input_tokens,
                record.output_tokens,
                record.duration_ms,
                record.estimated_cost,
                record.cache_hit,
                record.created_at
            ],
        )
        .map_err(CoreError::from)?;
        Ok(record)
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<LlmUsageRecord>, CoreError> {
        let sql = format!("SELECT {COLS} FROM llm_usage WHERE id = ?1");
        match conn.query_row(&sql, params![id], map_usage) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    pub fn list_for_task(
        conn: &Connection,
        task_id: &str,
    ) -> Result<Vec<LlmUsageRecord>, CoreError> {
        let sql =
            format!("SELECT {COLS} FROM llm_usage WHERE task_id = ?1 ORDER BY created_at, id");
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![task_id], map_usage)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    /// Usage for every task assigned to a run (`tasks.run_id`).
    pub fn list_for_run(conn: &Connection, run_id: &str) -> Result<Vec<LlmUsageRecord>, CoreError> {
        let sql = format!(
            "SELECT {UCOLS} FROM llm_usage u JOIN tasks t ON t.id = u.task_id
             WHERE t.run_id = ?1 ORDER BY u.created_at, u.id"
        );
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![run_id], map_usage)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    /// Usage for every task of every plan in a project
    /// (`tasks -> plans.project_id`).
    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<LlmUsageRecord>, CoreError> {
        let sql = format!(
            "SELECT {UCOLS} FROM llm_usage u
             JOIN tasks t ON t.id = u.task_id
             JOIN plans p ON p.id = t.plan_id
             WHERE p.project_id = ?1 ORDER BY u.created_at, u.id"
        );
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_usage)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    /// Token/cost sums for a run (empty runs sum to zero).
    pub fn sums_for_run(conn: &Connection, run_id: &str) -> Result<UsageSums, CoreError> {
        let mut stmt = conn
            .prepare(
                "SELECT COUNT(*), COALESCE(SUM(u.input_tokens), 0),
                        COALESCE(SUM(u.output_tokens), 0), COALESCE(SUM(u.estimated_cost), 0.0)
                 FROM llm_usage u JOIN tasks t ON t.id = u.task_id WHERE t.run_id = ?1",
            )
            .map_err(CoreError::from)?;
        stmt.query_row(params![run_id], map_sums)
            .map_err(CoreError::from)
    }

    /// Token/cost sums for a project (projects without usage sum to zero).
    pub fn sums_for_project(conn: &Connection, project_id: &str) -> Result<UsageSums, CoreError> {
        let mut stmt = conn
            .prepare(
                "SELECT COUNT(*), COALESCE(SUM(u.input_tokens), 0),
                        COALESCE(SUM(u.output_tokens), 0), COALESCE(SUM(u.estimated_cost), 0.0)
                 FROM llm_usage u
                 JOIN tasks t ON t.id = u.task_id
                 JOIN plans p ON p.id = t.plan_id
                 WHERE p.project_id = ?1",
            )
            .map_err(CoreError::from)?;
        stmt.query_row(params![project_id], map_sums)
            .map_err(CoreError::from)
    }
}

fn map_usage(row: &Row<'_>) -> rusqlite::Result<LlmUsageRecord> {
    Ok(LlmUsageRecord {
        id: row.get(0)?,
        task_id: row.get(1)?,
        provider: row.get(2)?,
        model: row.get(3)?,
        endpoint: row.get(4)?,
        input_tokens: row.get(5)?,
        output_tokens: row.get(6)?,
        duration_ms: row.get(7)?,
        estimated_cost: row.get(8)?,
        cache_hit: row.get::<_, i64>(9)? != 0,
        created_at: row.get(10)?,
    })
}

fn map_sums(row: &Row<'_>) -> rusqlite::Result<UsageSums> {
    Ok(UsageSums {
        calls: row.get(0)?,
        input_tokens: row.get(1)?,
        output_tokens: row.get(2)?,
        estimated_cost: row.get(3)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::configs::{NewResearchConfig, ResearchConfigs};
    use crate::repositories::plans::{NewPlan, NewTask, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::runs::{NewRun, Runs};
    use crate::repositories::with_write_tx;

    /// Creates a project with one config, one plan holding one task per
    /// caller-supplied idempotency key, and one run; returns
    /// `(conn, project_id, run_id, task_ids)`.
    fn project_with_tasks(task_keys: &[&str]) -> (Connection, String, String, Vec<String>) {
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
        let created = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.clone(),
                        research_config_id: config_id,
                        title: "T".into(),
                    },
                    sections: vec![],
                    tasks: task_keys
                        .iter()
                        .map(|key| NewTask {
                            title: format!("task {key}"),
                            task_type: "search".into(),
                            idempotency_key: (*key).into(),
                            section_index: None,
                            depends_on: vec![],
                        })
                        .collect(),
                },
            )
        })
        .unwrap();
        let task_ids: Vec<String> = created.tasks.iter().map(|t| t.id.clone()).collect();
        let run_id = with_write_tx(&mut conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id: project_id.clone(),
                    plan_id: created.plan.id,
                    started_at: None,
                },
            )
            .map(|r| r.id)
        })
        .unwrap();
        (conn, project_id, run_id, task_ids)
    }

    fn usage(task_id: &str, input: i64, output: i64, cost: f64) -> NewLlmUsage {
        NewLlmUsage {
            id: None,
            task_id: task_id.into(),
            provider: "builtin".into(),
            model: "research-small".into(),
            endpoint: "/chat/completions".into(),
            input_tokens: input,
            output_tokens: output,
            duration_ms: 1_200,
            estimated_cost: cost,
            cache_hit: false,
        }
    }

    #[test]
    fn insert_persists_and_round_trips() {
        let (mut conn, _project_id, _run_id, task_ids) = project_with_tasks(&["k-1"]);
        let created = with_write_tx(&mut conn, |tx| {
            let mut new = usage(&task_ids[0], 100, 50, 0.5);
            new.cache_hit = true;
            LlmUsage::insert(tx, &new)
        })
        .unwrap();
        assert!(created.cache_hit);

        let stored = LlmUsage::get(&conn, &created.id).unwrap().unwrap();
        assert_eq!(stored, created);
        assert_eq!(
            LlmUsage::list_for_task(&conn, &task_ids[0]).unwrap().len(),
            1
        );
        assert!(LlmUsage::get(&conn, "nope").unwrap().is_none());
    }

    #[test]
    fn run_and_project_views_are_scoped() {
        let (mut conn, project_id, run_id, task_ids) = project_with_tasks(&["k-1", "k-2"]);
        // Assign only the first task to the run; the second stays unassigned.
        with_write_tx(&mut conn, |tx| {
            tx.execute(
                "UPDATE tasks SET run_id = ?1 WHERE id = ?2",
                params![run_id, task_ids[0]],
            )
            .map_err(CoreError::from)
        })
        .unwrap();

        with_write_tx(&mut conn, |tx| {
            LlmUsage::insert(tx, &usage(&task_ids[0], 100, 50, 1.0))?;
            LlmUsage::insert(tx, &usage(&task_ids[1], 20, 10, 0.25))
        })
        .unwrap();

        // Run view sees only the assigned task's call.
        assert_eq!(LlmUsage::list_for_run(&conn, &run_id).unwrap().len(), 1);
        // Project view sees both tasks' calls (same project, two tasks).
        assert_eq!(
            LlmUsage::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            2
        );

        // A different run sees nothing.
        let (conn2, _p2, run2, _t2) = project_with_tasks(&["other"]);
        assert_eq!(LlmUsage::list_for_run(&conn2, &run2).unwrap().len(), 0);
        let empty_sums = LlmUsage::sums_for_run(&conn2, &run2).unwrap();
        assert_eq!(
            empty_sums,
            UsageSums {
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                estimated_cost: 0.0
            }
        );
    }

    #[test]
    fn sums_aggregate_tokens_and_cost() {
        let (mut conn, project_id, run_id, task_ids) = project_with_tasks(&["k-1"]);
        with_write_tx(&mut conn, |tx| {
            tx.execute(
                "UPDATE tasks SET run_id = ?1 WHERE id = ?2",
                params![run_id, task_ids[0]],
            )
            .map_err(CoreError::from)?;
            LlmUsage::insert(tx, &usage(&task_ids[0], 100, 50, 1.5))?;
            LlmUsage::insert(tx, &usage(&task_ids[0], 10, 5, 0.5))
        })
        .unwrap();

        let sums = LlmUsage::sums_for_run(&conn, &run_id).unwrap();
        assert_eq!(sums.calls, 2);
        assert_eq!(sums.input_tokens, 110);
        assert_eq!(sums.output_tokens, 55);
        assert!((sums.estimated_cost - 2.0).abs() < 1e-9);

        let project_sums = LlmUsage::sums_for_project(&conn, &project_id).unwrap();
        assert_eq!(project_sums, sums, "the run covers every task here");
    }

    #[test]
    fn duplicate_id_maps_to_unique_violation() {
        let (mut conn, _project_id, _run_id, task_ids) = project_with_tasks(&["k-1"]);
        let mut fixed = usage(&task_ids[0], 1, 1, 0.0);
        fixed.id = Some("usage-fixed".into());
        with_write_tx(&mut conn, |tx| LlmUsage::insert(tx, &fixed)).unwrap();

        let err =
            with_write_tx(&mut conn, |tx| LlmUsage::insert(tx, &fixed).map(|_| ())).unwrap_err();
        assert!(
            crate::repositories::is_unique_violation(&err, "llm_usage.id"),
            "{err:?}"
        );
        assert_eq!(
            LlmUsage::list_for_task(&conn, &task_ids[0]).unwrap().len(),
            1
        );
    }

    #[test]
    fn missing_task_is_a_structured_foreign_key_error() {
        let (mut conn, _project_id, _run_id, _task_ids) = project_with_tasks(&["k-1"]);
        let err = with_write_tx(&mut conn, |tx| {
            LlmUsage::insert(tx, &usage("ghost-task", 1, 1, 0.0)).map(|_| ())
        })
        .unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::DatabaseError);
        assert!(err.developer_detail.contains("FOREIGN KEY"), "{err:?}");
    }
}
