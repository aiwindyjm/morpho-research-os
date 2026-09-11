//! Project repository.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewProject {
    pub name: String,
    pub description: String,
}

pub struct Projects;

const COLS: &str = "id, name, description, status, created_at, updated_at";

impl Projects {
    pub fn insert(tx: &Transaction<'_>, new: &NewProject) -> Result<ProjectRecord, CoreError> {
        let record = ProjectRecord {
            id: new_id(),
            name: new.name.clone(),
            description: new.description.clone(),
            status: "active".into(),
            created_at: now_unix_ms(),
            updated_at: now_unix_ms(),
        };
        tx.execute(
            "INSERT INTO projects (id, name, description, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                record.id,
                record.name,
                record.description,
                record.status,
                record.created_at,
                record.updated_at
            ],
        )
        .map_err(CoreError::from)?;
        Ok(record)
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<ProjectRecord>, CoreError> {
        let mut stmt = conn
            .prepare(&format!("SELECT {COLS} FROM projects WHERE id = ?1"))
            .map_err(CoreError::from)?;
        let mut rows = stmt.query(params![id]).map_err(CoreError::from)?;
        match rows.next().map_err(CoreError::from)? {
            Some(row) => Ok(Some(map_row(row)?)),
            None => Ok(None),
        }
    }

    pub fn list(conn: &Connection) -> Result<Vec<ProjectRecord>, CoreError> {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {COLS} FROM projects ORDER BY created_at, id"
            ))
            .map_err(CoreError::from)?;
        let rows = stmt
            .query_map([], map_row)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }
}

fn map_row(row: &Row<'_>) -> rusqlite::Result<ProjectRecord> {
    Ok(ProjectRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        status: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::with_write_tx;

    #[test]
    fn insert_persists_and_round_trips() {
        let mut conn = migrated_memory_db().unwrap();
        let created = with_write_tx(&mut conn, |tx| {
            Projects::insert(
                tx,
                &NewProject {
                    name: "BCI".into(),
                    description: "notes".into(),
                },
            )
        })
        .unwrap();
        assert_eq!(created.status, "active");

        let fetched = Projects::get(&conn, &created.id).unwrap().unwrap();
        assert_eq!(fetched, created);
        assert_eq!(Projects::list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn get_missing_returns_none() {
        let conn = migrated_memory_db().unwrap();
        assert!(Projects::get(&conn, "nope").unwrap().is_none());
    }
}
