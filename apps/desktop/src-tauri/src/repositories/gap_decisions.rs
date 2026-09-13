//! Gap-decision repository: persisted user decisions on gap proposals.
//!
//! A gap report (PRD §14) recomputes gaps from current coverage on every
//! read; the only durable part is the user's decision per dimension —
//! approved (with the created follow-up task) or dismissed. Decisions are
//! keyed by `(project_id, dimension)` because gap identity is derived, not
//! stored: the same under-covered dimension keeps the same gap id across
//! recomputations (see the projections module and ADR-020).

use crate::error::CoreError;
use crate::ids::now_unix_ms;
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

/// Decision states allowed by the schema CHECK. `pending_approval` is the
/// implicit default for dimensions without a row; stored rows are always the
/// result of an explicit user action (`approved` or `dismissed`).
pub const GAP_DECISION_STATUSES: [&str; 2] = ["approved", "dismissed"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GapDecisionRecord {
    pub project_id: String,
    pub dimension: String,
    pub status: String,
    /// The follow-up task created by an approval; `None` for dismissals.
    pub created_task_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct GapDecisions;

const COLS: &str = "project_id, dimension, status, created_task_id, created_at, updated_at";

impl GapDecisions {
    /// Reads the decision for one dimension of a project.
    pub fn get(
        conn: &Connection,
        project_id: &str,
        dimension: &str,
    ) -> Result<Option<GapDecisionRecord>, CoreError> {
        let sql =
            format!("SELECT {COLS} FROM gap_decisions WHERE project_id = ?1 AND dimension = ?2");
        match conn.query_row(&sql, params![project_id, dimension], map_decision) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    /// Inserts or overwrites the decision for one dimension. An approval
    /// carries the created task id; a dismissal clears it.
    pub fn upsert(
        tx: &Transaction<'_>,
        project_id: &str,
        dimension: &str,
        status: &str,
        created_task_id: Option<&str>,
    ) -> Result<GapDecisionRecord, CoreError> {
        if !GAP_DECISION_STATUSES.contains(&status) {
            return Err(CoreError::database(format!(
                "unknown gap decision status '{status}'"
            )));
        }
        let now = now_unix_ms();
        tx.execute(
            "INSERT INTO gap_decisions (project_id, dimension, status, created_task_id,
                                         created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)
             ON CONFLICT (project_id, dimension) DO UPDATE SET
                 status = excluded.status,
                 created_task_id = excluded.created_task_id,
                 updated_at = excluded.updated_at",
            params![project_id, dimension, status, created_task_id, now],
        )
        .map_err(CoreError::from)?;
        tx.query_row(
            &format!("SELECT {COLS} FROM gap_decisions WHERE project_id = ?1 AND dimension = ?2"),
            params![project_id, dimension],
            map_decision,
        )
        .map_err(CoreError::from)
    }

    /// Every decision recorded for a project.
    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<GapDecisionRecord>, CoreError> {
        let sql =
            format!("SELECT {COLS} FROM gap_decisions WHERE project_id = ?1 ORDER BY dimension");
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_decision)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }
}

fn map_decision(row: &Row<'_>) -> rusqlite::Result<GapDecisionRecord> {
    Ok(GapDecisionRecord {
        project_id: row.get(0)?,
        dimension: row.get(1)?,
        status: row.get(2)?,
        created_task_id: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::plans::{NewPlan, NewSection, NewTask, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::with_write_tx;

    fn project(conn: &mut Connection) -> String {
        with_write_tx(conn, |tx| {
            Projects::insert(
                tx,
                &NewProject {
                    name: "P".into(),
                    description: String::new(),
                },
            )
            .map(|p| p.id)
        })
        .unwrap()
    }

    /// A task to point an approval at (the FK must resolve).
    fn task(conn: &mut Connection, project_id: &str, key: &str) -> String {
        let config_id = with_write_tx(conn, |tx| {
            crate::repositories::configs::ResearchConfigs::insert(
                tx,
                &crate::repositories::configs::NewResearchConfig {
                    project_id: project_id.to_string(),
                    ..Default::default()
                },
            )
            .map(|c| c.id)
        })
        .unwrap();
        with_write_tx(conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.to_string(),
                        research_config_id: config_id,
                        title: "T".into(),
                        rationale: String::new(),
                    },
                    sections: vec![NewSection {
                        title: "S".into(),
                        order_index: 0,
                        summary: String::new(),
                        dimension: String::new(),
                        objectives: vec![],
                    }],
                    tasks: vec![NewTask {
                        title: "t".into(),
                        description: String::new(),
                        task_type: "search".into(),
                        idempotency_key: key.into(),
                        section_index: None,
                        depends_on: vec![],
                    }],
                },
            )
            .map(|created| created.tasks[0].id.clone())
        })
        .unwrap()
    }

    #[test]
    fn upsert_creates_then_overwrites_the_decision() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let task_id = task(&mut conn, &project_id, "gap-key");

        let approved = with_write_tx(&mut conn, |tx| {
            GapDecisions::upsert(tx, &project_id, "theory", "approved", Some(&task_id))
        })
        .unwrap();
        assert_eq!(approved.status, "approved");
        assert_eq!(approved.created_task_id.as_deref(), Some(task_id.as_str()));

        // Dismissing the same dimension replaces the decision and drops the
        // created-task pointer.
        let dismissed = with_write_tx(&mut conn, |tx| {
            GapDecisions::upsert(tx, &project_id, "theory", "dismissed", None)
        })
        .unwrap();
        assert_eq!(dismissed.status, "dismissed");
        assert!(dismissed.created_task_id.is_none());
        assert!(dismissed.updated_at >= approved.updated_at);

        // One row per (project, dimension), readable back.
        let stored = GapDecisions::get(&conn, &project_id, "theory")
            .unwrap()
            .unwrap();
        assert_eq!(stored, dismissed);
        assert!(GapDecisions::get(&conn, &project_id, "market")
            .unwrap()
            .is_none());
    }

    #[test]
    fn listing_is_scoped_to_the_project() {
        let mut conn = migrated_memory_db().unwrap();
        let first = project(&mut conn);
        let second = project(&mut conn);
        for (pid, dimension) in [(&first, "theory"), (&first, "market"), (&second, "theory")] {
            with_write_tx(&mut conn, |tx| {
                GapDecisions::upsert(tx, pid, dimension, "dismissed", None).map(|_| ())
            })
            .unwrap();
        }
        let listed = GapDecisions::list_for_project(&conn, &first).unwrap();
        assert_eq!(
            listed
                .iter()
                .map(|d| d.dimension.as_str())
                .collect::<Vec<_>>(),
            vec!["market", "theory"],
            "ordered by dimension"
        );
        assert_eq!(
            GapDecisions::list_for_project(&conn, &second)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn unknown_statuses_and_missing_tasks_are_structured_errors() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let err = with_write_tx(&mut conn, |tx| {
            GapDecisions::upsert(tx, &project_id, "theory", "maybe", None).map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("unknown gap decision status"));

        let err = with_write_tx(&mut conn, |tx| {
            GapDecisions::upsert(tx, &project_id, "theory", "approved", Some("ghost-task"))
                .map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("FOREIGN KEY"), "{err:?}");
    }
}
