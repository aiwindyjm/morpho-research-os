//! Domain services: the only layer allowed to compose repositories inside
//! transactions. Commands call services; services own units of work.

use crate::error::CoreError;
use crate::repositories::configs::{NewResearchConfig, ResearchConfigRecord, ResearchConfigs};
use crate::repositories::events::{EventRecord, Events, NewEvent};
use crate::repositories::plans::{CreatedPlan, PlanDraft, Plans};
use crate::repositories::projects::{NewProject, ProjectRecord, Projects};
use crate::vault::{
    folder_for_type, slugify, MapNote, MapSection, MergeProposal, RelatedLink, VaultWriter,
    WriteOutcome,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    /// Notes (re)written atomically (knowledge, source, claim, and map notes
    /// alike).
    pub written: usize,
    /// Notes whose rendered content already matched the last write.
    pub unchanged: usize,
    /// Notes refused because the on-disk file carries user modifications.
    pub conflicts: usize,
    /// Notes not written because their type has no vault folder yet.
    pub skipped: usize,
    /// Source notes processed this export (written, unchanged, or refused).
    pub sources: usize,
    /// Claim notes processed this export (written, unchanged, or refused).
    pub claims: usize,
    /// Map (MOC index) notes produced this export (0 or 1).
    pub maps: usize,
    /// One merge proposal per conflict; the user resolves explicitly.
    pub merge_proposals: Vec<MergeProposal>,
    /// Root directory the notes were written under.
    pub vault_root: String,
}

pub struct VaultService;

impl VaultService {
    /// Exports a project into the vault: every knowledge node, source
    /// record, and claim record becomes a note in its typed folder, and a
    /// per-project MOC-style map note links them all. The writer targets the
    /// project's vault root (`<base>/<project_id>`), backed by the SQL
    /// artifact index. No user-modified file is ever overwritten: conflicts
    /// come back as merge proposals (DO_NOT_BREAK #5, RES-07).
    pub fn export_project(
        conn: &mut Connection,
        project_id: &str,
        base_root: &std::path::Path,
    ) -> Result<VaultExportResult, CoreError> {
        // Every read happens before the artifact index borrows the
        // connection mutably.
        let nodes =
            crate::repositories::knowledge::KnowledgeNodes::list_for_project(conn, project_id)?;
        let sources = crate::repositories::sources::Sources::list_for_project(conn, project_id)?;
        let claims = crate::repositories::claims::Claims::list_for_project(conn, project_id)?;
        let relations =
            crate::repositories::relations::Relations::list_for_project(conn, project_id)?;
        let titles: HashMap<String, String> = nodes
            .iter()
            .map(|node| (node.id.clone(), node.title.clone()))
            .collect();
        let mut claim_evidence_ids: HashMap<String, Vec<String>> = HashMap::new();
        let mut claim_source_ids: HashMap<String, Vec<String>> = HashMap::new();
        for claim in &claims {
            let evidence =
                crate::repositories::evidence::Evidence::list_for_claim(conn, &claim.id)?;
            claim_evidence_ids.insert(
                claim.id.clone(),
                evidence.iter().map(|e| e.id.clone()).collect(),
            );
            let mut source_ids: Vec<String> =
                evidence.iter().map(|e| e.source_id.clone()).collect();
            source_ids.sort();
            source_ids.dedup();
            claim_source_ids.insert(claim.id.clone(), source_ids);
        }
        let project = Projects::get(conn, project_id)?;

        let project_root = base_root.join(project_id);
        let mut result = VaultExportResult {
            written: 0,
            unchanged: 0,
            conflicts: 0,
            skipped: 0,
            sources: sources.len(),
            claims: claims.len(),
            maps: 0,
            merge_proposals: Vec::new(),
            vault_root: project_root.to_string_lossy().into_owned(),
        };

        let mut map_links: HashMap<&'static str, Vec<String>> = HashMap::new();
        let mut latest_update = project.as_ref().map(|p| p.updated_at).unwrap_or(0);

        let mut index = crate::repositories::artifacts::DbArtifactIndex::new(conn, project_id);
        let mut writer = VaultWriter::new(&project_root, &mut index);
        for node in nodes {
            let note = Self::note_for(node, project_id, &relations, &titles);
            latest_update = latest_update.max(note.updated_at_ms);
            if let Ok(folder) = folder_for_type(&note.node_type) {
                map_links
                    .entry(folder)
                    .or_default()
                    .push(note.title.clone());
            }
            Self::account(writer.write_note(&note), &mut result)?;
        }
        for source in sources {
            let note = Self::source_note_for(source, project_id);
            latest_update = latest_update.max(note.updated_at_ms);
            map_links
                .entry("Sources")
                .or_default()
                .push(note.title.clone());
            Self::account(writer.write_source_note(&note), &mut result)?;
        }
        for claim in claims {
            let note =
                Self::claim_note_for(claim, project_id, &claim_evidence_ids, &claim_source_ids);
            latest_update = latest_update.max(note.updated_at_ms);
            map_links
                .entry("Claims")
                .or_default()
                .push(note.title.clone());
            Self::account(writer.write_claim_note(&note), &mut result)?;
        }

        let map_note = Self::map_note_for(project.as_ref(), project_id, map_links, latest_update);
        Self::account(writer.write_map_note(&map_note), &mut result)?;
        result.maps = 1;
        Ok(result)
    }

