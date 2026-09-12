//! Research configuration repository.
//!
//! Columns mirror `packages/schemas/research-config.v1.json`; list-typed
//! fields are stored as JSON arrays, the only JSON category allowed here per
//! `docs/DATA_MODEL.md`.

use crate::error::CoreError;
use crate::ids::{new_id, now_unix_ms};
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct NewResearchConfig {
    pub project_id: String,
    pub domain: String,
    pub topic: String,
    pub purpose: String,
    pub audience: String,
    pub depth: i64,
    pub dimensions: Vec<String>,
    pub time_range_from: Option<i64>,
    pub time_range_to: Option<i64>,
    pub geographic_scope: String,
    pub languages: Vec<String>,
    pub source_types: Vec<String>,
    pub source_domains: Vec<String>,
    pub update_frequency: String,
}

impl Default for NewResearchConfig {
    fn default() -> Self {
        Self {
            project_id: String::new(),
            domain: String::new(),
            topic: String::new(),
            purpose: "learning".into(),
            audience: String::new(),
            depth: 2,
            dimensions: Vec::new(),
            time_range_from: None,
            time_range_to: None,
            geographic_scope: String::new(),
            languages: vec!["en".into()],
            source_types: Vec::new(),
            source_domains: Vec::new(),
            update_frequency: "manual".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchConfigRecord {
    pub id: String,
    pub project_id: String,
    pub schema_version: String,
    pub domain: String,
    pub topic: String,
    pub purpose: String,
    pub audience: String,
    pub depth: i64,
    pub dimensions: Vec<String>,
    pub time_range_from: Option<i64>,
    pub time_range_to: Option<i64>,
    pub geographic_scope: String,
    pub languages: Vec<String>,
    pub source_types: Vec<String>,
    pub source_domains: Vec<String>,
    pub update_frequency: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct ResearchConfigs;

impl ResearchConfigs {
    pub fn insert(
        tx: &Transaction<'_>,
        new: &NewResearchConfig,
    ) -> Result<ResearchConfigRecord, CoreError> {
        let now = now_unix_ms();
        let record = ResearchConfigRecord {
            id: new_id(),
            project_id: new.project_id.clone(),
            schema_version: "1.0".into(),
            domain: new.domain.clone(),
            topic: new.topic.clone(),
            purpose: new.purpose.clone(),
            audience: new.audience.clone(),
            depth: new.depth,
            dimensions: new.dimensions.clone(),
            time_range_from: new.time_range_from,
            time_range_to: new.time_range_to,
            geographic_scope: new.geographic_scope.clone(),
            languages: new.languages.clone(),
            source_types: new.source_types.clone(),
            source_domains: new.source_domains.clone(),
            update_frequency: new.update_frequency.clone(),
            created_at: now,
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO research_configs (
                id, project_id, schema_version, domain, topic, purpose, audience, depth,
                dimensions, time_range_from, time_range_to, geographic_scope, languages,
                source_types, source_domains, update_frequency, created_at, updated_at
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?17)",
            params![
                record.id,
                record.project_id,
                record.schema_version,
                record.domain,
                record.topic,
                record.purpose,
                record.audience,
                record.depth,
                serde_json::to_string(&record.dimensions).map_err(|e| {
                    CoreError::database(format!("serialize dimensions failed: {e}"))
                })?,
                record.time_range_from,
                record.time_range_to,
                record.geographic_scope,
                serde_json::to_string(&record.languages)
                    .map_err(|e| CoreError::database(format!("serialize languages failed: {e}")))?,
                serde_json::to_string(&record.source_types).map_err(|e| {
                    CoreError::database(format!("serialize source_types failed: {e}"))
                })?,
                serde_json::to_string(&record.source_domains).map_err(|e| {
                    CoreError::database(format!("serialize source_domains failed: {e}"))
                })?,
                record.update_frequency,
                now,
            ],
        )
        .map_err(CoreError::from)?;
        Ok(record)
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<ResearchConfigRecord>, CoreError> {
        let sql = "SELECT id, project_id, schema_version, domain, topic, purpose, audience, depth,
                          dimensions, time_range_from, time_range_to, geographic_scope, languages,
                          source_types, source_domains, update_frequency, created_at, updated_at
                   FROM research_configs WHERE id = ?1";
        match conn.query_row(sql, params![id], map_row) {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(CoreError::from(err)),
        }
    }

    pub fn list_for_project(
        conn: &Connection,
        project_id: &str,
    ) -> Result<Vec<ResearchConfigRecord>, CoreError> {
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, schema_version, domain, topic, purpose, audience, depth,
                        dimensions, time_range_from, time_range_to, geographic_scope, languages,
                        source_types, source_domains, update_frequency, created_at, updated_at
                 FROM research_configs WHERE project_id = ?1 ORDER BY created_at, id",
            )
            .map_err(CoreError::from)?;
        let rows = stmt
            .query_map(params![project_id], map_row)
            .map_err(CoreError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(CoreError::from)?;
        Ok(rows)
    }
}

fn map_row(row: &Row<'_>) -> rusqlite::Result<ResearchConfigRecord> {
    Ok(ResearchConfigRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        schema_version: row.get(2)?,
        domain: row.get(3)?,
        topic: row.get(4)?,
        purpose: row.get(5)?,
        audience: row.get(6)?,
        depth: row.get(7)?,
        dimensions: parse_json_array(row.get(8)?)?,
        time_range_from: row.get(9)?,
        time_range_to: row.get(10)?,
        geographic_scope: row.get(11)?,
        languages: parse_json_array(row.get(12)?)?,
        source_types: parse_json_array(row.get(13)?)?,
        source_domains: parse_json_array(row.get(14)?)?,
        update_frequency: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

/// Parses a stored JSON array column; a malformed value surfaces as a row
/// error instead of a panic.
fn parse_json_array(raw: String) -> rusqlite::Result<Vec<String>> {
    serde_json::from_str(&raw).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
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

    #[test]
    fn config_round_trips_with_json_arrays() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let created = with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: project_id.clone(),
                    domain: "AI".into(),
                    topic: "LLM scaling".into(),
                    purpose: "research".into(),
                    depth: 4,
                    dimensions: vec!["theory".into(), "experiments".into()],
                    languages: vec!["en".into(), "zh".into()],
                    source_types: vec!["paper".into()],
                    ..Default::default()
                },
            )
        })
        .unwrap();

        let list = ResearchConfigs::list_for_project(&conn, &project_id).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0], created);
        assert_eq!(list[0].dimensions, vec!["theory", "experiments"]);
        assert_eq!(list[0].schema_version, "1.0");
        assert_eq!(
            ResearchConfigs::get(&conn, &created.id).unwrap().unwrap(),
            created
        );
        assert!(ResearchConfigs::get(&conn, "nope").unwrap().is_none());
    }
}
