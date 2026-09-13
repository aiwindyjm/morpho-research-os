//! Read-model projections over the repositories, shaped for the frontend IPC
//! contract (`apps/desktop/src/services/commands.ts` and its zod schemas;
//! behavioral reference `apps/desktop/src/services/mocks/projections.ts`).
//!
//! These types are transport DTOs, not domain records: timestamps become
//! UTC ISO-8601 strings, and fields the repository schema does not persist
//! map through documented bridges (ADR-020):
//!
//! * plan sections keep their `summary` as the review rationale; a section
//!   without a stored `dimension` (pre-003 rows) falls back to its title;
//! * a knowledge node's graph `dimension` is its first tag (the schema has
//!   no dimension column), `claim_count` counts `claim_ids` (the node is the
//!   authoritative link in this schema), and `year` is always null (the
//!   year tag is mock-only fixture data);
//! * relation confidence states project onto a [0, 1] display scale
//!   ([`confidence_to_score`]) because the graph contract carries a number;
//! * evidence locators are raw strings in the schema; the kind is inferred
//!   (`p.`/numeric prefix = page, `#`/URL = url_fragment, else section) and
//!   an empty locator falls back to the quote as the locator value;
//!   `extraction_method` is the fixed V0.1 value `llm_extraction`.
//!
//! Assembly only — every write stays in the repository/service layers.

use crate::error::CoreError;
use crate::repositories::evidence::EvidenceRecord;
use crate::repositories::knowledge::KnowledgeNodeRecord;
use crate::repositories::plans::{PlanRecord, SectionRecord, TaskRecord};
use crate::repositories::relations::RelationRecord;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/* ------------------------------------------------------------------ */
/* Research config (config.get / config.update responses)              */
/* ------------------------------------------------------------------ */

/// The `ResearchConfig` transport shape (research-config.v1.json persisted
/// record form; frontend `researchConfigSchema`). Unlike the worker wire
/// payload (`research_config_wire`), `time_range` is always an object with
/// nullable bounds — the frontend zod contract requires the object even
/// when unbounded.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchConfigView {
    pub schema_version: String,
    pub config_id: String,
    pub project_id: String,
    pub domain: String,
    pub topic: String,
    pub purpose: String,
    pub audience: String,
    pub depth: i64,
    pub dimensions: Vec<String>,
    pub time_range: TimeRangeView,
    pub geographic_scope: String,
    pub languages: Vec<String>,
    pub source_types: Vec<String>,
    pub source_domains: Vec<String>,
    pub update_frequency: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimeRangeView {
    pub from: Option<String>,
    pub to: Option<String>,
}

/// Maps a persisted research-config record onto the IPC config shape.
/// Timestamps become UTC ISO-8601 strings on both fields and bounds.
pub fn research_config_view(
    record: &crate::repositories::configs::ResearchConfigRecord,
) -> ResearchConfigView {
    ResearchConfigView {
        schema_version: record.schema_version.clone(),
        config_id: record.id.clone(),
        project_id: record.project_id.clone(),
        domain: record.domain.clone(),
        topic: record.topic.clone(),
        purpose: record.purpose.clone(),
        audience: record.audience.clone(),
        depth: record.depth,
        dimensions: record.dimensions.clone(),
        time_range: TimeRangeView {
            from: record.time_range_from.map(crate::vault::format_rfc3339_utc),
            to: record.time_range_to.map(crate::vault::format_rfc3339_utc),
        },
        geographic_scope: record.geographic_scope.clone(),
        languages: record.languages.clone(),
        source_types: record.source_types.clone(),
        source_domains: record.source_domains.clone(),
        update_frequency: record.update_frequency.clone(),
        created_at: crate::vault::format_rfc3339_utc(record.created_at),
        updated_at: crate::vault::format_rfc3339_utc(record.updated_at),
    }
}

