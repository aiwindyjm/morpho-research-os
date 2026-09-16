//! Knowledge node repository with per-project slug identity.
//!
//! Node ids and slugs are stable identities for the vault (RES-07): the same
//! slug upserts instead of duplicating, preserving the original id and
//! provenance lists.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

pub const NODE_TYPES: [&str; 14] = [
    "Concept",
    "Person",
    "Organization",
    "Company",
    "Paper",
    "Book",
    "Experiment",
    "Event",
    "Technology",
    "Product",
    "Application",
    "Policy",
    "Dataset",
    "Controversy",
];

pub const CONFIDENCE_STATES: [&str; 6] = [
    "confirmed",
    "high",
    "medium",
    "low",
    "unverified",
    "conflicting",
];

#[derive(Debug, Clone, PartialEq)]
pub struct NewKnowledgeNode {
    /// Supply an explicit id to keep an external identity stable across
    /// ingests (worker node ids, ADR-024); `None` generates a fresh UUIDv7.
    pub id: Option<String>,
    pub project_id: String,
    pub node_type: String,
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub confidence: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub source_ids: Vec<String>,
    pub claim_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KnowledgeNodeRecord {
    pub id: String,
    pub project_id: String,
    pub node_type: String,
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub status: String,
    pub confidence: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub source_ids: Vec<String>,
    pub claim_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct KnowledgeNodes;

impl KnowledgeNodes {
    /// Inserts or refreshes a node by `(project_id, slug)`. Returns the
    /// record plus `true` when a new node was created; an upsert keeps the
    /// original id (stable node identity) and merges id lists.
    pub fn upsert_by_slug(
        tx: &Transaction<'_>,
        new: &NewKnowledgeNode,
    ) -> Result<(KnowledgeNodeRecord, bool), CoreError> {
        Self::validate(new)?;
        if let Some(existing) = Self::get_by_slug_in_tx(tx, &new.project_id, &new.slug)? {
            let merged_sources = merge_unique(&existing.source_ids, &new.source_ids);
            let merged_claims = merge_unique(&existing.claim_ids, &new.claim_ids);
            let merged_aliases = merge_unique(&existing.aliases, &new.aliases);
            let merged_tags = merge_unique(&existing.tags, &new.tags);
            let now = now_unix_ms();
            tx.execute(
                "UPDATE knowledge_nodes SET title = ?2, summary = ?3, confidence = ?4,
                    aliases = ?5, tags = ?6, source_ids = ?7, claim_ids = ?8, updated_at = ?9
                 WHERE id = ?1",
                params![
                    existing.id,
                    new.title,
                    new.summary,
                    new.confidence,
                    serde_json::to_string(&merged_aliases).map_err(|e| CoreError::database(
                        format!("serialize aliases failed: {e}")
                    ))?,
                    serde_json::to_string(&merged_tags)
                        .map_err(|e| CoreError::database(format!("serialize tags failed: {e}")))?,
                    serde_json::to_string(&merged_sources).map_err(|e| CoreError::database(
                        format!("serialize source_ids failed: {e}")
                    ))?,
                    serde_json::to_string(&merged_claims).map_err(|e| CoreError::database(
                        format!("serialize claim_ids failed: {e}")
                    ))?,
                    now
                ],
            )
            .map_err(CoreError::from)?;
            return Ok((
                KnowledgeNodeRecord {
                    title: new.title.clone(),
                    summary: new.summary.clone(),
                    confidence: new.confidence.clone(),
                    aliases: merged_aliases,
                    tags: merged_tags,
                    source_ids: merged_sources,
                    claim_ids: merged_claims,
                    updated_at: now,
                    ..existing
                },
                false,
            ));
        }

        let now = now_unix_ms();
        let record = KnowledgeNodeRecord {
            id: new.id.clone().unwrap_or_else(new_id),
            project_id: new.project_id.clone(),
            node_type: new.node_type.clone(),
            title: new.title.clone(),
            slug: new.slug.clone(),
            summary: new.summary.clone(),
            status: "draft".into(),
            confidence: new.confidence.clone(),
            aliases: new.aliases.clone(),
            tags: new.tags.clone(),
            source_ids: new.source_ids.clone(),
            claim_ids: new.claim_ids.clone(),
            created_at: now,
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO knowledge_nodes (id, project_id, node_type, title, slug, summary, status,
                confidence, aliases, tags, source_ids, claim_ids, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)",
            params![
                record.id,
                record.project_id,
                record.node_type,
                record.title,
                record.slug,
                record.summary,
                record.status,
                record.confidence,
                json(&record.aliases)?,
                json(&record.tags)?,
                json(&record.source_ids)?,
                json(&record.claim_ids)?,
                now
            ],
        )
        .map_err(CoreError::from)?;
        Ok((record, true))
    }

    fn validate(new: &NewKnowledgeNode) -> Result<(), CoreError> {
        if !NODE_TYPES.contains(&new.node_type.as_str()) {
            return Err(CoreError::database(format!(
                "unknown node type '{}'",
                new.node_type
            )));
        }
        if !CONFIDENCE_STATES.contains(&new.confidence.as_str()) {
            return Err(CoreError::database(format!(
                "unknown confidence '{}'",
                new.confidence
            )));
        }
        Ok(())
    }

    pub fn get_by_slug(
        conn: &Connection,
        project_id: &str,
        slug: &str,
    ) -> Result<Option<KnowledgeNodeRecord>, CoreError> {
        select(
            conn,
            "WHERE project_id = ?1 AND slug = ?2",
            params![project_id, slug],
        )
        .map(|mut v| v.pop())
    }

    fn get_by_slug_in_tx(
        tx: &Transaction<'_>,
        project_id: &str,
        slug: &str,
    ) -> Result<Option<KnowledgeNodeRecord>, CoreError> {
        let sql = node_select("WHERE project_id = ?1 AND slug = ?2");
        match tx.query_row(&sql, params![project_id, slug], map_node) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<KnowledgeNodeRecord>, CoreError> {
        select(
            conn,
            "WHERE project_id = ?1 ORDER BY created_at, id",
            params![project_id],
        )
    }
}

fn node_select(suffix: &str) -> String {
    format!(
        "SELECT id, project_id, node_type, title, slug, summary, status, confidence, aliases,
                tags, source_ids, claim_ids, created_at, updated_at
         FROM knowledge_nodes {suffix}"
    )
}

fn select(
    conn: &Connection,
    suffix: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<KnowledgeNodeRecord>, CoreError> {
    let mut stmt = conn
        .prepare(&node_select(suffix))
        .map_err(CoreError::from)?;
    let rows = stmt
        .query_map(params, map_node)
        .map_err(CoreError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(CoreError::from)?;
    Ok(rows)
}

fn map_node(row: &Row<'_>) -> rusqlite::Result<KnowledgeNodeRecord> {
    Ok(KnowledgeNodeRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        node_type: row.get(2)?,
        title: row.get(3)?,
        slug: row.get(4)?,
        summary: row.get(5)?,
        status: row.get(6)?,
        confidence: row.get(7)?,
        aliases: parse_array(row.get(8)?)?,
        tags: parse_array(row.get(9)?)?,
        source_ids: parse_array(row.get(10)?)?,
        claim_ids: parse_array(row.get(11)?)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn json(list: &[String]) -> Result<String, CoreError> {
    serde_json::to_string(list)
        .map_err(|e| CoreError::database(format!("serialize list failed: {e}")))
}

fn parse_array(raw: String) -> rusqlite::Result<Vec<String>> {
    serde_json::from_str(&raw).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })
}

fn merge_unique(existing: &[String], incoming: &[String]) -> Vec<String> {
    let mut merged = existing.to_vec();
    for item in incoming {
        if !merged.contains(item) {
            merged.push(item.clone());
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
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

    fn node(project_id: &str, slug: &str) -> NewKnowledgeNode {
        NewKnowledgeNode {
            id: None,
            project_id: project_id.into(),
            node_type: "Concept".into(),
            title: "Transformer".into(),
            slug: slug.into(),
            summary: "attention-based architecture".into(),
            confidence: "high".into(),
            aliases: vec![],
            tags: vec!["dl".into()],
            source_ids: vec!["s1".into()],
            claim_ids: vec![],
        }
    }

    #[test]
    fn upsert_by_slug_keeps_stable_id_and_merges_provenance() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);

        let (first, created) = with_write_tx(&mut conn, |tx| {
            KnowledgeNodes::upsert_by_slug(tx, &node(&project_id, "transformer"))
        })
        .unwrap();
        assert!(created);

        let mut refreshed = node(&project_id, "transformer");
        refreshed.source_ids = vec!["s2".into()];
        let (second, created) = with_write_tx(&mut conn, |tx| {
            KnowledgeNodes::upsert_by_slug(tx, &refreshed)
        })
        .unwrap();
        assert!(!created);
        assert_eq!(
            second.id, first.id,
            "node id must stay stable across upserts"
        );
        assert_eq!(second.source_ids, vec!["s1", "s2"]);

        assert_eq!(
            KnowledgeNodes::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn unknown_type_or_confidence_is_rejected() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let mut bad = node(&project_id, "x");
        bad.node_type = "Vibe".into();
        let err = with_write_tx(&mut conn, |tx| {
            KnowledgeNodes::upsert_by_slug(tx, &bad).map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("unknown node type"));

        let mut bad = node(&project_id, "y");
        bad.confidence = "certainly".into();
        let err = with_write_tx(&mut conn, |tx| {
            KnowledgeNodes::upsert_by_slug(tx, &bad).map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("unknown confidence"));
    }
}
