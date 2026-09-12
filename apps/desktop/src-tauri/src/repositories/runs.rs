//! Research run repository.
//!
//! A run is one execution of an approved plan. The legal transition graph is
//! owned by the orchestrator work; this repository only persists and reads.
//! Statuses are validated against the schema's CHECK list before any write,
//! and terminal statuses stamp `finished_at`.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

/// Run states allowed by the schema CHECK.
pub const RUN_STATES: [&str; 5] = ["running", "paused", "completed", "failed", "cancelled"];

/// Statuses after which a run does no further work.
const TERMINAL_STATES: [&str; 3] = ["completed", "failed", "cancelled"];

#[derive(Debug, Clone, PartialEq)]
pub struct NewRun {
    /// Supply an explicit id to make replays idempotent by primary key;
    /// `None` generates a fresh UUIDv7.
    pub id: Option<String>,
    pub project_id: String,
    pub plan_id: String,
    /// Wall-clock start; `None` uses the insert time.
    pub started_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunRecord {
    pub id: String,
    pub project_id: String,
    pub plan_id: String,
    pub status: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct Runs;

const COLS: &str =
    "id, project_id, plan_id, status, started_at, finished_at, created_at, updated_at";

impl Runs {
    pub fn insert(tx: &Transaction<'_>, new: &NewRun) -> Result<RunRecord, CoreError> {
        let now = now_unix_ms();
        let record = RunRecord {
            id: new.id.clone().unwrap_or_else(new_id),
            project_id: new.project_id.clone(),
            plan_id: new.plan_id.clone(),
            status: "running".into(),
            started_at: Some(new.started_at.unwrap_or(now)),
            finished_at: None,
            created_at: now,
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO runs (id, project_id, plan_id, status, started_at, finished_at,
                                created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?6)",
            params![
                record.id,
                record.project_id,
                record.plan_id,
                record.status,
                record.started_at,
                now
            ],
        )
        .map_err(CoreError::from)?;
        Ok(record)
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<RunRecord>, CoreError> {
        let sql = format!("SELECT {COLS} FROM runs WHERE id = ?1");
        match conn.query_row(&sql, params![id], map_run) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<RunRecord>, CoreError> {
        let sql = format!("SELECT {COLS} FROM runs WHERE project_id = ?1 ORDER BY created_at, id");
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_run)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    /// Updates a run status. Terminal statuses stamp `finished_at` with the
    /// update time; non-terminal updates leave `finished_at` untouched.
    /// Transition legality is the orchestrator's responsibility.
    pub fn update_status(
        tx: &Transaction<'_>,
        id: &str,
        status: &str,
    ) -> Result<RunRecord, CoreError> {
        if !RUN_STATES.contains(&status) {
            return Err(CoreError::database(format!(
                "unknown run status '{status}'"
            )));
        }
        let now = now_unix_ms();
        let changed = if TERMINAL_STATES.contains(&status) {
            tx.execute(
                "UPDATE runs SET status = ?2, finished_at = ?3, updated_at = ?3 WHERE id = ?1",
                params![id, status, now],
            )
            .map_err(CoreError::from)?
        } else {
            tx.execute(
                "UPDATE runs SET status = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, status, now],
            )
            .map_err(CoreError::from)?
        };
        if changed == 0 {
            return Err(CoreError::database(format!("run '{id}' not found")));
        }
        tx_immediate_get(tx, id)
    }
}

fn tx_immediate_get(tx: &Transaction<'_>, id: &str) -> Result<RunRecord, CoreError> {
    let sql = format!("SELECT {COLS} FROM runs WHERE id = ?1");
    tx.query_row(&sql, params![id], map_run)
        .map_err(CoreError::from)
}

fn map_run(row: &Row<'_>) -> rusqlite::Result<RunRecord> {
    Ok(RunRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        plan_id: row.get(2)?,
        status: row.get(3)?,
        started_at: row.get(4)?,
        finished_at: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::configs::{NewResearchConfig, ResearchConfigs};
    use crate::repositories::plans::{NewPlan, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::with_write_tx;

    /// Creates a project with one config and one plan; returns
    /// `(conn, project_id, plan_id)`.
    fn project_and_plan() -> (Connection, String, String) {
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
        let plan_id = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.clone(),
                        research_config_id: config_id,
                        title: "T".into(),
                    },
                    sections: vec![],
                    tasks: vec![],
                },
            )
            .map(|created| created.plan.id)
        })
        .unwrap();
        (conn, project_id, plan_id)
    }

    fn new_run(project_id: &str, plan_id: &str) -> NewRun {
        NewRun {
            id: None,
            project_id: project_id.into(),
            plan_id: plan_id.into(),
            started_at: None,
        }
    }

    #[test]
    fn insert_persists_and_round_trips() {
        let (mut conn, project_id, plan_id) = project_and_plan();
        let created = with_write_tx(&mut conn, |tx| {
            Runs::insert(tx, &new_run(&project_id, &plan_id))
        })
        .unwrap();
        assert_eq!(created.status, "running");
        assert!(created.started_at.is_some());
        assert!(created.finished_at.is_none());

        let stored = Runs::get(&conn, &created.id).unwrap().unwrap();
        assert_eq!(stored, created);
        assert_eq!(Runs::list_for_project(&conn, &project_id).unwrap().len(), 1);
        assert!(Runs::get(&conn, "nope").unwrap().is_none());
    }

    #[test]
    fn listing_is_scoped_to_the_project() {
        let (mut conn, p1, plan1) = project_and_plan();
        // Second project with its own plan and run.
        let p2 = with_write_tx(&mut conn, |tx| {
            Projects::insert(
                tx,
                &NewProject {
                    name: "Q".into(),
                    description: String::new(),
                },
            )
            .map(|p| p.id)
        })
        .unwrap();
        let config2 = with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: p2.clone(),
                    domain: "d".into(),
                    topic: "t".into(),
                    ..Default::default()
                },
            )
            .map(|c| c.id)
        })
        .unwrap();
        let plan2 = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: p2.clone(),
                        research_config_id: config2,
                        title: "T2".into(),
                    },
                    sections: vec![],
                    tasks: vec![],
                },
            )
            .map(|created| created.plan.id)
        })
        .unwrap();

        for (pid, plid) in [(&p1, &plan1), (&p2, &plan2)] {
            with_write_tx(&mut conn, |tx| {
                Runs::insert(tx, &new_run(pid, plid)).map(|_| ())
            })
            .unwrap();
        }
        assert_eq!(Runs::list_for_project(&conn, &p1).unwrap().len(), 1);
        assert_eq!(Runs::list_for_project(&conn, &p2).unwrap().len(), 1);
    }

    #[test]
    fn duplicate_id_maps_to_unique_violation() {
        let (mut conn, project_id, plan_id) = project_and_plan();
        let mut first = new_run(&project_id, &plan_id);
        first.id = Some("run-fixed".into());
        with_write_tx(&mut conn, |tx| Runs::insert(tx, &first)).unwrap();

        let err = with_write_tx(&mut conn, |tx| Runs::insert(tx, &first).map(|_| ())).unwrap_err();
        assert!(
            crate::repositories::is_unique_violation(&err, "runs.id"),
            "{err:?}"
        );
    }

    #[test]
    fn update_status_persists_and_stamps_finished_at() {
        let (mut conn, project_id, plan_id) = project_and_plan();
        let run = with_write_tx(&mut conn, |tx| {
            Runs::insert(tx, &new_run(&project_id, &plan_id))
        })
        .unwrap();

        let paused =
            with_write_tx(&mut conn, |tx| Runs::update_status(tx, &run.id, "paused")).unwrap();
        assert_eq!(paused.status, "paused");
        assert!(
            paused.finished_at.is_none(),
            "non-terminal status keeps finished_at unset"
        );

        let completed = with_write_tx(&mut conn, |tx| {
            Runs::update_status(tx, &run.id, "completed")
        })
        .unwrap();
        assert_eq!(completed.status, "completed");
        assert!(
            completed.finished_at.is_some(),
            "terminal status stamps finished_at"
        );

        let err = with_write_tx(&mut conn, |tx| {
            Runs::update_status(tx, &run.id, "teleported").map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("unknown run status"));

        let err = with_write_tx(&mut conn, |tx| {
            Runs::update_status(tx, "ghost", "running").map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }
}
