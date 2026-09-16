//! Source repository with canonical-URL deduplication.
//!
//! `(project_id, canonical_url)` is the stable dedup key (RES-03); re-ingesting
//! the same canonical URL updates metadata instead of inserting a duplicate.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct NewSource {
    pub project_id: String,
    pub url: String,
    pub canonical_url: String,
    pub title: String,
    pub source_type: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceRecord {
    pub id: String,
    pub project_id: String,
    pub url: String,
    pub canonical_url: String,
    pub title: String,
    pub source_type: String,
    pub status: String,
    pub retrieved_at: i64,
    /// Evaluated source quality (0.0-1.0); `None` until the evaluation
    /// pipeline (RES-04) scores the source.
    pub quality_score: Option<f64>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct Sources;

impl Sources {
    /// Inserts or refreshes a source by canonical URL within a project.
    /// Returns the record plus `true` when a new row was created.
    pub fn upsert_by_canonical_url(
        tx: &Transaction<'_>,
        new: &NewSource,
    ) -> Result<(SourceRecord, bool), CoreError> {
        if let Some(existing) =
            Self::get_by_canonical_url_in_tx(tx, &new.project_id, &new.canonical_url)?
        {
            let now = now_unix_ms();
            tx.execute(
                "UPDATE sources SET url = ?2, title = ?3, source_type = ?4, retrieved_at = ?5,
                                    updated_at = ?6
                 WHERE id = ?1",
                params![existing.id, new.url, new.title, new.source_type, now, now],
            )
            .map_err(CoreError::from)?;
            return Ok((
                SourceRecord {
                    url: new.url.clone(),
                    title: new.title.clone(),
                    source_type: new.source_type.clone(),
                    retrieved_at: now,
                    updated_at: now,
                    ..existing
                },
                false,
            ));
        }
        let now = now_unix_ms();
        let record = SourceRecord {
            id: new_id(),
            project_id: new.project_id.clone(),
            url: new.url.clone(),
            canonical_url: new.canonical_url.clone(),
            title: new.title.clone(),
            source_type: new.source_type.clone(),
            status: "discovered".into(),
            retrieved_at: now,
            quality_score: None,
            created_at: now,
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO sources (id, project_id, url, canonical_url, title, source_type, status,
                                  retrieved_at, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8,?8)",
            params![
                record.id,
                record.project_id,
                record.url,
                record.canonical_url,
                record.title,
                record.source_type,
                record.status,
                record.retrieved_at
            ],
        )
        .map_err(CoreError::from)?;
        Ok((record, true))
    }

    /// Persists a source-quality evaluation (RES-04): the overall score plus
    /// the explainable quality report as JSON notes, and the evaluated
    /// status. Unknown source ids are a structured error.
    pub fn apply_evaluation(
        tx: &Transaction<'_>,
        id: &str,
        score: f64,
        notes: &str,
    ) -> Result<(), CoreError> {
        if !(0.0..=1.0).contains(&score) {
            return Err(CoreError::database(format!(
                "quality score {score} outside 0.0..=1.0"
            )));
        }
        let changed = tx
            .execute(
                "UPDATE sources SET quality_score = ?2, quality_notes = ?3,
                                    status = 'evaluated', updated_at = ?4
                 WHERE id = ?1",
                params![id, score, notes, now_unix_ms()],
            )
            .map_err(CoreError::from)?;
        if changed == 0 {
            return Err(CoreError::database(format!("source '{id}' not found")));
        }
        Ok(())
    }

    pub fn get_by_canonical_url(
        conn: &Connection,
        project_id: &str,
        canonical_url: &str,
    ) -> Result<Option<SourceRecord>, CoreError> {
        select_one(
            conn,
            "WHERE project_id = ?1 AND canonical_url = ?2",
            params![project_id, canonical_url],
        )
    }

    fn get_by_canonical_url_in_tx(
        tx: &Transaction<'_>,
        project_id: &str,
        canonical_url: &str,
    ) -> Result<Option<SourceRecord>, CoreError> {
        let sql = "SELECT id, project_id, url, canonical_url, title, source_type, status,
                          retrieved_at, quality_score, created_at, updated_at
                   FROM sources WHERE project_id = ?1 AND canonical_url = ?2";
        match tx.query_row(sql, params![project_id, canonical_url], map_source) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<SourceRecord>, CoreError> {
        let sql = "SELECT id, project_id, url, canonical_url, title, source_type, status,
                          retrieved_at, quality_score, created_at, updated_at
                   FROM sources WHERE project_id = ?1 ORDER BY created_at, id";
        let mut stmt = conn.prepare(sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_source)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }
}

/// Cached source-content rows (`source_contents`): one fetchable payload per
/// source, idempotent by primary key so re-ingesting a run's results never
/// duplicates content.
pub struct SourceContents;

impl SourceContents {
    pub fn upsert(
        tx: &Transaction<'_>,
        id: &str,
        source_id: &str,
        content_hash: &str,
        format: &str,
        byte_size: i64,
        extracted_at: i64,
    ) -> Result<(), CoreError> {
        tx.execute(
            "INSERT INTO source_contents (id, source_id, content_hash, format, cache_path,
                                           byte_size, extracted_at, created_at)
             VALUES (?1, ?2, ?3, ?4, '', ?5, ?6, ?6)
             ON CONFLICT (id) DO UPDATE SET
                 content_hash = excluded.content_hash,
                 format = excluded.format,
                 byte_size = excluded.byte_size,
                 extracted_at = excluded.extracted_at",
            params![id, source_id, content_hash, format, byte_size, extracted_at],
        )
        .map_err(CoreError::from)?;
        Ok(())
    }
}

fn select_one(
    conn: &Connection,
    suffix: &str,
    params: impl rusqlite::Params,
) -> Result<Option<SourceRecord>, CoreError> {
    let sql = format!(
        "SELECT id, project_id, url, canonical_url, title, source_type, status,
                retrieved_at, quality_score, created_at, updated_at
         FROM sources {suffix}"
    );
    let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
    let mut rows = stmt.query(params).map_err(CoreError::from)?;
    match rows.next().map_err(CoreError::from)? {
        Some(row) => Ok(Some(map_source(row)?)),
        None => Ok(None),
    }
}

fn map_source(row: &Row<'_>) -> rusqlite::Result<SourceRecord> {
    Ok(SourceRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        url: row.get(2)?,
        canonical_url: row.get(3)?,
        title: row.get(4)?,
        source_type: row.get(5)?,
        status: row.get(6)?,
        retrieved_at: row.get(7)?,
        quality_score: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
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

    fn new_source(project_id: &str, canonical: &str, title: &str) -> NewSource {
        NewSource {
            project_id: project_id.into(),
            url: format!("https://example.com/{canonical}"),
            canonical_url: canonical.into(),
            title: title.into(),
            source_type: "web".into(),
        }
    }

    #[test]
    fn same_canonical_url_deduplicates_per_project() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);

        let (first, created) = with_write_tx(&mut conn, |tx| {
            Sources::upsert_by_canonical_url(tx, &new_source(&project_id, "a", "First"))
        })
        .unwrap();
        assert!(created);

        let (second, created) = with_write_tx(&mut conn, |tx| {
            Sources::upsert_by_canonical_url(tx, &new_source(&project_id, "a", "Updated"))
        })
        .unwrap();
        assert!(!created);
        assert_eq!(second.id, first.id);
        assert_eq!(second.title, "Updated");

        assert_eq!(
            Sources::list_for_project(&conn, &project_id).unwrap().len(),
            1
        );
    }

    #[test]
    fn same_url_in_different_projects_is_isolated() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);

        for pid in [&p1, &p2] {
            with_write_tx(&mut conn, |tx| {
                Sources::upsert_by_canonical_url(tx, &new_source(pid, "shared", "T")).map(|_| ())
            })
            .unwrap();
        }
        assert_eq!(Sources::list_for_project(&conn, &p1).unwrap().len(), 1);
        assert_eq!(Sources::list_for_project(&conn, &p2).unwrap().len(), 1);
        assert!(Sources::get_by_canonical_url(&conn, &p1, "shared")
            .unwrap()
            .is_some());
    }

    #[test]
    fn quality_score_defaults_to_none_and_round_trips() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let (created, _) = with_write_tx(&mut conn, |tx| {
            Sources::upsert_by_canonical_url(tx, &new_source(&project_id, "q", "Q"))
        })
        .unwrap();
        assert_eq!(created.quality_score, None);

        // The evaluation pipeline writes the score directly; reads surface it.
        with_write_tx(&mut conn, |tx| {
            tx.execute(
                "UPDATE sources SET quality_score = 0.9 WHERE id = ?1",
                params![created.id],
            )
            .map_err(CoreError::from)
        })
        .unwrap();
        let stored = Sources::get_by_canonical_url(&conn, &project_id, "q")
            .unwrap()
            .unwrap();
        assert_eq!(stored.quality_score, Some(0.9));
    }
}
