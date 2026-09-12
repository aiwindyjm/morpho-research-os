//! Domain services: the only layer allowed to compose repositories inside
//! transactions. Commands call services; services own units of work.

use crate::error::CoreError;
use crate::repositories::configs::{NewResearchConfig, ResearchConfigRecord, ResearchConfigs};
use crate::repositories::events::{EventRecord, Events, NewEvent};
use crate::repositories::plans::{CreatedPlan, PlanDraft, Plans};
use crate::repositories::projects::{NewProject, ProjectRecord, Projects};
use crate::vault::MergeProposal;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

pub struct ProjectService;

impl ProjectService {
    /// Creates a project together with its first research configuration in
    /// one transaction; a failure persists neither.
    pub fn create_project_with_config(
        conn: &mut Connection,
        new_project: NewProject,
        config: NewResearchConfig,
    ) -> Result<(ProjectRecord, ResearchConfigRecord), CoreError> {
        crate::repositories::with_write_tx(conn, |tx| {
            let project = Projects::insert(tx, &new_project)?;
            let mut config = config;
            config.project_id = project.id.clone();
            let record = ResearchConfigs::insert(tx, &config)?;
            Ok((project, record))
        })
    }
}

pub struct PlanService;

impl PlanService {
    /// Persists a full plan draft (plan + sections + tasks + dependencies)
    /// atomically. Idempotency keys are unique; duplicates reject the whole
    /// draft without partial writes.
    pub fn create_plan(conn: &mut Connection, draft: PlanDraft) -> Result<CreatedPlan, CoreError> {
        crate::repositories::with_write_tx(conn, |tx| Plans::insert_draft(tx, &draft))
    }
}

pub struct EventService;

impl EventService {
    /// Appends one run event, allocating its sequence atomically: the
    /// sequence lookup and the insert share one write transaction, so two
    /// appends can never observe the same `MAX(sequence)`.
    pub fn append_event(conn: &mut Connection, new: NewEvent) -> Result<EventRecord, CoreError> {
        crate::repositories::with_write_tx(conn, |tx| Events::append(tx, &new))
    }
}

/// Outcome of exporting one project's knowledge into the vault.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VaultExportResult {
    /// Notes (re)written atomically.
    pub written: usize,
    /// Notes whose rendered content already matched the last write.
    pub unchanged: usize,
    /// Notes refused because the on-disk file carries user modifications.
    pub conflicts: usize,
    /// Notes not written because their type has no vault folder yet.
    pub skipped: usize,
    /// One merge proposal per conflict; the user resolves explicitly.
    pub merge_proposals: Vec<MergeProposal>,
    /// Root directory the notes were written under.
    pub vault_root: String,
}

pub struct VaultService;

impl VaultService {
    /// Exports every knowledge node of a project through the
    /// [`VaultWriter`](crate::vault::VaultWriter) into the project's vault
    /// root (`<base>/<project_id>`), backed by the SQL artifact index. No
    /// user-modified file is ever overwritten: conflicts come back as merge
    /// proposals (DO_NOT_BREAK #5, RES-07).
    pub fn export_project(
        conn: &mut Connection,
        project_id: &str,
        base_root: &std::path::Path,
    ) -> Result<VaultExportResult, CoreError> {
        let nodes =
            crate::repositories::knowledge::KnowledgeNodes::list_for_project(conn, project_id)?;
        let project_root = base_root.join(project_id);
        let mut result = VaultExportResult {
            written: 0,
            unchanged: 0,
            conflicts: 0,
            skipped: 0,
            merge_proposals: Vec::new(),
            vault_root: project_root.to_string_lossy().into_owned(),
        };

        let mut index = crate::repositories::artifacts::DbArtifactIndex::new(conn, project_id);
        let mut writer = crate::vault::VaultWriter::new(&project_root, &mut index);
        for node in nodes {
            let note = Self::note_for(node, project_id);
            match writer.write_note(&note) {
                Ok(crate::vault::WriteOutcome::Written { .. }) => result.written += 1,
                Ok(crate::vault::WriteOutcome::Unchanged { .. }) => result.unchanged += 1,
                Ok(crate::vault::WriteOutcome::Conflict(proposal)) => {
                    result.conflicts += 1;
                    result.merge_proposals.push(proposal);
                }
                // Types without a vault folder (Product/Dataset) are skipped
                // with a structured error rather than failing the export.
                Err(err)
                    if err.code == crate::error::ErrorCode::VaultWriteFailed
                        && err.developer_detail.contains("no vault folder") =>
                {
                    result.skipped += 1;
                }
                Err(err) => return Err(err),
            }
        }
        Ok(result)
    }

