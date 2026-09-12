//! Run event log repository (append-only).
//!
//! Events form the per-run history: `UNIQUE (run_id, sequence)` guarantees a
//! gapless-ish, strictly ordered stream per run. `append` allocates the next
//! sequence inside the caller's transaction, so concurrent appends under one
//! write transaction cannot race. Payloads are opaque JSON strings that were
//! redacted upstream (`crate::redaction`); this module only rejects payloads
//! that are not valid JSON so the column invariant holds.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct NewEvent {
    pub run_id: String,
    pub task_id: Option<String>,
    pub event_type: String,
    /// Redacted JSON object as a string; must parse as JSON.
    pub payload: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventRecord {
    pub id: String,
    pub run_id: String,
    pub task_id: Option<String>,
    pub sequence: i64,
    pub event_type: String,
    pub payload: String,
    pub created_at: i64,
}

pub struct Events;

const COLS: &str = "id, run_id, task_id, sequence, event_type, payload, created_at";

impl Events {
    /// Appends an event, allocating the next sequence for the run inside the
    /// same transaction (first event is sequence 1). A collision on
    /// `UNIQUE (run_id, sequence)` surfaces as a structured
    /// [`CoreError`](crate::error::CoreError).
    pub fn append(tx: &Transaction<'_>, new: &NewEvent) -> Result<EventRecord, CoreError> {
        let next: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM events WHERE run_id = ?1",
                params![new.run_id],
                |row| row.get(0),
            )
            .map_err(CoreError::from)?;
        Self::append_with_sequence(tx, new, next)
    }

    /// Low-level append with a caller-chosen sequence, for deterministic
    /// replays/imports. Callers normally use [`Events::append`].
    pub fn append_with_sequence(
        tx: &Transaction<'_>,
        new: &NewEvent,
        sequence: i64,
    ) -> Result<EventRecord, CoreError> {
        validate_payload(&new.payload)?;
        let record = EventRecord {
            id: new_id(),
            run_id: new.run_id.clone(),
            task_id: new.task_id.clone(),
            sequence,
            event_type: new.event_type.clone(),
            payload: new.payload.clone(),
            created_at: now_unix_ms(),
        };
        tx.execute(
            "INSERT INTO events (id, run_id, task_id, sequence, event_type, payload, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                record.id,
                record.run_id,
                record.task_id,
                record.sequence,
                record.event_type,
                record.payload,
                record.created_at
            ],
        )
        .map_err(CoreError::from)?;
        Ok(record)
    }

    /// Lists a run's events with `sequence > after_sequence` in sequence
    /// order, at most `limit` rows.
    pub fn list_after(
        conn: &Connection,
        run_id: &str,
        after_sequence: i64,
        limit: u32,
    ) -> Result<Vec<EventRecord>, CoreError> {
        let sql = format!(
            "SELECT {COLS} FROM events WHERE run_id = ?1 AND sequence > ?2
             ORDER BY sequence LIMIT ?3"
        );
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![run_id, after_sequence, limit], map_event)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    /// Highest allocated sequence for a run; `0` when the run has no events.
    pub fn latest_sequence(conn: &Connection, run_id: &str) -> Result<i64, CoreError> {
        conn.query_row(
            "SELECT COALESCE(MAX(sequence), 0) FROM events WHERE run_id = ?1",
            params![run_id],
            |row| row.get(0),
        )
        .map_err(CoreError::from)
    }
}

fn validate_payload(payload: &str) -> Result<(), CoreError> {
    serde_json::from_str::<serde_json::Value>(payload)
        .map(|_| ())
        .map_err(|e| CoreError::database(format!("event payload is not valid JSON: {e}")))
}

