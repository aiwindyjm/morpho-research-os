//! SQLite connection settings and the numbered migration runner.
//!
//! Schema plan: `packages/schemas/MIGRATIONS.md` (table set is fixed there);
//! durability rules from `docs/DATA_MODEL.md`. The runner is
//! failure-safe: each migration runs inside one transaction together with its
//! `schema_meta` row, so a failed migration leaves neither partial DDL nor a
//! bumped version.

use crate::error::{CoreError, ErrorCode};
use rusqlite::{Connection, Transaction};
use std::path::Path;

/// Highest schema version shipped in `migrations/`.
pub const LATEST_SCHEMA_VERSION: i64 = 1;

/// A numbered SQL migration. `sql` may contain multiple statements.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

/// The migrations embedded in this build. New migrations are new numbered
/// files plus one entry here; existing entries are immutable.
pub fn embedded_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../migrations/001_initial.sql"),
    }]
}

/// Opens a connection with the core's mandatory SQLite defaults:
/// foreign keys on, WAL journaling, and a busy timeout for contended writes.
pub fn open_connection(path: &Path) -> Result<Connection, CoreError> {
    let conn = Connection::open(path).map_err(CoreError::from)?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(CoreError::from)?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(CoreError::from)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(CoreError::from)?;
    conn.busy_timeout(std::time::Duration::from_millis(5_000))
        .map_err(CoreError::from)?;
    Ok(conn)
}

/// Opens an in-memory database with the same defaults (tests only).
pub fn open_in_memory() -> Result<Connection, CoreError> {
    let conn = Connection::open_in_memory().map_err(CoreError::from)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(CoreError::from)?;
    conn.busy_timeout(std::time::Duration::from_millis(5_000))
        .map_err(CoreError::from)?;
    Ok(conn)
}

/// Result of a migration run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationOutcome {
    /// Versions applied by this run, in order.
    pub applied: Vec<(i64, &'static str)>,
    /// Schema version after the run.
    pub current: i64,
}

/// Reads the current schema version. `0` when no migration has been applied
/// (the `schema_meta` table does not exist yet).
pub fn current_schema_version(conn: &Connection) -> Result<i64, CoreError> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            ["schema_meta"],
            |row| row.get(0),
        )
        .map_err(CoreError::from)?;
    if !exists {
        return Ok(0);
    }
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_meta",
        [],
        |row| row.get(0),
    )
    .map_err(CoreError::from)
}

/// Applies every pending migration in order. Re-running against an
/// up-to-date database is a no-op. A failing migration rolls back atomically
/// and leaves the version untouched.
///
/// Contract: the version-1 migration must create the `schema_meta` table
/// (as `001_initial.sql` does); later migrations only append.
pub fn migrate(
    conn: &mut Connection,
    migrations: &[Migration],
) -> Result<MigrationOutcome, CoreError> {
    let mut sorted: Vec<&Migration> = migrations.iter().collect();
    sorted.sort_by_key(|m| m.version);
    for pair in sorted.windows(2) {
        if pair[0].version == pair[1].version {
            return Err(CoreError::database(format!(
                "duplicate migration version {}",
                pair[0].version
            )));
        }
    }

    let mut applied = Vec::new();
    for migration in sorted {
        if migration.version <= current_schema_version(conn)? {
            continue;
        }
        if migration.version != current_schema_version(conn)? + 1 {
            return Err(CoreError::database(format!(
                "migration gap: next version is {} but current is {}",
                migration.version,
                current_schema_version(conn)?
            )));
        }
        apply_one(conn, migration)?;
        applied.push((migration.version, migration.name));
    }

    Ok(MigrationOutcome {
        applied,
        current: current_schema_version(conn)?,
    })
}

/// Applies a single migration inside one transaction together with its
/// `schema_meta` record, so failure can never leave DDL without a version
/// bump or vice versa.
fn apply_one(conn: &mut Connection, migration: &Migration) -> Result<(), CoreError> {
    let tx = conn.transaction().map_err(CoreError::from)?;
    match apply_in_tx(&tx, migration) {
        Ok(()) => tx.commit().map_err(|err| {
            CoreError::database(format!(
                "migration {} commit failed: {err}",
                migration.version
            ))
        }),
        Err(err) => {
            let _ = tx.rollback();
            Err(err)
        }
    }
}

fn apply_in_tx(tx: &Transaction<'_>, migration: &Migration) -> Result<(), CoreError> {
    let fail = |err: rusqlite::Error| {
        CoreError::new(
            ErrorCode::DatabaseError,
            "A local database operation failed.",
            format!(
                "migration {} ({}) failed: {err}",
                migration.version, migration.name
            ),
            false,
        )
    };
    tx.execute_batch(migration.sql).map_err(fail)?;
    let now_ms = crate::ids::now_unix_ms();
    tx.execute(
        "INSERT INTO schema_meta (version, name, applied_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![migration.version, migration.name, now_ms],
    )
    .map_err(fail)?;
    Ok(())
}