    /// Projects a knowledge node record onto the writer's note shape.
    fn note_for(
        node: crate::repositories::knowledge::KnowledgeNodeRecord,
        project_id: &str,
    ) -> crate::vault::VaultNote {
        crate::vault::VaultNote {
            node_id: node.id,
            node_type: node.node_type,
            title: node.title,
            slug: node.slug,
            summary: node.summary,
            status: node.status,
            confidence: node.confidence,
            aliases: node.aliases,
            tags: node.tags,
            source_ids: node.source_ids,
            claim_ids: node.claim_ids,
            provenance: format!("core/export/project/{project_id}"),
            body_markdown: String::new(),
            created_at_ms: node.created_at,
            updated_at_ms: node.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::configs::NewResearchConfig;
    use crate::repositories::events::Events;
    use crate::repositories::plans::{NewPlan, PlanDraft};
    use crate::repositories::runs::{NewRun, Runs};
    use crate::repositories::with_write_tx;

    #[test]
    fn project_and_config_commit_or_rollback_together() {
        let mut conn = migrated_memory_db().unwrap();
        let config = NewResearchConfig {
            project_id: "will-be-overwritten".into(),
            domain: "d".into(),
            topic: "t".into(),
            ..Default::default()
        };
        let (project, stored_config) = ProjectService::create_project_with_config(
            &mut conn,
            NewProject {
                name: "BCI".into(),
                description: String::new(),
            },
            config,
        )
        .unwrap();
        assert_eq!(stored_config.project_id, project.id);
        assert_eq!(
            ResearchConfigs::list_for_project(&conn, &project.id)
                .unwrap()
                .len(),
            1
        );

        // A config pointing at a missing project fails and writes nothing.
        let bad = NewResearchConfig {
            project_id: "ghost".into(),
            domain: "d".into(),
            topic: "t".into(),
            ..Default::default()
        };
        let err = crate::repositories::with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(tx, &bad).map(|_| ())
        })
        .unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::DatabaseError);
        let projects: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(projects, 1);
    }

    #[test]
    fn appended_events_allocate_monotonic_sequences_per_service_call() {
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
        let config_id = with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: project_id.clone(),
                    domain: "d".into(),
                    topic: "t".into(),
                    ..Default::default()
                },
            )
            .map(|c| c.id)
        })
        .unwrap();
        let plan_id = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.clone(),
                        research_config_id: config_id,
                        title: "T".into(),
                    },
                    sections: vec![],
                    tasks: vec![],
                },
            )
            .map(|created| created.plan.id)
        })
        .unwrap();
        let run_id = with_write_tx(&mut conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id,
                    plan_id,
                    started_at: None,
                },
            )
            .map(|r| r.id)
        })
        .unwrap();

        for expected in 1..=2 {
            let record = EventService::append_event(
                &mut conn,
                NewEvent {
                    run_id: run_id.clone(),
                    task_id: None,
                    event_type: "run.progress".into(),
                    payload: "{}".into(),
                },
            )
            .unwrap();
            assert_eq!(record.sequence, expected);
        }
        assert_eq!(Events::latest_sequence(&conn, &run_id).unwrap(), 2);
    }

    #[test]
    fn vault_export_writes_all_nodes_and_is_idempotent() {
        use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};

        let mut conn = migrated_memory_db().unwrap();
        let project_id = with_write_tx(&mut conn, |tx| {
            Projects::insert(
                tx,
                &NewProject {
                    name: "P".into(),
                    description: String::new(),
                },
            )
            .map(|record| record.id)
        })
        .unwrap();
        for (node_type, slug) in [("Concept", "transformer"), ("Paper", "attention-paper")] {
            with_write_tx(&mut conn, |tx| {
                KnowledgeNodes::upsert_by_slug(
                    tx,
                    &NewKnowledgeNode {
                        project_id: project_id.clone(),
                        node_type: node_type.into(),
                        title: slug.into(),
                        slug: slug.into(),
                        summary: "summary".into(),
                        confidence: "high".into(),
                        aliases: vec![],
                        tags: vec![],
                        source_ids: vec![],
                        claim_ids: vec![],
                    },
                )
                .map(|_| ())
            })
            .unwrap();
        }

        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let first = VaultService::export_project(&mut conn, &project_id, &base).unwrap();
        assert_eq!(first.written, 2);
        assert_eq!(first.unchanged, 0);
        assert_eq!(first.conflicts, 0);
        assert!(first.vault_root.contains(&project_id), "per-project root");
        assert!(base
            .join(&project_id)
            .join("Concepts")
            .join("transformer.md")
            .exists());

        // Re-export: identical content is detected through the artifact index.
        let second = VaultService::export_project(&mut conn, &project_id, &base).unwrap();
        assert_eq!(second.written, 0);
        assert_eq!(second.unchanged, 2);

        // A user edit conflicts instead of being overwritten.
        let note_file = base
            .join(&project_id)
            .join("Concepts")
            .join("transformer.md");
        std::fs::write(&note_file, "user's own edit").unwrap();
        let third = VaultService::export_project(&mut conn, &project_id, &base).unwrap();
        assert_eq!(third.conflicts, 1);
        assert_eq!(third.merge_proposals.len(), 1);
        assert_eq!(
            std::fs::read_to_string(&note_file).unwrap(),
            "user's own edit"
        );
    }
}
