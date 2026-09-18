//! Claim repository plus the claim-evidence cross-links.
//!
//! Claims are subject-predicate-object statements extracted from sources
//! (important claims carry evidence metadata, DO_NOT_BREAK #7). Inserts are
//! idempotent by primary key: callers replaying an extraction re-supply the
//! same id and get the existing row back instead of a duplicate. Confidence
//! is validated against the schema's CHECK list before any write.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use crate::repositories::knowledge::CONFIDENCE_STATES;
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

/// Claim review-lifecycle statuses (ADR-016 / claim.v1.1): the worker's
/// `ClaimStatus` vocabulary, which the core persists verbatim.
pub const CLAIM_STATUS_STATES: [&str; 4] = ["draft", "needs_review", "confirmed", "superseded"];

#[derive(Debug, Clone, PartialEq)]
pub struct NewClaim {
    /// Supply an explicit id to make replays idempotent by primary key;
    /// `None` generates a fresh UUIDv7.
    pub id: Option<String>,
    pub project_id: String,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub scope: String,
    /// Review lifecycle on insert (ADR-016): the worker may already have
    /// validated a claim to `needs_review` in its FIRST record — the core
    /// must not flatten that back to `draft`.
    pub status: String,
    pub confidence: String,
    pub provenance: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClaimRecord {
    pub id: String,
    pub project_id: String,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub scope: String,
    pub status: String,
    pub confidence: String,
    pub provenance: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct Claims;

const COLS: &str =
    "id, project_id, subject, predicate, object_value, scope, status, confidence, provenance, \
     created_at, updated_at";

impl Claims {
    /// Validates a claim status against the review-lifecycle vocabulary.
    pub fn validate_status(status: &str) -> Result<(), CoreError> {
        if CLAIM_STATUS_STATES.contains(&status) {
            Ok(())
        } else {
            Err(CoreError::database(format!(
                "unknown claim status '{status}'"
            )))
        }
    }

    /// Inserts a claim, idempotent by primary key: when `NewClaim::id` names
    /// an existing row **of the same project** the existing record is
    /// returned unchanged (`false`) instead of failing or duplicating. An id
    /// that exists under a different project is a structured error — a
    /// worker id is only unique inside its project (review R1), so ingestion
    /// mints project-scoped ids and this check is the repository-side guard.
    /// Returns `true` for a newly created row. Status and confidence are
    /// validated against their vocabularies before any write.
    pub fn insert(tx: &Transaction<'_>, new: &NewClaim) -> Result<(ClaimRecord, bool), CoreError> {
        Self::validate_status(&new.status)?;
        if !CONFIDENCE_STATES.contains(&new.confidence.as_str()) {
            return Err(CoreError::database(format!(
                "unknown confidence '{}'",
                new.confidence
            )));
        }
        if let Some(id) = &new.id {
            if let Some(existing) = Self::get(tx, id)? {
                if existing.project_id != new.project_id {
                    return Err(CoreError::database(format!(
                        "claim '{id}' belongs to project '{}' and cannot be reused by project '{}'",
                        existing.project_id, new.project_id
                    )));
                }
                return Ok((existing, false));
            }
        }
        let now = now_unix_ms();
        let record = ClaimRecord {
            id: new.id.clone().unwrap_or_else(new_id),
            project_id: new.project_id.clone(),
            subject: new.subject.clone(),
            predicate: new.predicate.clone(),
            object_value: new.object_value.clone(),
            scope: new.scope.clone(),
            status: new.status.clone(),
            confidence: new.confidence.clone(),
            provenance: new.provenance.clone(),
            created_at: now,
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO claims (id, project_id, subject, predicate, object_value, scope, status,
                                  confidence, provenance, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)",
            params![
                record.id,
                record.project_id,
                record.subject,
                record.predicate,
                record.object_value,
                record.scope,
                record.status,
                record.confidence,
                record.provenance,
                now
            ],
        )
        .map_err(CoreError::from)?;
        Ok((record, true))
    }

    /// Updates a claim's review lifecycle status and confidence state
    /// (ADR-016: status is the review lifecycle, confidence the evidence
    /// strength) after verifying the claim belongs to `project_id` — a
    /// cross-project batch must never move another project's claim (review
    /// R1). Used by result ingestion when a later validated record supersedes
    /// the stored state.
    pub fn update_review_state(
        tx: &Transaction<'_>,
        id: &str,
        project_id: &str,
        status: &str,
        confidence: &str,
    ) -> Result<(), CoreError> {
        Self::validate_status(status)?;
        if !CONFIDENCE_STATES.contains(&confidence) {
            return Err(CoreError::database(format!(
                "unknown confidence '{confidence}'"
            )));
        }
        let stored_project: Option<String> = tx
            .query_row(
                "SELECT project_id FROM claims WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map(Some)
            .or_else(|err| match err {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other),
            })
            .map_err(CoreError::from)?;
        match stored_project {
            Some(owner) if owner == project_id => {}
            Some(owner) => {
                return Err(CoreError::database(format!(
                    "claim '{id}' belongs to project '{owner}' and cannot be updated by project \
                     '{project_id}'"
                )))
            }
            None => return Err(CoreError::database(format!("claim '{id}' not found"))),
        }
        tx.execute(
            "UPDATE claims SET status = ?2, confidence = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, status, confidence, now_unix_ms()],
        )
        .map_err(CoreError::from)?;
        Ok(())
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<ClaimRecord>, CoreError> {
        let sql = format!("SELECT {COLS} FROM claims WHERE id = ?1");
        match conn.query_row(&sql, params![id], map_claim) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<ClaimRecord>, CoreError> {
        let sql =
            format!("SELECT {COLS} FROM claims WHERE project_id = ?1 ORDER BY created_at, id");
        let mut stmt = conn.prepare(&sql).map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_claim)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }
}

/// Claim-evidence cross-links (N:N). Links are idempotent: relinking an
/// existing pair is a no-op, not an error. The evidence-side listing lives
/// with the evidence repository ([`crate::repositories::evidence::Evidence::list_for_claim`]).
pub struct ClaimEvidence;

impl ClaimEvidence {
    /// Links a claim to an evidence record. Returns `true` when the link was
    /// newly created, `false` when it already existed. Both endpoints must
    /// exist (the schema's foreign keys enforce this).
    pub fn link(
        tx: &Transaction<'_>,
        claim_id: &str,
        evidence_id: &str,
    ) -> Result<bool, CoreError> {
        let changed = tx
            .execute(
                "INSERT INTO claim_evidence (claim_id, evidence_id, created_at)
                 VALUES (?1, ?2, ?3) ON CONFLICT (claim_id, evidence_id) DO NOTHING",
                params![claim_id, evidence_id, now_unix_ms()],
            )
            .map_err(CoreError::from)?;
        Ok(changed == 1)
    }
}

fn map_claim(row: &Row<'_>) -> rusqlite::Result<ClaimRecord> {
    Ok(ClaimRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        subject: row.get(2)?,
        predicate: row.get(3)?,
        object_value: row.get(4)?,
        scope: row.get(5)?,
        status: row.get(6)?,
        confidence: row.get(7)?,
        provenance: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::evidence::{Evidence, NewEvidence};
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

    fn claim(project_id: &str, subject: &str) -> NewClaim {
        NewClaim {
            id: None,
            project_id: project_id.into(),
            subject: subject.into(),
            predicate: "uses".into(),
            object_value: "attention".into(),
            scope: String::new(),
            status: "draft".into(),
            confidence: "medium".into(),
            provenance: "run-1/task-2".into(),
        }
    }

    /// Inserts one source plus one supporting evidence record; returns the
    /// evidence id.
    fn evidence(conn: &mut Connection, project_id: &str) -> String {
        with_write_tx(conn, |tx| {
            let (source, _) = Sources::upsert_by_canonical_url(
                tx,
                &NewSource {
                    project_id: project_id.into(),
                    url: "https://example.com/a".into(),
                    canonical_url: "example.com/a".into(),
                    title: "A".into(),
                    source_type: "web".into(),
                },
            )?;
            Evidence::insert(
                tx,
                &NewEvidence {
                    id: None,
                    project_id: project_id.to_string(),
                    source_id: source.id,
                    quote: "transformers use attention".into(),
                    value: String::new(),
                    locator: "p. 2".into(),
                    locator_detail: String::new(),
                    retrieved_at: 1,
                    direction: "support".into(),
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap()
    }

    #[test]
    fn insert_persists_and_round_trips() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let (created, is_new) = with_write_tx(&mut conn, |tx| {
            Claims::insert(tx, &claim(&project_id, "Transformer"))
        })
        .unwrap();
        assert!(is_new);
        assert_eq!(created.status, "draft");

        let stored = Claims::get(&conn, &created.id).unwrap().unwrap();
        assert_eq!(stored, created);
        assert_eq!(
            Claims::list_for_project(&conn, &project_id).unwrap().len(),
            1
        );
        assert!(Claims::get(&conn, "nope").unwrap().is_none());
    }

    #[test]
    fn listing_is_scoped_to_the_project() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);
        for pid in [&p1, &p2] {
            with_write_tx(&mut conn, |tx| {
                Claims::insert(tx, &claim(pid, "S")).map(|_| ())
            })
            .unwrap();
        }
        assert_eq!(Claims::list_for_project(&conn, &p1).unwrap().len(), 1);
        assert_eq!(Claims::list_for_project(&conn, &p2).unwrap().len(), 1);
    }

    #[test]
    fn same_id_is_idempotent_and_collisions_stay_structured() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let mut fixed = claim(&project_id, "S");
        fixed.id = Some("claim-fixed".into());

        let (first, is_new) = with_write_tx(&mut conn, |tx| Claims::insert(tx, &fixed)).unwrap();
        assert!(is_new);
        let (replayed, is_new) = with_write_tx(&mut conn, |tx| Claims::insert(tx, &fixed)).unwrap();
        assert!(!is_new);
        assert_eq!(replayed, first);
        assert_eq!(
            Claims::list_for_project(&conn, &project_id).unwrap().len(),
            1
        );

        // Behind the idempotent fast path, the schema's PRIMARY KEY plus the
        // error mapping still make duplicate rows impossible (raw insert
        // simulates a lost race).
        let err = with_write_tx(&mut conn, |tx| {
            tx.execute(
                "INSERT INTO claims (id, project_id, subject, predicate, object_value, scope,
                                      status, confidence, provenance, created_at, updated_at)
                 VALUES ('claim-fixed', ?1, 's', 'p', '', '', 'draft', 'low', '', 1, 1)",
                params![project_id],
            )
            .map_err(CoreError::from)
        })
        .unwrap_err();
        assert!(
            crate::repositories::is_unique_violation(&err, "claims.id"),
            "{err:?}"
        );
    }

    #[test]
    fn unknown_confidence_is_rejected() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let mut bad = claim(&project_id, "S");
        bad.confidence = "certainly".into();
        let err = with_write_tx(&mut conn, |tx| Claims::insert(tx, &bad).map(|_| ())).unwrap_err();
        assert!(
            err.developer_detail.contains("unknown confidence"),
            "{err:?}"
        );
    }

    #[test]
    fn first_insert_keeps_a_validated_review_status() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let mut reviewed = claim(&project_id, "S");
        reviewed.id = Some("claim-reviewed".into());
        reviewed.status = "needs_review".into();
        reviewed.confidence = "conflicting".into();

        let (created, is_new) =
            with_write_tx(&mut conn, |tx| Claims::insert(tx, &reviewed)).unwrap();
        assert!(is_new);
        assert_eq!(created.status, "needs_review");
        assert_eq!(created.confidence, "conflicting");
        assert_eq!(
            Claims::get(&conn, "claim-reviewed")
                .unwrap()
                .unwrap()
                .status,
            "needs_review",
            "the FIRST ingestion must not flatten a validated review state to draft (review R7)"
        );
    }

    #[test]
    fn an_id_owned_by_another_project_is_a_structured_error() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);
        let mut shared = claim(&p1, "S");
        shared.id = Some("claim-shared".into());
        with_write_tx(&mut conn, |tx| Claims::insert(tx, &shared)).unwrap();

