//! File-level migration integration tests (RUST-02 acceptance): a fresh
//! database on disk migrates, reopens at the right version, and re-running
//! is a no-op.

use morpho_desktop_lib::db::{
    current_schema_version, embedded_migrations, migrate, open_connection,
};

#[test]
fn file_database_migrates_and_reopens() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("morpho.sqlite3");

    {
        let mut conn = open_connection(&db_path).unwrap();
        let outcome = migrate(&mut conn, &embedded_migrations()).unwrap();
        assert!(!outcome.applied.is_empty());
        assert_eq!(
            outcome.current,
            morpho_desktop_lib::db::LATEST_SCHEMA_VERSION
        );

        // WAL journaling and foreign keys are active on the file connection.
        let journal: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(journal.to_lowercase(), "wal");
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    // Reopen: version persists, second migration run is a no-op.
    {
        let mut conn = open_connection(&db_path).unwrap();
        assert_eq!(
            current_schema_version(&conn).unwrap(),
            morpho_desktop_lib::db::LATEST_SCHEMA_VERSION
        );
        let outcome = migrate(&mut conn, &embedded_migrations()).unwrap();
        assert!(outcome.applied.is_empty());
    }
}

#[test]
fn migration_files_are_valid_utf8_sql_named_by_number() {
    for migration in embedded_migrations() {
        assert!(migration.version >= 1);
        assert!(!migration.name.is_empty());
        assert!(!migration.sql.trim().is_empty());
    }
}
