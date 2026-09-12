//! Evidence repository.
//!
//! Evidence rows are immutable quotes/values extracted from a source and
//! pointed at claims through the `claim_evidence` cross-links (claims
//! module). `direction` records whether the evidence supports or contradicts
//! the linked claim and is validated against the schema's CHECK list before
//! any write. Inserts are idempotent by primary key: re-supplying the same id
//! surfaces as a structured UNIQUE error instead of a duplicate row.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

/// Evidence directions allowed by the schema CHECK.
pub const DIRECTIONS: [&str; 2] = ["support", "contradict"];

#[derive(Debug, Clone, PartialEq)]
pub struct NewEvidence {
    /// Supply an explicit id to make replays idempotent by primary key;
    /// `None` generates a fresh UUIDv7.
    pub id: Option<String>,
    pub project_id: String,
    pub source_id: String,
    pub quote: String,
    pub value: String,
    pub locator: String,
    pub direction: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvidenceRecord {
    pub id: String,
    pub project_id: String,
    pub source_id: String,
    pub quote: String,
    pub value: String,
    pub locator: String,
    pub retrieved_at: i64,
    pub direction: String,
    pub created_at: i64,
}

pub struct Evidence;

const COLS: &str =
    "id, project_id, source_id, quote, value, locator, retrieved_at, direction, created_at";

impl Evidence {
    pub fn insert(
        tx: &Transaction<'_>,
        new: &NewEvidence,
    ) -> Result<(EvidenceRecord, bool), CoreError> {
        if !DIRECTIONS.contains(&new.direction.as_str()) {
            return Err(CoreError::database(format!(
                "unknown evidence direction '{}'",
                new.direction
            )));
        }
        // Idempotent by primary key: an existing id must not create a second
        // row, and the caller needs the existing record back.
        if let Some(id) = &new.id {
            if let Some(existing) = Self::get(tx, id)? {
                return Ok((existing, false));
            }
        }
        let now = now_unix_ms();
        let record = EvidenceRecord {
            id: new.id.clone().unwrap_or_else(new_id),
            project_id: new.project_id.clone(),
            source_id: new.source_id.clone(),
            quote: new.quote.clone(),
            value: new.value.clone(),
            locator: new.locator.clone(),
            retrieved_at: now,
            direction: new.direction.clone(),
            created_at: now,
        };
        tx.execute(
            "INSERT INTO evidence (id, project_id, source_id, quote, value, locator,
                                    retrieved_at, direction, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?7)",
            params![
                record.id,
                record.project_id,
                record.source_id,
                record.quote,
                record.value,
                record.locator,
                record.retrieved_at,
                record.direction
            ],
        )
        .map_err(CoreError::from)?;
        Ok((record, true))
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<EvidenceRecord>, CoreError> {
        let sql = format!("SELECT {COLS} FROM evidence WHERE id = ?1");
        match conn.query_row(&sql, params![id], map_evidence) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<EvidenceRecord>, CoreError> {
        let sql =
            format!("SELECT {COLS} FROM evidence WHERE project_id = ?1 ORDER BY created_at, id");
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_evidence)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    pub fn list_for_source(
        conn: &Connection,
        source_id: &str,
    ) -> Result<Vec<EvidenceRecord>, CoreError> {
        let sql =
            format!("SELECT {COLS} FROM evidence WHERE source_id = ?1 ORDER BY created_at, id");
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![source_id], map_evidence)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }

    /// Evidence records linked to a claim through `claim_evidence`, oldest
    /// first.
    pub fn list_for_claim(
        conn: &Connection,
        claim_id: &str,
    ) -> Result<Vec<EvidenceRecord>, CoreError> {
        let sql = format!(
            "SELECT {COLS} FROM evidence WHERE id IN
                (SELECT evidence_id FROM claim_evidence WHERE claim_id = ?1)
             ORDER BY created_at, id"
        );
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![claim_id], map_evidence)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }
}