        let mut foreign = claim(&p2, "S");
        foreign.id = Some("claim-shared".into());
        let err =
            with_write_tx(&mut conn, |tx| Claims::insert(tx, &foreign).map(|_| ())).unwrap_err();
        assert!(
            err.developer_detail.contains("cannot be reused by project"),
            "{err:?}"
        );
        // The stored row is untouched.
        assert_eq!(
            Claims::get(&conn, "claim-shared")
                .unwrap()
                .unwrap()
                .project_id,
            p1
        );
    }

    #[test]
    fn review_state_updates_verify_project_ownership() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);
        let mut owned = claim(&p1, "S");
        owned.id = Some("claim-owned".into());
        with_write_tx(&mut conn, |tx| Claims::insert(tx, &owned)).unwrap();

        let err = with_write_tx(&mut conn, |tx| {
            Claims::update_review_state(tx, "claim-owned", &p2, "confirmed", "high").map(|_| ())
        })
        .unwrap_err();
        assert!(
            err.developer_detail
                .contains("cannot be updated by project"),
            "{err:?}"
        );
        assert_eq!(
            Claims::get(&conn, "claim-owned").unwrap().unwrap().status,
            "draft",
            "a foreign project's update changed nothing"
        );

        // Unknown statuses never reach the UPDATE.
        let err = with_write_tx(&mut conn, |tx| {
            Claims::update_review_state(tx, "claim-owned", &p1, "final", "high").map(|_| ())
        })
        .unwrap_err();
        assert!(err.developer_detail.contains("unknown claim status"));
    }

    #[test]
    fn evidence_links_are_idempotent_and_listed() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let claim_record = with_write_tx(&mut conn, |tx| {
            Claims::insert(tx, &claim(&project_id, "S")).map(|(record, _)| record)
        })
        .unwrap();
        let evidence_id = evidence(&mut conn, &project_id);

        assert!(with_write_tx(&mut conn, |tx| {
            ClaimEvidence::link(tx, &claim_record.id, &evidence_id)
        })
        .unwrap());
        assert!(
            !with_write_tx(&mut conn, |tx| {
                ClaimEvidence::link(tx, &claim_record.id, &evidence_id)
            })
            .unwrap(),
            "relinking an existing pair is a no-op"
        );

        let linked = Evidence::list_for_claim(&conn, &claim_record.id).unwrap();
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].id, evidence_id);

        // A claim without links lists no evidence.
        let other = with_write_tx(&mut conn, |tx| {
            Claims::insert(tx, &claim(&project_id, "T")).map(|(record, _)| record)
        })
        .unwrap();
        assert!(Evidence::list_for_claim(&conn, &other.id)
            .unwrap()
            .is_empty());
    }
}