fn map_event(row: &Row<'_>) -> rusqlite::Result<EventRecord> {
    Ok(EventRecord {
        id: row.get(0)?,
        run_id: row.get(1)?,
        task_id: row.get(2)?,
        sequence: row.get(3)?,
        event_type: row.get(4)?,
        payload: row.get(5)?,
        created_at: row.get(6)?,
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

    /// Creates a migrated database with project -> config -> plan (one task)
    /// -> run; returns `(conn, run_id, task_id)`.
    fn run_with_task() -> (Connection, String, String) {
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
                    tasks: vec![NewTask {
                        title: "search".into(),
                        task_type: "search".into(),
                        idempotency_key: "k-1".into(),
                        section_index: None,
                        depends_on: vec![],
                    }],
                },
            )
        })
        .unwrap();
        let task_id = created.tasks[0].id.clone();
        let run_id = with_write_tx(&mut conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id,
                    plan_id: created.plan.id,
                    started_at: None,
                },
            )
            .map(|r| r.id)
        })
        .unwrap();
        (conn, run_id, task_id)
    }

    fn event(run_id: &str, task_id: Option<&str>, event_type: &str) -> NewEvent {
        NewEvent {
            run_id: run_id.into(),
            task_id: task_id.map(str::to_string),
            event_type: event_type.into(),
            payload: "{}".into(),
        }
    }

    #[test]
    fn append_allocates_monotonic_sequences_across_transactions() {
        let (mut conn, run_id, task_id) = run_with_task();
        for expected in 1..=3 {
            let record = with_write_tx(&mut conn, |tx| {
                let mut new = event(&run_id, Some(&task_id), "task.started");
                new.payload = format!(r#"{{"attempt":{expected}}}"#);
                Events::append(tx, &new)
            })
            .unwrap();
            assert_eq!(record.sequence, expected);
            assert_eq!(record.task_id.as_deref(), Some(task_id.as_str()));
        }
        assert_eq!(Events::latest_sequence(&conn, &run_id).unwrap(), 3);

        let all = Events::list_after(&conn, &run_id, 0, 10).unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].payload, r#"{"attempt":1}"#);
        let tail = Events::list_after(&conn, &run_id, 1, 10).unwrap();
        assert_eq!(tail.len(), 2);
        assert_eq!(tail[0].sequence, 2);
    }

    #[test]
    fn appending_many_events_in_one_transaction_stays_monotonic() {
        let (mut conn, run_id, _task_id) = run_with_task();
        let records = with_write_tx(&mut conn, |tx| {
            let mut out = Vec::new();
            for i in 0..3 {
                out.push(Events::append(tx, &event(&run_id, None, "run.progress"))?);
                assert_eq!(Events::latest_sequence(tx, &run_id)?, i + 1);
            }
            Ok(out)
        })
        .unwrap();
        let sequences: Vec<i64> = records.iter().map(|r| r.sequence).collect();
        assert_eq!(sequences, vec![1, 2, 3]);
    }

    #[test]
    fn sequences_are_independent_per_run() {
        let (mut conn, run_id, _task_id) = run_with_task();
        let second_run = with_write_tx(&mut conn, |tx| {
            let (project_id, plan_id): (String, String) = tx
                .query_row(
                    "SELECT project_id, plan_id FROM runs WHERE id = ?1",
                    params![run_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(CoreError::from)?;
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id,
                    plan_id,
                    started_at: None,
                },
            )
            .map(|r| r.id)
        })
        .unwrap();

        with_write_tx(&mut conn, |tx| {
            Events::append(tx, &event(&run_id, None, "a")).map(|_| ())
        })
        .unwrap();
        let second = with_write_tx(&mut conn, |tx| {
            Events::append(tx, &event(&second_run, None, "b"))
        })
        .unwrap();
        assert_eq!(second.sequence, 1, "each run starts its own sequence");
        assert_eq!(
            Events::list_after(&conn, &second_run, 0, 10).unwrap().len(),
            1
        );
        assert_eq!(Events::list_after(&conn, &run_id, 0, 10).unwrap().len(), 1);
    }

    #[test]
    fn duplicate_sequence_maps_to_unique_violation() {
        let (mut conn, run_id, _task_id) = run_with_task();
        with_write_tx(&mut conn, |tx| {
            Events::append(tx, &event(&run_id, None, "a"))
        })
        .unwrap();

        let err = with_write_tx(&mut conn, |tx| {
            Events::append_with_sequence(tx, &event(&run_id, None, "b"), 1).map(|_| ())
        })
        .unwrap_err();
        assert!(
            crate::repositories::is_unique_violation(&err, "sequence"),
            "{err:?}"
        );
        assert_eq!(Events::latest_sequence(&conn, &run_id).unwrap(), 1);
    }

    #[test]
    fn list_after_respects_limit() {
        let (mut conn, run_id, _task_id) = run_with_task();
        with_write_tx(&mut conn, |tx| {
            for _ in 0..4 {
                Events::append(tx, &event(&run_id, None, "tick"))?;
            }
            Ok(())
        })
        .unwrap();
        assert_eq!(Events::list_after(&conn, &run_id, 0, 2).unwrap().len(), 2);
        assert_eq!(Events::list_after(&conn, &run_id, 0, 0).unwrap().len(), 0);
        assert_eq!(Events::list_after(&conn, &run_id, 99, 10).unwrap().len(), 0);
    }

    #[test]
    fn non_json_payload_is_rejected_before_insert() {
        let (mut conn, run_id, _task_id) = run_with_task();
        let mut bad = event(&run_id, None, "broken");
        bad.payload = "not json".into();
        let err = with_write_tx(&mut conn, |tx| Events::append(tx, &bad).map(|_| ())).unwrap_err();
        assert!(err.developer_detail.contains("not valid JSON"), "{err:?}");
        assert_eq!(Events::latest_sequence(&conn, &run_id).unwrap(), 0);
    }
}
