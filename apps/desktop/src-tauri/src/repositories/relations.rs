//! Relation repository: typed, directed edges between knowledge nodes.
//!
//! Relations carry the graph structure used by the knowledge view
//! (`from_node_id` -> `to_node_id` with a `relation_type`). Inserts are
//! idempotent by primary key: re-supplying an existing id returns the stored
//! row instead of duplicating the edge. Self-loops are rejected up front
//! (the schema CHECK also enforces this) and confidence is validated against
//! the shared confidence list.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use crate::repositories::knowledge::CONFIDENCE_STATES;
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct NewRelation {
    /// Supply an explicit id to make replays idempotent by primary key;
    /// `None` generates a fresh UUIDv7.
    pub id: Option<String>,
    pub project_id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation_type: String,
    pub confidence: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RelationRecord {
    pub id: String,
    pub project_id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation_type: String,
    pub confidence: String,
    pub created_at: i64,
}

pub struct Relations;

const COLS: &str =
    "id, project_id, from_node_id, to_node_id, relation_type, confidence, created_at";

impl Relations {
    /// Inserts a relation, idempotent by primary key: when `NewRelation::id`
    /// names an existing row the existing record is returned unchanged
    /// (`false`) instead of failing or duplicating. Returns `true` for a
    /// newly created row.
    pub fn insert(
        tx: &Transaction<'_>,
        new: &NewRelation,
    ) -> Result<(RelationRecord, bool), CoreError> {
        if !CONFIDENCE_STATES.contains(&new.confidence.as_str()) {
            return Err(CoreError::database(format!(
                "unknown confidence '{}'",
                new.confidence
            )));
        }
        if new.from_node_id == new.to_node_id {
            return Err(CoreError::database(
                "relation endpoints must differ (self-loops are not allowed)",
            ));
        }
        if let Some(id) = &new.id {
            if let Some(existing) = Self::get(tx, id)? {
                return Ok((existing, false));
            }
        }
        let now = now_unix_ms();
        let record = RelationRecord {
            id: new.id.clone().unwrap_or_else(new_id),
            project_id: new.project_id.clone(),
            from_node_id: new.from_node_id.clone(),
            to_node_id: new.to_node_id.clone(),
            relation_type: new.relation_type.clone(),
            confidence: new.confidence.clone(),
            created_at: now,
        };
        tx.execute(
            "INSERT INTO relations (id, project_id, from_node_id, to_node_id, relation_type,
                                     confidence, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                record.id,
                record.project_id,
                record.from_node_id,
                record.to_node_id,
                record.relation_type,
                record.confidence,
                record.created_at
            ],
        )
        .map_err(CoreError::from)?;
        Ok((record, true))
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<RelationRecord>, CoreError> {
        let sql = format!("SELECT {COLS} FROM relations WHERE id = ?1");
        match conn.query_row(&sql, params![id], map_relation) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<RelationRecord>, CoreError> {
        let sql =
            format!("SELECT {COLS} FROM relations WHERE project_id = ?1 ORDER BY created_at, id");
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_relation)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }
}

fn map_relation(row: &Row<'_>) -> rusqlite::Result<RelationRecord> {
    Ok(RelationRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        from_node_id: row.get(2)?,
        to_node_id: row.get(3)?,
        relation_type: row.get(4)?,
        confidence: row.get(5)?,
        created_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};
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

    fn node(conn: &mut Connection, project_id: &str, slug: &str) -> String {
        with_write_tx(conn, |tx| {
            KnowledgeNodes::upsert_by_slug(
                tx,
                &NewKnowledgeNode {
                    id: None,
                    project_id: project_id.into(),
                    node_type: "Concept".into(),
                    title: slug.into(),
                    slug: slug.into(),
                    summary: String::new(),
                    confidence: "unverified".into(),
                    aliases: vec![],
                    tags: vec![],
                    source_ids: vec![],
                    claim_ids: vec![],
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap()
    }

    fn relation(project_id: &str, from: &str, to: &str) -> NewRelation {
        NewRelation {
            id: None,
            project_id: project_id.into(),
            from_node_id: from.into(),
            to_node_id: to.into(),
            relation_type: "derives_from".into(),
            confidence: "medium".into(),
        }
    }

    #[test]
    fn insert_persists_and_round_trips() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let from = node(&mut conn, &project_id, "transformer");
        let to = node(&mut conn, &project_id, "attention");

        let (created, is_new) = with_write_tx(&mut conn, |tx| {
            Relations::insert(tx, &relation(&project_id, &from, &to))
        })
        .unwrap();
        assert!(is_new);
        assert_eq!(created.from_node_id, from);
        assert_eq!(created.to_node_id, to);

        let stored = Relations::get(&conn, &created.id).unwrap().unwrap();
        assert_eq!(stored, created);
        assert_eq!(
            Relations::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
        assert!(Relations::get(&conn, "nope").unwrap().is_none());
    }

    #[test]
    fn listing_is_scoped_to_the_project() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);
        for pid in [&p1, &p2] {
            let from = node(&mut conn, pid, "a");
            let to = node(&mut conn, pid, "b");
            with_write_tx(&mut conn, |tx| {
                Relations::insert(tx, &relation(pid, &from, &to)).map(|_| ())
            })
            .unwrap();
        }
        assert_eq!(Relations::list_for_project(&conn, &p1).unwrap().len(), 1);
        assert_eq!(Relations::list_for_project(&conn, &p2).unwrap().len(), 1);
    }

    #[test]
    fn same_id_is_idempotent_and_collisions_stay_structured() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let from = node(&mut conn, &project_id, "a");
        let to = node(&mut conn, &project_id, "b");
        let mut fixed = relation(&project_id, &from, &to);
        fixed.id = Some("relation-fixed".into());

        let (first, is_new) = with_write_tx(&mut conn, |tx| Relations::insert(tx, &fixed)).unwrap();
        assert!(is_new);
        let (replayed, is_new) =
            with_write_tx(&mut conn, |tx| Relations::insert(tx, &fixed)).unwrap();
        assert!(!is_new);
        assert_eq!(replayed, first);
        assert_eq!(
            Relations::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );

        // Behind the idempotent fast path, the schema's PRIMARY KEY plus the
        // error mapping still make duplicate rows impossible.
        let err = with_write_tx(&mut conn, |tx| {
            tx.execute(
                "INSERT INTO relations (id, project_id, from_node_id, to_node_id, relation_type,
                                         confidence, created_at)
                 VALUES ('relation-fixed', ?1, ?2, ?3, 'derives_from', 'low', 1)",
                params![project_id, from, to],
            )
            .map_err(CoreError::from)
        })
        .unwrap_err();
        assert!(
            crate::repositories::is_unique_violation(&err, "relations.id"),
            "{err:?}"
        );
    }

    #[test]
    fn self_loops_and_unknown_confidence_are_rejected() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let from = node(&mut conn, &project_id, "a");

        let err = with_write_tx(&mut conn, |tx| {
            Relations::insert(tx, &relation(&project_id, &from, &from)).map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("self-loops"), "{err:?}");

        let to = node(&mut conn, &project_id, "b");
        let mut bad = relation(&project_id, &from, &to);
        bad.confidence = "certainly".into();
        let err =
            with_write_tx(&mut conn, |tx| Relations::insert(tx, &bad).map(|_| ())).unwrap_err();
        assert!(
            err.developer_detail.contains("unknown confidence"),
            "{err:?}"
        );
    }

    #[test]
    fn missing_endpoint_is_a_structured_foreign_key_error() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let to = node(&mut conn, &project_id, "b");
        let err = with_write_tx(&mut conn, |tx| {
            Relations::insert(tx, &relation(&project_id, "ghost-node", &to)).map(|_| ())
        })
        .unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::DatabaseError);
        assert!(err.developer_detail.contains("FOREIGN KEY"), "{err:?}");
    }
}