/* ------------------------------------------------------------------ */
/* Plan (plan.regenerate / plan.updateTask / plan.reject responses)     */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanView {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: String,
    pub rationale: String,
    pub sections: Vec<SectionView>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SectionView {
    pub id: String,
    pub title: String,
    pub dimension: String,
    pub rationale: String,
    pub objectives: Vec<String>,
    pub tasks: Vec<PlanTaskView>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanTaskView {
    pub id: String,
    pub title: String,
    pub description: String,
    pub kind: String,
}

/// Projects a persisted plan (with its sections and tasks) onto the IPC plan
/// shape. Sections appear in `order_index` order; tasks group under their
/// section; tasks without a section (for example a gap follow-up task the
/// plan could not place) are omitted — commands only project plans whose
/// tasks all carry sections.
pub fn plan_view(conn: &Connection, plan: &PlanRecord) -> Result<PlanView, CoreError> {
    let sections = crate::repositories::plans::Plans::sections_for_plan(conn, &plan.id)?;
    let tasks = crate::repositories::plans::Plans::tasks_for_plan(conn, &plan.id)?;
    Ok(PlanView {
        id: plan.id.clone(),
        project_id: plan.project_id.clone(),
        title: plan.title.clone(),
        status: plan.status.clone(),
        rationale: plan.rationale.clone(),
        sections: section_views(&sections, &tasks),
        created_at: crate::vault::format_rfc3339_utc(plan.created_at),
        updated_at: crate::vault::format_rfc3339_utc(plan.updated_at),
    })
}

fn section_views(sections: &[SectionRecord], tasks: &[TaskRecord]) -> Vec<SectionView> {
    sections
        .iter()
        .map(|section| SectionView {
            id: section.id.clone(),
            title: section.title.clone(),
            dimension: if section.dimension.is_empty() {
                section.title.clone()
            } else {
                section.dimension.clone()
            },
            rationale: section.summary.clone(),
            objectives: section.objectives.clone(),
            tasks: tasks
                .iter()
                .filter(|task| task.section_id.as_deref() == Some(section.id.as_str()))
                .map(|task| PlanTaskView {
                    id: task.id.clone(),
                    title: task.title.clone(),
                    description: task.description.clone(),
                    kind: task.task_type.clone(),
                })
                .collect(),
        })
        .collect()
}

/* ------------------------------------------------------------------ */
/* Evidence (evidence.listByClaim response)                            */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvidenceView {
    pub id: String,
    pub project_id: String,
    pub claim_id: String,
    pub source_id: String,
    pub quote: String,
    pub locator: LocatorView,
    pub retrieved_at: String,
    pub direction: String,
    pub extraction_method: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LocatorView {
    pub kind: String,
    pub value: String,
}

/// Maps evidence records onto the IPC evidence shape. All records must
/// belong to the same claim (the claim id crosses IPC per record because the
/// link lives in `claim_evidence`, not on the evidence row).
pub fn evidence_views(claim_id: &str, records: &[EvidenceRecord]) -> Vec<EvidenceView> {
    records
        .iter()
        .map(|record| EvidenceView {
            id: record.id.clone(),
            project_id: record.project_id.clone(),
            claim_id: claim_id.to_string(),
            source_id: record.source_id.clone(),
            quote: record.quote.clone(),
            locator: locator_view(record),
            retrieved_at: crate::vault::format_rfc3339_utc(record.retrieved_at),
            direction: record.direction.clone(),
            extraction_method: "llm_extraction".into(),
            created_at: crate::vault::format_rfc3339_utc(record.created_at),
        })
        .collect()
}

/// Infers the locator kind from the raw stored string (documented bridge,
/// ADR-020). An empty locator falls back to the quote so the transport
/// contract's non-empty `value` always holds.
fn locator_view(record: &EvidenceRecord) -> LocatorView {
    let raw = record.locator.trim();
    if raw.is_empty() {
        let value = if record.quote.is_empty() {
            "unspecified".to_string()
        } else {
            record.quote.clone()
        };
        return LocatorView {
            kind: "quote".into(),
            value,
        };
    }
    let lowered = raw.to_ascii_lowercase();
    let kind = if lowered.starts_with("p.")
        || lowered.starts_with("p ")
        || raw.chars().all(|c| c.is_ascii_digit())
    {
        "page"
    } else if raw.starts_with('#') || lowered.contains("://") {
        "url_fragment"
    } else {
        "section"
    };
    LocatorView {
        kind: kind.into(),
        value: record.locator.clone(),
    }
}

/* ------------------------------------------------------------------ */
/* Graph (graph.get response)                                          */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphProjection {
    pub project_id: String,
    pub nodes: Vec<GraphNodeView>,
    pub relations: Vec<GraphRelationView>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphNodeView {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub title: String,
    pub confidence: String,
    pub dimension: String,
    pub source_count: usize,
    pub claim_count: usize,
    /// Temporal tag for the PRD §13 filter; persisted nodes carry no year,
    /// so the projection always reports null.
    pub year: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GraphRelationView {
    pub id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub predicate: String,
    pub confidence: f64,
}

/// Assembles the graph projection from the knowledge and relation
/// repositories (no new tables). Relations render only when both endpoints
/// are in the project's node set, mirroring the mock's dangling-edge filter.
pub fn graph(conn: &Connection, project_id: &str) -> Result<GraphProjection, CoreError> {
    if crate::repositories::projects::Projects::get(conn, project_id)?.is_none() {
        return Err(CoreError::database(format!(
            "project '{project_id}' not found"
        )));
    }
    let nodes = crate::repositories::knowledge::KnowledgeNodes::list_for_project(conn, project_id)?;
    let relations = crate::repositories::relations::Relations::list_for_project(conn, project_id)?;
    let node_ids: std::collections::HashSet<&str> =
        nodes.iter().map(|node| node.id.as_str()).collect();
    Ok(GraphProjection {
        project_id: project_id.to_string(),
        nodes: nodes.iter().map(graph_node_view).collect(),
        relations: relations
            .iter()
            .filter(|relation| {
                node_ids.contains(relation.from_node_id.as_str())
                    && node_ids.contains(relation.to_node_id.as_str())
            })
            .map(graph_relation_view)
            .collect(),
    })
}

fn graph_node_view(node: &KnowledgeNodeRecord) -> GraphNodeView {
    GraphNodeView {
        id: node.id.clone(),
        node_type: node.node_type.clone(),
        title: node.title.clone(),
        confidence: node.confidence.clone(),
        dimension: node.tags.first().cloned().unwrap_or_default(),
        source_count: node.source_ids.len(),
        claim_count: node.claim_ids.len(),
        year: None,
    }
}

fn graph_relation_view(relation: &RelationRecord) -> GraphRelationView {
    GraphRelationView {
        id: relation.id.clone(),
        source_node_id: relation.from_node_id.clone(),
        target_node_id: relation.to_node_id.clone(),
        predicate: relation.relation_type.clone(),
        confidence: confidence_to_score(&relation.confidence),
    }
}

/// Projects a confidence state onto the [0, 1] display scale the graph
/// contract carries. The persisted vocabulary stays the confidence states;
/// this mapping is presentation-only (ADR-020).
pub fn confidence_to_score(state: &str) -> f64 {
    match state {
        "confirmed" => 1.0,
        "high" => 0.8,
        "conflicting" => 0.5,
        "medium" => 0.6,
        "low" => 0.4,
        _ => 0.2, // unverified and anything unknown
    }
}

/* ------------------------------------------------------------------ */
/* Gap report (gap.list / gap.approveProposal / gap.dismissProposal)   */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GapReportView {
    pub project_id: String,
    pub gaps: Vec<ResearchGapView>,
    pub computed_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchGapView {
    pub id: String,
    pub project_id: String,
    pub dimension: String,
    pub trigger: String,
    pub rule: String,
    pub detail: String,
    pub quality_sources_found: usize,
    pub coverage: f64,
    pub proposed_task: ProposedTaskView,
    pub proposal_status: String,
    pub created_task_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProposedTaskView {
    pub title: String,
    pub description: String,
    pub dimension: String,
}

/// Derives the stable gap identity for one dimension of a project. Gaps are
/// not stored rows: the same under-covered dimension keeps its id across
/// recomputations, so decisions (and approve-created task keys) stay stable.
pub fn gap_id(project_id: &str, dimension: &str) -> String {
    format!("gap:{project_id}:{dimension}")
}

/// Computes the gap report from current coverage merged with persisted user
/// decisions (PRD §14). Mirrors the mock rules: no project tasks means no
/// gaps (the primary action then is plan review, not gap filling); a
/// dimension gaps below the coverage threshold or with too few independent
/// quality sources; dismissed dimensions stay hidden.
pub fn gap_report(conn: &Connection, project_id: &str) -> Result<GapReportView, CoreError> {
    let coverage = crate::coverage::compute(conn, project_id)?;
    let has_tasks = coverage
        .dimensions
        .iter()
        .any(|dimension| dimension.tasks_total > 0);
    if !has_tasks {
        return Ok(GapReportView {
            project_id: project_id.to_string(),
            gaps: Vec::new(),
            computed_at: crate::vault::format_rfc3339_utc(crate::ids::now_unix_ms()),
        });
    }
    let decisions =
        crate::repositories::gap_decisions::GapDecisions::list_for_project(conn, project_id)?;
    let gaps = coverage
        .dimensions
        .iter()
        .filter_map(|dimension| dimension.gap.as_ref().map(|gap| (dimension, gap)))
        .filter(|(dimension, _)| {
            decisions.iter().all(|decision| {
                decision.dimension != dimension.dimension || decision.status != "dismissed"
            })
        })
        .map(|(dimension, gap)| {
            let decision = decisions
                .iter()
                .find(|decision| decision.dimension == dimension.dimension);
            ResearchGapView {
                id: gap_id(project_id, &dimension.dimension),
                project_id: project_id.to_string(),
                dimension: dimension.dimension.clone(),
                trigger: gap.trigger.clone(),
                rule: gap.rule.clone(),
                detail: gap.detail.clone(),
                quality_sources_found: gap.quality_sources_found,
                coverage: gap.coverage,
                proposed_task: ProposedTaskView {
                    title: format!("Follow-up research: {}", dimension.dimension),
                    description: format!(
                        "Run another round of source search and extraction for '{}': \
                         target coverage >= {} and at least {} independent quality sources.",
                        dimension.dimension,
                        crate::coverage::GAP_COVERAGE_THRESHOLD,
                        crate::coverage::GAP_MIN_QUALITY_SOURCES
                    ),
                    dimension: dimension.dimension.clone(),
                },
                proposal_status: decision
                    .map(|decision| decision.status.clone())
                    .unwrap_or_else(|| "pending_approval".into()),
                created_task_id: decision.and_then(|decision| decision.created_task_id.clone()),
            }
        })
        .collect();
    Ok(GapReportView {
        project_id: project_id.to_string(),
        gaps,
        computed_at: crate::vault::format_rfc3339_utc(crate::ids::now_unix_ms()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::claims::{Claims, NewClaim};
    use crate::repositories::configs::{NewResearchConfig, ResearchConfigs};
    use crate::repositories::evidence::{Evidence, NewEvidence};
    use crate::repositories::gap_decisions::GapDecisions;
    use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};
    use crate::repositories::plans::{NewPlan, NewSection, NewTask, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::relations::{NewRelation, Relations};
    use crate::repositories::sources::{NewSource, Sources};
    use crate::repositories::tasks::Tasks;
    use crate::repositories::with_write_tx;

    fn seeded_project(conn: &mut Connection, dimensions: &[&str]) -> String {
        let project_id = with_write_tx(conn, |tx| {
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
        with_write_tx(conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: project_id.clone(),
                    dimensions: dimensions.iter().map(|d| d.to_string()).collect(),
                    ..Default::default()
                },
            )
            .map(|_| ())
        })
        .unwrap();
        project_id
    }

    fn add_plan_with_task(
        conn: &mut Connection,
        project_id: &str,
        task_title: &str,
        status: &str,
    ) -> (String, String) {
        with_write_tx(conn, |tx| {
            let config_id = ResearchConfigs::list_for_project(tx, project_id).unwrap()[0]
                .id
                .clone();
            let created = Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.to_string(),
                        research_config_id: config_id,
                        title: "T".into(),
                        rationale: "cover the dimensions".into(),
                    },
                    sections: vec![NewSection {
                        title: "theory section".into(),
                        order_index: 0,
                        summary: "why this section exists".into(),
                        dimension: "theory".into(),
                        objectives: vec!["collect sources".into()],
                    }],
                    tasks: vec![NewTask {
                        title: task_title.to_string(),
                        description: "task instructions".into(),
                        task_type: "search".into(),
                        idempotency_key: format!("key-{task_title}"),
                        section_index: Some(0),
                        depends_on: vec![],
                    }],
                },
            )
            .unwrap();
            Tasks::update_status(tx, &created.tasks[0].id, status).unwrap();
            Ok((created.plan.id.clone(), created.tasks[0].id.clone()))
        })
        .unwrap()
    }

    #[test]
    fn plan_view_projects_sections_tasks_and_metadata() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = seeded_project(&mut conn, &["theory"]);
        let (plan_id, _) = add_plan_with_task(&mut conn, &project_id, "theory survey", "PENDING");
        let plan = Plans::get(&conn, &plan_id).unwrap().unwrap();

        let view = plan_view(&conn, &plan).unwrap();
        assert_eq!(view.id, plan.id);
        assert_eq!(view.project_id, project_id);
        assert_eq!(view.status, "draft");
        assert_eq!(view.rationale, "cover the dimensions");
        assert_eq!(view.sections.len(), 1);
        let section = &view.sections[0];
        assert_eq!(section.title, "theory section");
        assert_eq!(section.dimension, "theory");
        assert_eq!(section.rationale, "why this section exists");
        assert_eq!(section.objectives, vec!["collect sources".to_string()]);
        assert_eq!(section.tasks.len(), 1);
        assert_eq!(section.tasks[0].kind, "search");
        assert_eq!(section.tasks[0].description, "task instructions");
        // Timestamps are UTC ISO-8601 strings, not epoch milliseconds.
        assert!(view.created_at.ends_with('Z'), "{}", view.created_at);
        assert!(view.updated_at.ends_with('Z'), "{}", view.updated_at);

        // A pre-003 section without a stored dimension falls back to its
        // title so the transport contract's non-empty dimension holds.
        with_write_tx(&mut conn, |tx| {
            tx.execute(
                "UPDATE sections SET dimension = '' WHERE plan_id = ?1",
                rusqlite::params![plan_id],
            )
            .map_err(CoreError::from)
        })
        .unwrap();
        let legacy_view = plan_view(&conn, &plan).unwrap();
        assert_eq!(legacy_view.sections[0].dimension, "theory section");
    }

    #[test]
    fn evidence_views_map_records_to_the_ipc_shape() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = seeded_project(&mut conn, &["theory"]);
        let source_id = with_write_tx(&mut conn, |tx| {
            Sources::upsert_by_canonical_url(
                tx,
                &NewSource {
                    project_id: project_id.clone(),
                    url: "https://example.com/a".into(),
                    canonical_url: "example.com/a".into(),
                    title: "A".into(),
                    source_type: "web".into(),
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap();
        let claim_id = with_write_tx(&mut conn, |tx| {
            Claims::insert(
                tx,
                &NewClaim {
                    id: None,
                    project_id: project_id.clone(),
                    subject: "S".into(),
                    predicate: "uses".into(),
                    object_value: "attention".into(),
                    scope: String::new(),
                    confidence: "medium".into(),
                    provenance: "run-1".into(),
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap();
        let evidence = with_write_tx(&mut conn, |tx| {
            Evidence::insert(
                tx,
                &NewEvidence {
                    id: None,
                    project_id: project_id.clone(),
                    source_id: source_id.clone(),
                    quote: "uses attention".into(),
                    value: String::new(),
                    locator: "p. 2".into(),
                    direction: "support".into(),
                },
            )
            .map(|(record, _)| record)
        })
        .unwrap();

        let views = evidence_views(&claim_id, &[evidence.clone()]);
        assert_eq!(views.len(), 1);
        let view = &views[0];
        assert_eq!(view.claim_id, claim_id);
        assert_eq!(view.source_id, source_id);
        assert_eq!(view.locator.kind, "page");
        assert_eq!(view.locator.value, "p. 2");
        assert_eq!(view.extraction_method, "llm_extraction");
        assert_eq!(view.direction, "support");
        assert!(view.retrieved_at.ends_with('Z'));

        // Bridge cases: URL-like locators, empty locators.
        let mut url_like = evidence.clone();
        url_like.id = "ev-url".into();
        url_like.locator = "https://example.com/a#x".into();
        let mut empty_locator = evidence.clone();
        empty_locator.id = "ev-empty".into();
        empty_locator.locator = String::new();
        let views = evidence_views(&claim_id, &[url_like, empty_locator]);
        assert_eq!(views[0].locator.kind, "url_fragment");
        assert_eq!(views[1].locator.kind, "quote");
        assert_eq!(views[1].locator.value, "uses attention");
    }

    #[test]
    fn graph_assembles_nodes_and_filters_foreign_endpoint_relations() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = seeded_project(&mut conn, &["theory"]);
        let other_id = seeded_project(&mut conn, &["market"]);

        let node = |conn: &mut Connection, project_id: &str, slug: &str, tags: &[&str]| {
            with_write_tx(conn, |tx| {
                KnowledgeNodes::upsert_by_slug(
                    tx,
                    &NewKnowledgeNode {
                        project_id: project_id.to_string(),
                        node_type: "Concept".into(),
                        title: slug.into(),
                        slug: slug.into(),
                        summary: String::new(),
                        confidence: "high".into(),
                        aliases: vec![],
                        tags: tags.iter().map(|t| t.to_string()).collect(),
                        source_ids: vec!["src-1".into()],
                        claim_ids: vec!["claim-1".into(), "claim-2".into()],
                    },
                )
                .map(|(record, _)| record.id)
            })
            .unwrap()
        };
        let n1 = node(&mut conn, &project_id, "transformer", &["theory"]);
        let n2 = node(&mut conn, &project_id, "attention", &[]);
        let foreign = node(&mut conn, &other_id, "foreign", &[]);

        // One edge inside the project; one edge of this project pointing at
        // another project's node (FKs allow it) must be filtered out.
        for (from, to, key) in [
            (n1.clone(), n2.clone(), "r-1"),
            (n1.clone(), foreign, "r-2"),
        ] {
            with_write_tx(&mut conn, |tx| {
                Relations::insert(
                    tx,
                    &NewRelation {
                        id: Some(key.into()),
                        project_id: project_id.clone(),
                        from_node_id: from,
                        to_node_id: to,
                        relation_type: "derives_from".into(),
                        confidence: "high".into(),
                    },
                )
                .map(|_| ())
            })
            .unwrap();
        }

        let projection = graph(&conn, &project_id).unwrap();
        assert_eq!(projection.project_id, project_id);
        assert_eq!(projection.nodes.len(), 2);
        let first = &projection.nodes[0];
        assert_eq!(first.node_type, "Concept");
        assert_eq!(first.confidence, "high");
        assert_eq!(first.dimension, "theory");
        assert_eq!(first.source_count, 1);
        assert_eq!(first.claim_count, 2);
        assert_eq!(first.year, None);
        let serialized = serde_json::to_value(first).unwrap();
        assert_eq!(
            serialized["type"], "Concept",
            "node type serializes under the contract's `type` key"
        );
        let untagged = &projection.nodes[1];
        assert_eq!(untagged.dimension, "");
        assert_eq!(projection.relations.len(), 1);
        let relation = &projection.relations[0];
        assert_eq!(relation.source_node_id, n1);
        assert_eq!(relation.target_node_id, n2);
        assert_eq!(relation.predicate, "derives_from");
        assert_eq!(relation.confidence, 0.8);

        let err = graph(&conn, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn gap_report_mirrors_the_mock_rules_and_decision_merge() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = seeded_project(&mut conn, &["theory"]);

        // No tasks at all: no gaps (plan review is the primary action).
        let empty = gap_report(&conn, &project_id).unwrap();
        assert!(empty.gaps.is_empty());
        assert!(empty.computed_at.ends_with('Z'));

        // One PENDING theory task: coverage stays low, the gap fires.
        add_plan_with_task(&mut conn, &project_id, "theory survey", "PENDING");
        let report = gap_report(&conn, &project_id).unwrap();
        assert_eq!(report.gaps.len(), 1);
        let gap = &report.gaps[0];
        assert_eq!(gap.id, format!("gap:{project_id}:theory"));
        assert_eq!(gap.dimension, "theory");
        assert_eq!(gap.trigger, "coverage_below_threshold");
        assert_eq!(gap.proposal_status, "pending_approval");
        assert_eq!(gap.created_task_id, None);
        assert_eq!(gap.proposed_task.dimension, "theory");
        assert!(!gap.proposed_task.title.is_empty());
        assert!(!gap.proposed_task.description.is_empty());

        // An approval decision surfaces on the same stable gap id.
        let (_, task_id) =
            add_plan_with_task(&mut conn, &project_id, "follow-up theory", "PENDING");
        with_write_tx(&mut conn, |tx| {
            GapDecisions::upsert(tx, &project_id, "theory", "approved", Some(&task_id)).map(|_| ())
        })
        .unwrap();
        let report = gap_report(&conn, &project_id).unwrap();
        assert_eq!(report.gaps.len(), 1);
        assert_eq!(report.gaps[0].proposal_status, "approved");
        assert_eq!(
            report.gaps[0].created_task_id.as_deref(),
            Some(task_id.as_str())
        );

        // A dismissal hides the dimension entirely.
        with_write_tx(&mut conn, |tx| {
            GapDecisions::upsert(tx, &project_id, "theory", "dismissed", None).map(|_| ())
        })
        .unwrap();
        let report = gap_report(&conn, &project_id).unwrap();
        assert!(report.gaps.is_empty());

        let err = gap_report(&conn, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn confidence_scores_cover_every_state_monotonically() {
        assert_eq!(confidence_to_score("confirmed"), 1.0);
        assert_eq!(confidence_to_score("high"), 0.8);
        assert_eq!(confidence_to_score("medium"), 0.6);
        assert_eq!(confidence_to_score("low"), 0.4);
        assert_eq!(confidence_to_score("unverified"), 0.2);
        assert_eq!(confidence_to_score("conflicting"), 0.5);
        assert_eq!(confidence_to_score("anything-else"), 0.2);
    }

    #[test]
    fn gap_views_serialize_with_contract_field_names() {
        let view = ResearchGapView {
            id: "gap:p:theory".into(),
            project_id: "p".into(),
            dimension: "theory".into(),
            trigger: "coverage_below_threshold".into(),
            rule: "coverage 0.10 below 0.6".into(),
            detail: "detail".into(),
            quality_sources_found: 0,
            coverage: 0.1,
            proposed_task: ProposedTaskView {
                title: "t".into(),
                description: "d".into(),
                dimension: "theory".into(),
            },
            proposal_status: "pending_approval".into(),
            created_task_id: None,
        };
        let json = serde_json::to_value(&view).unwrap();
        assert_eq!(json["proposal_status"], "pending_approval");
        assert_eq!(json["quality_sources_found"], 0);
        assert_eq!(json["proposed_task"]["dimension"], "theory");
        assert_eq!(json["created_task_id"], serde_json::Value::Null);
    }

    #[test]
    fn gap_id_is_stable_and_namespaced() {
        assert_eq!(gap_id("p1", "theory"), "gap:p1:theory");
        assert_eq!(gap_id("p1", "market"), "gap:p1:market");
        assert_ne!(gap_id("p1", "theory"), gap_id("p2", "theory"));
    }

    #[test]
    fn research_config_view_maps_the_persisted_record_shape() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = seeded_project(&mut conn, &["theory"]);
        let record = with_write_tx(&mut conn, |tx| {
            crate::repositories::configs::ResearchConfigs::insert(
                tx,
                &crate::repositories::configs::NewResearchConfig {
                    project_id: project_id.clone(),
                    domain: "AI".into(),
                    topic: "LLM scaling".into(),
                    purpose: "research".into(),
                    audience: "analysts".into(),
                    depth: 3,
                    time_range_from: Some(1_700_000_000_123),
                    time_range_to: None,
                    geographic_scope: "global".into(),
                    languages: vec!["en".into(), "zh".into()],
                    source_types: vec!["paper".into()],
                    source_domains: vec!["arxiv.org".into()],
                    ..Default::default()
                },
            )
        })
        .unwrap();

        let view = research_config_view(&record);
        assert_eq!(view.schema_version, "1.0");
        assert_eq!(view.config_id, record.id);
        assert_eq!(view.project_id, project_id);
        assert_eq!(view.purpose, "research");
        assert_eq!(view.depth, 3);
        assert_eq!(
            view.time_range.from.as_deref(),
            Some("2023-11-14T22:13:20.123Z")
        );
        assert_eq!(view.time_range.to, None);
        assert!(view.created_at.ends_with('Z'), "{}", view.created_at);
        assert!(view.updated_at.ends_with('Z'), "{}", view.updated_at);

        // The wire shape matches the frontend contract's field names, and
        // time_range is always an object (never bare null) even unbounded.
        let json = serde_json::to_value(&research_config_view(
            &crate::repositories::configs::ResearchConfigRecord {
                time_range_from: None,
                time_range_to: None,
                ..record.clone()
            },
        ))
        .unwrap();
        assert_eq!(
            json["time_range"],
            serde_json::json!({"from": null, "to": null})
        );
        assert_eq!(json["config_id"], record.id);
        assert_eq!(json["update_frequency"], "manual");
    }
}
