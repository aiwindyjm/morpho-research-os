//! Artifact repository: the index of generated vault files.
//!
//! `content_hash` records what this core last wrote to a path and `origin`
//! records who authored those bytes (`core` or `user`); together they power
//! the vault writer's user-modification protection (RES-07). This module
//! also adapts the repository to the vault's [`ArtifactIndex`] port so the
//! writer stays free of SQL.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use crate::repositories::with_write_tx;
use crate::vault::{ArtifactIndex, ArtifactState};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ArtifactRecord {
    pub id: String,
    pub project_id: String,
    pub node_id: Option<String>,
    pub path: String,
    pub content_hash: String,
    pub byte_size: i64,
    pub origin: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct Artifacts;

impl Artifacts {
    #[allow(clippy::too_many_arguments)]
    pub fn upsert_by_path(
        tx: &Transaction<'_>,
        project_id: &str,
        node_id: Option<&str>,
        path: &str,
        content_hash: &str,
        byte_size: i64,
        origin: &str,
    ) -> Result<ArtifactRecord, CoreError> {
        if !matches!(origin, "core" | "user") {
            return Err(CoreError::database(format!(
                "unknown artifact origin '{origin}'"
            )));
        }
        let now = now_unix_ms();
        if let Some(existing) = Self::get_by_path_in_tx(tx, project_id, path)? {
            tx.execute(
                "UPDATE artifacts SET node_id = ?2, content_hash = ?3, byte_size = ?4,
                                      origin = ?5, updated_at = ?6
                 WHERE id = ?1",
                params![existing.id, node_id, content_hash, byte_size, origin, now],
            )
            .map_err(CoreError::from)?;
            return Ok(ArtifactRecord {
                node_id: node_id.map(str::to_string),
                content_hash: content_hash.into(),
                byte_size,
                origin: origin.into(),
                updated_at: now,
                ..existing
            });
        }
        let record = ArtifactRecord {
            id: new_id(),
            project_id: project_id.into(),
            node_id: node_id.map(str::to_string),
            path: path.into(),
            content_hash: content_hash.into(),
            byte_size,
            origin: origin.into(),
            created_at: now,
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO artifacts (id, project_id, node_id, path, content_hash, byte_size,
                                    origin, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
            params![
                record.id,
                record.project_id,
                record.node_id,
                record.path,
                record.content_hash,
                record.byte_size,
                record.origin,
                now
            ],
        )
        .map_err(CoreError::from)?;
        Ok(record)
    }

    pub fn get_by_path(
        conn: &Connection,
        project_id: &str,
        path: &str,
    ) -> Result<Option<ArtifactRecord>, CoreError> {
        Self::query_row(conn, project_id, path)
    }

    fn get_by_path_in_tx(
        tx: &Transaction<'_>,
        project_id: &str,
        path: &str,
    ) -> Result<Option<ArtifactRecord>, CoreError> {
        Self::query_row(tx, project_id, path)
    }

    fn query_row(
        conn: &Connection,
        project_id: &str,
        path: &str,
    ) -> Result<Option<ArtifactRecord>, CoreError> {
        match conn.query_row(
            "SELECT id, project_id, node_id, path, content_hash, byte_size, origin,
                    created_at, updated_at
             FROM artifacts WHERE project_id = ?1 AND path = ?2",
            params![project_id, path],
            map_artifact,
        ) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }
}

fn map_artifact(row: &Row<'_>) -> rusqlite::Result<ArtifactRecord> {
    Ok(ArtifactRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        node_id: row.get(2)?,
        path: row.get(3)?,
        content_hash: row.get(4)?,
        byte_size: row.get(5)?,
        origin: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

/// Bridges the SQL artifact index to the vault writer's port. All writes go
/// through the repository inside explicit transactions.
pub struct DbArtifactIndex<'a> {
    conn: &'a mut Connection,
    project_id: String,
}

impl<'a> DbArtifactIndex<'a> {
    pub fn new(conn: &'a mut Connection, project_id: impl Into<String>) -> Self {
        Self {
            conn,
            project_id: project_id.into(),
        }
    }
}

impl ArtifactIndex for DbArtifactIndex<'_> {
    fn recorded(&self, path: &str) -> Result<Option<ArtifactState>, CoreError> {
        Ok(
            Artifacts::get_by_path(self.conn, &self.project_id, path)?.map(|record| {
                ArtifactState {
                    content_hash: record.content_hash,
                    user_authored: record.origin == "user",
                }
            }),
        )
    }

    fn record(
        &mut self,
        node_id: Option<&str>,
        path: &str,
        content_hash: &str,
        byte_size: u64,
        user_authored: bool,
    ) -> Result<(), CoreError> {
        let origin = if user_authored { "user" } else { "core" };
        let project_id = self.project_id.clone();
        with_write_tx(self.conn, |tx| {
            Artifacts::upsert_by_path(
                tx,
                &project_id,
                node_id,
                path,
                content_hash,
                byte_size as i64,
                origin,
            )
            .map(|_| ())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};
    use crate::repositories::projects::{NewProject, Projects};

    /// Creates a project plus a knowledge node and returns their ids.
    fn project_and_node(conn: &mut Connection) -> (String, String) {
        let project_id = with_write_tx(conn, |tx| {
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
        let node_id = with_write_tx(conn, |tx| {
            KnowledgeNodes::upsert_by_slug(
                tx,
                &NewKnowledgeNode {
                    id: None,
                    project_id: project_id.clone(),
                    node_type: "Concept".into(),
                    title: "T".into(),
                    slug: "t".into(),
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
        .unwrap();
        (project_id, node_id)
    }

    #[test]
    fn upsert_by_path_updates_existing_record() {
        let mut conn = migrated_memory_db().unwrap();
        let (project_id, node_id) = project_and_node(&mut conn);

        let first = with_write_tx(&mut conn, |tx| {
            Artifacts::upsert_by_path(
                tx,
                &project_id,
                Some(&node_id),
                "Concepts/a.md",
                "h1",
                10,
                "core",
            )
        })
        .unwrap();
        let second = with_write_tx(&mut conn, |tx| {
            Artifacts::upsert_by_path(
                tx,
                &project_id,
                Some(&node_id),
                "Concepts/a.md",
                "h2",
                12,
                "core",
            )
        })
        .unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(second.content_hash, "h2");

        let stored = Artifacts::get_by_path(&conn, &project_id, "Concepts/a.md")
            .unwrap()
            .unwrap();
        assert_eq!(stored.content_hash, "h2");
        assert_eq!(stored.byte_size, 12);
        assert_eq!(stored.origin, "core");
    }

    #[test]
    fn unknown_origin_is_rejected() {
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
        let err = with_write_tx(&mut conn, |tx| {
            Artifacts::upsert_by_path(tx, &project_id, None, "a.md", "h", 1, "alien").map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("unknown artifact origin"));
    }

    #[test]
    fn db_adapter_reports_user_authored_state() {
        let mut conn = migrated_memory_db().unwrap();
        let (project_id, node_id) = project_and_node(&mut conn);

        let mut adapter = DbArtifactIndex::new(&mut conn, project_id.clone());
        assert!(adapter.recorded("Concepts/a.md").unwrap().is_none());
        adapter
            .record(Some(&node_id), "Concepts/a.md", "h1", 10, false)
            .unwrap();
        let state = adapter.recorded("Concepts/a.md").unwrap().unwrap();
        assert_eq!(state.content_hash, "h1");
        assert!(!state.user_authored);

        adapter
            .record(Some(&node_id), "Concepts/a.md", "h2", 12, true)
            .unwrap();
        let state = adapter.recorded("Concepts/a.md").unwrap().unwrap();
        assert!(state.user_authored);
    }
}