/// Prepares a fully migrated in-memory database (tests).
pub fn migrated_memory_db() -> Result<Connection, CoreError> {
    let mut conn = open_in_memory()?;
    migrate(&mut conn, &embedded_migrations())?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_migrations_are_consistent() {
        let migrations = embedded_migrations();
        assert_eq!(migrations[0].version, 1);
        assert_eq!(LATEST_SCHEMA_VERSION, migrations.last().unwrap().version);
    }

    #[test]
    fn fresh_database_migrates_to_latest() {
        let mut conn = open_in_memory().unwrap();
        let outcome = migrate(&mut conn, &embedded_migrations()).unwrap();
        assert_eq!(outcome.applied, vec![(1, "initial")]);
        assert_eq!(outcome.current, LATEST_SCHEMA_VERSION);
        assert_eq!(
            current_schema_version(&conn).unwrap(),
            LATEST_SCHEMA_VERSION
        );
    }

    #[test]
    fn migrating_twice_is_idempotent() {
        let mut conn = open_in_memory().unwrap();
        migrate(&mut conn, &embedded_migrations()).unwrap();
        let outcome = migrate(&mut conn, &embedded_migrations()).unwrap();
        assert!(outcome.applied.is_empty());
        assert_eq!(outcome.current, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn upgrade_applies_stepwise_from_partial_state() {
        // Mirrors the production contract: migration 1 creates schema_meta.
        let first = Migration {
            version: 1,
            name: "first",
            sql: "CREATE TABLE schema_meta (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at INTEGER NOT NULL
            );
            CREATE TABLE step_one (id TEXT PRIMARY KEY);",
        };
        let second = Migration {
            version: 2,
            name: "second",
            sql: "ALTER TABLE step_one ADD COLUMN note TEXT NOT NULL DEFAULT '';",
        };
        let mut conn = open_in_memory().unwrap();

        let outcome = migrate(&mut conn, &[first.clone()]).unwrap();
        assert_eq!(outcome.current, 1);

        let outcome = migrate(&mut conn, &[first, second]).unwrap();
        assert_eq!(outcome.applied, vec![(2, "second")]);
        assert_eq!(outcome.current, 2);
    }

    #[test]
    fn failing_migration_rolls_back_and_keeps_version() {
        let good = Migration {
            version: 1,
            name: "good",
            sql: "CREATE TABLE schema_meta (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at INTEGER NOT NULL
            );
            CREATE TABLE kept (id TEXT PRIMARY KEY);",
        };
        let bad = Migration {
            version: 2,
            name: "bad",
            sql: "CREATE TABLE doomed (id TEXT PRIMARY KEY);\nTHIS IS NOT SQL;",
        };
        let mut conn = open_in_memory().unwrap();
        migrate(&mut conn, &[good.clone()]).unwrap();

        let err = migrate(&mut conn, &[good, bad]).unwrap_err();
        assert_eq!(err.code, ErrorCode::DatabaseError);
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("migration 2 (bad) failed"));

        // Version did not advance and the failed DDL is gone.
        assert_eq!(current_schema_version(&conn).unwrap(), 1);
        let doomed: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='doomed')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!doomed);
    }

    #[test]
    fn migration_gaps_are_rejected() {
        let skipped = Migration {
            version: 2,
            name: "skipped",
            sql: "CREATE TABLE t2 (id TEXT PRIMARY KEY);",
        };
        let mut conn = open_in_memory().unwrap();
        let err = migrate(&mut conn, &[skipped]).unwrap_err();
        assert!(err.developer_detail.contains("migration gap"));
    }

    #[test]
    fn duplicate_versions_are_rejected() {
        let a = Migration {
            version: 1,
            name: "a",
            sql: "CREATE TABLE ta (id TEXT PRIMARY KEY);",
        };
        let b = Migration {
            version: 1,
            name: "b",
            sql: "CREATE TABLE tb (id TEXT PRIMARY KEY);",
        };
        let mut conn = open_in_memory().unwrap();
        let err = migrate(&mut conn, &[a, b]).unwrap_err();
        assert!(err.developer_detail.contains("duplicate migration version"));
    }

    #[test]
    fn connections_enable_foreign_keys() {
        let conn = open_in_memory().unwrap();
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn initial_schema_creates_all_documented_tables() {
        let conn = migrated_memory_db().unwrap();
        let expected = [
            "projects",
            "research_configs",
            "plans",
            "sections",
            "runs",
            "tasks",
            "task_dependencies",
            "sources",
            "source_contents",
            "knowledge_nodes",
            "claims",
            "evidence",
            "claim_evidence",
            "relations",
            "artifacts",
            "events",
            "llm_usage",
            "schema_meta",
        ];
        for table in expected {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists, "table {table} missing from 001_initial.sql");
        }
    }
}