    /// Folds one write outcome into the running export result. Types without
    /// a vault folder (Product/Dataset) are skipped with a structured error
    /// rather than failing the export; everything else propagates.
    fn account(
        outcome: Result<WriteOutcome, CoreError>,
        result: &mut VaultExportResult,
    ) -> Result<(), CoreError> {
        match outcome {
            Ok(WriteOutcome::Written { .. }) => result.written += 1,
            Ok(WriteOutcome::Unchanged { .. }) => result.unchanged += 1,
            Ok(WriteOutcome::Conflict(proposal)) => {
                result.conflicts += 1;
                result.merge_proposals.push(proposal);
            }
            Err(err)
                if err.code == crate::error::ErrorCode::VaultWriteFailed
                    && err.developer_detail.contains("no vault folder") =>
            {
                result.skipped += 1;
            }
            Err(err) => return Err(err),
        }
        Ok(())
    }

    /// Projects a knowledge node record onto the writer's note shape,
    /// augmenting the body's Related section with the node's outgoing
    /// relations as wikilinks (titles resolved through the project's nodes).
    fn note_for(
        node: crate::repositories::knowledge::KnowledgeNodeRecord,
        project_id: &str,
        relations: &[crate::repositories::relations::RelationRecord],
        titles: &HashMap<String, String>,
    ) -> crate::vault::VaultNote {
        let related = relations
            .iter()
            .filter(|relation| relation.from_node_id == node.id)
            .map(|relation| RelatedLink {
                relation_type: relation.relation_type.clone(),
                target_title: titles
                    .get(&relation.to_node_id)
                    .cloned()
                    .unwrap_or_else(|| relation.to_node_id.clone()),
                target_node_id: relation.to_node_id.clone(),
            })
            .collect();
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
            related,
            created_at_ms: node.created_at,
            updated_at_ms: node.updated_at,
        }
    }

    /// Projects a source record onto the writer's source-note shape. The
    /// body links out to the source URL; the slug falls back to the record
    /// id when the title yields no filesystem-safe characters.
    fn source_note_for(
        source: crate::repositories::sources::SourceRecord,
        project_id: &str,
    ) -> crate::vault::SourceNote {
        let title = if source.title.trim().is_empty() {
            source.canonical_url.clone()
        } else {
            source.title.clone()
        };
        let slug = {
            let slug = slugify(&title);
            if slug.is_empty() {
                source.id.clone()
            } else {
                slug
            }
        };
        let body_markdown = if source.url.is_empty() {
            String::new()
        } else {
            format!("[{title}]({})", source.url)
        };
        crate::vault::SourceNote {
            source_id: source.id,
            url: source.url,
            canonical_url: source.canonical_url,
            source_type: source.source_type,
            status: source.status,
            quality_score: source.quality_score,
            retrieved_at_ms: source.retrieved_at,
            created_at_ms: source.created_at,
            updated_at_ms: source.updated_at,
            provenance: format!("core/export/project/{project_id}"),
            title,
            slug,
            body_markdown,
        }
    }

    /// Projects a claim record onto the writer's claim-note shape, carrying
    /// its evidence ids and their distinct source ids into the frontmatter
    /// (DO_NOT_BREAK #7).
    fn claim_note_for(
        claim: crate::repositories::claims::ClaimRecord,
        project_id: &str,
        evidence_ids: &HashMap<String, Vec<String>>,
        source_ids: &HashMap<String, Vec<String>>,
    ) -> crate::vault::ClaimNote {
        let claim_id = claim.id.clone();
        let title = format!(
            "{} {} {}",
            claim.subject, claim.predicate, claim.object_value
        )
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
        let title = if title.is_empty() {
            claim_id.clone()
        } else {
            title
        };
        let slug = {
            let slug = slugify(&title);
            if slug.is_empty() {
                claim_id.clone()
            } else {
                slug
            }
        };
        crate::vault::ClaimNote {
            claim_id,
            subject: claim.subject,
            predicate: claim.predicate,
            object_value: claim.object_value,
            scope: claim.scope,
            confidence: claim.confidence,
            status: claim.status,
            evidence_ids: evidence_ids.get(&claim.id).cloned().unwrap_or_default(),
            source_ids: source_ids.get(&claim.id).cloned().unwrap_or_default(),
            created_at_ms: claim.created_at,
            updated_at_ms: claim.updated_at,
            provenance: if claim.provenance.is_empty() {
                format!("core/export/project/{project_id}")
            } else {
                claim.provenance
            },
            body_markdown: format!("{title}."),
            title,
            slug,
        }
    }

    /// Builds the per-project MOC map note: one section per vault folder in
    /// canonical order, linking every exported note by title. Timestamps
    /// derive purely from the inputs (project and note records), so
    /// identical inputs render byte-identical maps.
    fn map_note_for(
        project: Option<&ProjectRecord>,
        project_id: &str,
        map_links: HashMap<&'static str, Vec<String>>,
        latest_update: i64,
    ) -> MapNote {
        let project_name = project
            .map(|p| p.name.trim())
            .filter(|name| !name.is_empty())
            .unwrap_or("Project");
        let title = format!("{project_name} Map");
        let slug = {
            let slug = slugify(&title);
            if slug.is_empty() {
                format!("map-{project_id}")
            } else {
                slug
            }
        };
        let sections: Vec<MapSection> = crate::vault::MOC_SECTION_ORDER
            .iter()
            .filter_map(|folder| {
                map_links
                    .get(*folder)
                    .filter(|links| !links.is_empty())
                    .map(|links| MapSection {
                        section: (*folder).into(),
                        links: links.clone(),
                    })
            })
            .collect();
        MapNote {
            project_id: project_id.into(),
            created_at_ms: project.map(|p| p.created_at).unwrap_or(latest_update),
            updated_at_ms: latest_update,
            provenance: format!("core/export/project/{project_id}"),
            title,
            slug,
            sections,
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
        // Two knowledge notes plus the per-project map note.
        assert_eq!(first.written, 3);
        assert_eq!(first.unchanged, 0);
        assert_eq!(first.conflicts, 0);
        assert_eq!(first.sources, 0);
        assert_eq!(first.claims, 0);
        assert_eq!(first.maps, 1);
        assert!(first.vault_root.contains(&project_id), "per-project root");
        assert!(base
            .join(&project_id)
            .join("Concepts")
            .join("transformer.md")
            .exists());

        // Re-export: identical content is detected through the artifact index.
        let second = VaultService::export_project(&mut conn, &project_id, &base).unwrap();
        assert_eq!(second.written, 0);
        assert_eq!(second.unchanged, 3);

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

    #[test]
    fn vault_export_covers_sources_claims_wikilinks_and_map() {
        use crate::repositories::claims::{ClaimEvidence, Claims, NewClaim};
        use crate::repositories::evidence::{Evidence, NewEvidence};
        use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};
        use crate::repositories::relations::{NewRelation, Relations};
        use crate::repositories::sources::{NewSource, Sources};

        let mut conn = migrated_memory_db().unwrap();
        let project_id = with_write_tx(&mut conn, |tx| {
            Projects::insert(
                tx,
                &NewProject {
                    name: "BCI".into(),
                    description: String::new(),
                },
            )
            .map(|record| record.id)
        })
        .unwrap();

        let transformer = with_write_tx(&mut conn, |tx| {
            KnowledgeNodes::upsert_by_slug(
                tx,
                &NewKnowledgeNode {
                    project_id: project_id.clone(),
                    node_type: "Concept".into(),
                    title: "Transformer".into(),
                    slug: "transformer".into(),
                    summary: "summary".into(),
                    confidence: "high".into(),
                    aliases: vec![],
                    tags: vec![],
                    source_ids: vec![],
                    claim_ids: vec![],
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap();
        let attention = with_write_tx(&mut conn, |tx| {
            KnowledgeNodes::upsert_by_slug(
                tx,
                &NewKnowledgeNode {
                    project_id: project_id.clone(),
                    node_type: "Concept".into(),
                    title: "Attention".into(),
                    slug: "attention".into(),
                    summary: String::new(),
                    confidence: "medium".into(),
                    aliases: vec![],
                    tags: vec![],
                    source_ids: vec![],
                    claim_ids: vec![],
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap();
        with_write_tx(&mut conn, |tx| {
            Relations::insert(
                tx,
                &NewRelation {
                    id: None,
                    project_id: project_id.clone(),
                    from_node_id: transformer.clone(),
                    to_node_id: attention.clone(),
                    relation_type: "derives_from".into(),
                    confidence: "high".into(),
                },
            )
            .map(|_| ())
        })
        .unwrap();

        let source = with_write_tx(&mut conn, |tx| {
            Sources::upsert_by_canonical_url(
                tx,
                &NewSource {
                    project_id: project_id.clone(),
                    url: "https://arxiv.org/abs/1706.03762".into(),
                    canonical_url: "arxiv.org/abs/1706.03762".into(),
                    title: "Attention Is All You Need".into(),
                    source_type: "paper".into(),
                },
            )
            .map(|(record, _)| record)
        })
        .unwrap();
        let claim = with_write_tx(&mut conn, |tx| {
            Claims::insert(
                tx,
                &NewClaim {
                    id: None,
                    project_id: project_id.clone(),
                    subject: "Transformer".into(),
                    predicate: "uses".into(),
                    object_value: "attention".into(),
                    scope: String::new(),
                    confidence: "high".into(),
                    provenance: "run-1/task-2".into(),
                },
            )
            .map(|(record, _)| record)
        })
        .unwrap();
        let evidence = with_write_tx(&mut conn, |tx| {
            Evidence::insert(
                tx,
                &NewEvidence {
                    id: None,
                    project_id: project_id.clone(),
                    source_id: source.id.clone(),
                    quote: "transformers use attention".into(),
                    value: String::new(),
                    locator: "p. 2".into(),
                    direction: "support".into(),
                },
            )
            .map(|(record, _)| record)
        })
        .unwrap();
        with_write_tx(&mut conn, |tx| {
            ClaimEvidence::link(tx, &claim.id, &evidence.id).map(|_| ())
        })
        .unwrap();

        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("vault");
        let result = VaultService::export_project(&mut conn, &project_id, &base).unwrap();
        let root = base.join(&project_id);

        // Two knowledge notes, one source, one claim, one map.
        assert_eq!(result.written, 5, "{result:?}");
        assert_eq!(result.sources, 1);
        assert_eq!(result.claims, 1);
        assert_eq!(result.maps, 1);
        assert_eq!(result.conflicts, 0);

        // Typed folders received their notes.
        let transformer_note =
            std::fs::read_to_string(root.join("Concepts").join("transformer.md")).unwrap();
        let source_note =
            std::fs::read_to_string(root.join("Sources").join("attention-is-all-you-need.md"))
                .unwrap();
        let claim_note =
            std::fs::read_to_string(root.join("Claims").join("transformer-uses-attention.md"))
                .unwrap();
        let map_note = std::fs::read_to_string(root.join("Maps").join("bci-map.md")).unwrap();

        // Outgoing relations became wikilinks in the knowledge note body.
        assert!(transformer_note.contains("## Related"));
        assert!(transformer_note.contains("- derives_from: [[Attention]]"));
        assert!(
            !std::fs::read_to_string(root.join("Concepts").join("attention.md"))
                .unwrap()
                .contains("## Related")
        );

        // Source frontmatter mirrors the record faithfully.
        assert!(source_note.contains(&format!("source_id: \"{}\"", source.id)));
        assert!(source_note.contains("url: \"https://arxiv.org/abs/1706.03762\""));
        assert!(source_note.contains("quality_score: null"));

        // Claim frontmatter carries the claim contract incl. evidence links.
        assert!(claim_note.contains(&format!("claim_id: \"{}\"", claim.id)));
        assert!(claim_note.contains("subject: \"Transformer\""));
        assert!(claim_note.contains("predicate: \"uses\""));
        assert!(claim_note.contains("object: \"attention\""));
        assert!(claim_note.contains(&format!("evidence_ids: [\"{}\"]", evidence.id)));
        assert!(claim_note.contains(&format!("source_ids: [\"{}\"]", source.id)));
        assert!(claim_note.contains("provenance: \"run-1/task-2\""));

        // The map links every exported note, grouped per folder in canonical
        // order (Claims before Controversies before Sources).
        assert!(map_note.contains("## Concepts\n\n- [[Attention]]\n- [[Transformer]]\n"));
        assert!(map_note.contains("## Claims\n\n- [[Transformer uses attention]]\n"));
        assert!(map_note.contains("## Sources\n\n- [[Attention Is All You Need]]\n"));
        let concepts = map_note.find("## Concepts").unwrap();
        let claims = map_note.find("## Claims").unwrap();
        let sources_at = map_note.find("## Sources").unwrap();
        assert!(concepts < claims && claims < sources_at);

        // Re-export is fully idempotent, map included.
        let again = VaultService::export_project(&mut conn, &project_id, &base).unwrap();
        assert_eq!(again.written, 0, "{again:?}");
        assert_eq!(again.unchanged, 5);
        assert_eq!(
            std::fs::read_to_string(root.join("Maps").join("bci-map.md")).unwrap(),
            map_note
        );

        // A user edit of a claim note is refused, not overwritten.
        let claim_file = root.join("Claims").join("transformer-uses-attention.md");
        std::fs::write(&claim_file, "user's own claim notes").unwrap();
        let third = VaultService::export_project(&mut conn, &project_id, &base).unwrap();
        assert_eq!(third.conflicts, 1);
        assert_eq!(
            std::fs::read_to_string(&claim_file).unwrap(),
            "user's own claim notes"
        );
    }
}