fn map_evidence(row: &Row<'_>) -> rusqlite::Result<EvidenceRecord> {
    Ok(EvidenceRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        source_id: row.get(2)?,
        quote: row.get(3)?,
        value: row.get(4)?,
        locator: row.get(5)?,
        retrieved_at: row.get(6)?,
        direction: row.get(7)?,
        created_at: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::sources::{NewSource, Sources};
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

    fn source_id(conn: &mut Connection, project_id: &str, canonical: &str) -> String {
        with_write_tx(conn, |tx| {
            Sources::upsert_by_canonical_url(
                tx,
                &NewSource {
                    project_id: project_id.into(),
                    url: format!("https://example.com/{canonical}"),
                    canonical_url: canonical.into(),
                    title: "T".into(),
                    source_type: "web".into(),
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap()
    }

    fn evidence(project_id: &str, source_id: &str, quote: &str) -> NewEvidence {
        NewEvidence {
            id: None,
            project_id: project_id.into(),
            source_id: source_id.into(),
            quote: quote.into(),
            value: String::new(),
            locator: "p. 1".into(),
            direction: "support".into(),
        }
    }

    #[test]
    fn insert_persists_and_round_trips() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let source = source_id(&mut conn, &project_id, "a");

        let (created, is_new) = with_write_tx(&mut conn, |tx| {
            Evidence::insert(tx, &evidence(&project_id, &source, "supports the claim"))
        })
        .unwrap();
        assert!(is_new);
        assert_eq!(created.direction, "support");
        assert!(created.retrieved_at > 0);

        let stored = Evidence::get(&conn, &created.id).unwrap().unwrap();
        assert_eq!(stored, created);
        assert_eq!(
            Evidence::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(Evidence::list_for_source(&conn, &source).unwrap().len(), 1);
        assert!(Evidence::get(&conn, "nope").unwrap().is_none());
    }

    #[test]
    fn listing_is_scoped_to_the_project_and_source() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);
        let s1 = source_id(&mut conn, &p1, "a");
        let s2 = source_id(&mut conn, &p1, "b");
        for source in [&s1, &s2] {
            with_write_tx(&mut conn, |tx| {
                Evidence::insert(tx, &evidence(&p1, source, "q")).map(|_| ())
            })
            .unwrap();
        }
        with_write_tx(&mut conn, |tx| {
            // A source belongs to exactly one project, so p2's source carries
            // p2's evidence and p1 stays isolated.
            let (other_source, _) = Sources::upsert_by_canonical_url(
                tx,
                &NewSource {
                    project_id: p2.clone(),
                    url: "https://example.com/c".into(),
                    canonical_url: "c".into(),
                    title: "C".into(),
                    source_type: "web".into(),
                },
            )?;
            Evidence::insert(tx, &evidence(&p2, &other_source.id, "q2")).map(|_| ())
        })
        .unwrap();

        assert_eq!(Evidence::list_for_project(&conn, &p1).unwrap().len(), 2);
        assert_eq!(Evidence::list_for_project(&conn, &p2).unwrap().len(), 1);
        assert_eq!(Evidence::list_for_source(&conn, &s1).unwrap().len(), 1);
    }

    #[test]
    fn same_id_is_idempotent_without_a_second_row() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let source = source_id(&mut conn, &project_id, "a");

        let mut first = evidence(&project_id, &source, "q");
        first.id = Some("evidence-fixed".into());
        let (record, is_new) = with_write_tx(&mut conn, |tx| Evidence::insert(tx, &first)).unwrap();
        assert!(is_new);

        let (replayed, is_new) =
            with_write_tx(&mut conn, |tx| Evidence::insert(tx, &first)).unwrap();
        assert!(!is_new);
        assert_eq!(replayed, record);
        assert_eq!(
            Evidence::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn primary_key_collisions_map_to_unique_violation() {
        // The insert fast path is idempotent, so simulate a lost race with a
        // raw duplicate insert: the schema's PRIMARY KEY plus the error
        // mapping keep duplicate rows impossible.
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let source = source_id(&mut conn, &project_id, "a");
        let mut fixed = evidence(&project_id, &source, "q");
        fixed.id = Some("evidence-fixed".into());
        with_write_tx(&mut conn, |tx| Evidence::insert(tx, &fixed).map(|_| ())).unwrap();

        let err = with_write_tx(&mut conn, |tx| {
            tx.execute(
                "INSERT INTO evidence (id, project_id, source_id, quote, value, locator,
                                        retrieved_at, direction, created_at)
                 VALUES ('evidence-fixed', ?1, ?2, '', '', '', 1, 'support', 1)",
                params![project_id, source],
            )
            .map_err(CoreError::from)
        })
        .unwrap_err();
        assert!(
            crate::repositories::is_unique_violation(&err, "evidence.id"),
            "{err:?}"
        );
        assert_eq!(
            Evidence::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn unknown_direction_is_rejected() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let source = source_id(&mut conn, &project_id, "a");
        let mut bad = evidence(&project_id, &source, "q");
        bad.direction = "sideways".into();
        let err =
            with_write_tx(&mut conn, |tx| Evidence::insert(tx, &bad).map(|_| ())).unwrap_err();
        assert!(
            err.developer_detail.contains("unknown evidence direction"),
            "{err:?}"
        );
    }

    #[test]
    fn missing_source_is_a_structured_foreign_key_error() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let err = with_write_tx(&mut conn, |tx| {
            Evidence::insert(tx, &evidence(&project_id, "ghost-source", "q")).map(|_| ())
        })
        .unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::DatabaseError);
        assert!(err.developer_detail.contains("FOREIGN KEY"), "{err:?}");
    }
}
