//! Repository layer: typed, parameterized access to SQLite.
//!
//! Rules enforced here (docs/backend/AI_BACKEND_RULES.md):
//! * all SQL is static and every value is bound through `params!` — never
//!   string-composed;
//! * writes happen inside explicit transactions passed as `&Transaction`;
//!   repositories never commit or roll back on their own;
//! * every error surfaces as the unified [`CoreError`] model.

pub mod artifacts;
pub mod configs;
pub mod knowledge;
pub mod plans;
pub mod projects;
pub mod services;
pub mod sources;
pub mod tasks;

use crate::error::CoreError;
use rusqlite::{Connection, Transaction};

/// Runs a unit of work inside one explicit write transaction. The closure
/// receives the transaction; on `Ok` the transaction commits, on `Err` it
/// rolls back completely. This is the only place repositories' callers can
/// open a write transaction, keeping the transaction boundary visible and
/// testable.
pub fn with_write_tx<T>(
    conn: &mut Connection,
    f: impl FnOnce(&Transaction<'_>) -> Result<T, CoreError>,
) -> Result<T, CoreError> {
    let tx = conn.transaction().map_err(CoreError::from)?;
    match f(&tx) {
        Ok(value) => {
            tx.commit().map_err(CoreError::from)?;
            Ok(value)
        }
        Err(err) => {
            let _ = tx.rollback();
            Err(err)
        }
    }
}

/// True when the error is a SQLite UNIQUE constraint failure on `column`.
pub fn is_unique_violation(err: &CoreError, column: &str) -> bool {
    err.code == crate::error::ErrorCode::DatabaseError
        && err.developer_detail.contains("UNIQUE constraint failed")
        && err.developer_detail.contains(column)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transaction_commits_on_ok() {
        let mut conn = crate::db::migrated_memory_db().unwrap();
        let count = with_write_tx(&mut conn, |tx| {
            tx.execute(
                "INSERT INTO projects (id, name, description, status, created_at, updated_at)
                 VALUES ('p1', 'n', '', 'active', 1, 1)",
                [],
            )
            .map_err(CoreError::from)
        })
        .unwrap();
        assert_eq!(count, 1);
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn transaction_rolls_back_on_err() {
        let mut conn = crate::db::migrated_memory_db().unwrap();
        let result: Result<(), CoreError> = with_write_tx(&mut conn, |tx| {
            tx.execute(
                "INSERT INTO projects (id, name, description, status, created_at, updated_at)
                 VALUES ('p2', 'n', '', 'active', 1, 1)",
                [],
            )
            .map_err(CoreError::from)?;
            Err(CoreError::database("deliberate failure"))
        });
        assert!(result.is_err());
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "rolled-back insert must not persist");
    }

    #[test]
    fn foreign_key_violation_maps_to_structured_error() {
        let mut conn = crate::db::migrated_memory_db().unwrap();
        let err = with_write_tx(&mut conn, |tx| {
            crate::repositories::configs::ResearchConfigs::insert(
                tx,
                &crate::repositories::configs::NewResearchConfig {
                    project_id: "missing-project".into(),
                    domain: "d".into(),
                    topic: "t".into(),
                    purpose: "learning".into(),
                    depth: 2,
                    ..Default::default()
                },
            )
            .map(|_| ())
        })
        .unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::DatabaseError);
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("FOREIGN KEY"), "{err:?}");
    }
}
