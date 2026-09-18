//! Coverage and gap projection (PRD §14) computed in Rust from repositories.
//!
//! Behavioral reference: `apps/desktop/src/services/mocks/projections.ts` —
//! the UI contract is stable and this module applies the same documented
//! rules:
//!
//! * `coverage = 0.4 * task completion + 0.3 * knowledge breadth
//!            + 0.2 * evidence density + 0.1 * source diversity`
//! * per dimension: knowledge breadth = distinct node types / 5 (capped at
//!   1), evidence density = claims with support evidence / 5 (capped),
//!   source diversity = distinct source types / 3 (capped);
//! * a gap is a dimension with coverage < 0.6 or fewer than 2 independent
//!   quality sources (quality_score >= 0.7; distinct canonical domains are
//!   the independence proxy).
//!
//! The repository schema does not yet carry the frontend mock's per-entity
//! `dimension` column, so dimension attribution uses documented bridges: a
//! knowledge node belongs to a dimension through its `tags`, a source
//! through the nodes referencing it, a claim through its nodes' `claim_ids`,
//! and a task through its title/idempotency key naming the dimension. These
//! bridges are replaced when the frozen research-task/source contracts land.

use crate::error::CoreError;
use crate::repositories::claims::Claims;
use crate::repositories::configs::ResearchConfigs;
use crate::repositories::evidence::Evidence;
use crate::repositories::knowledge::KnowledgeNodes;
use crate::repositories::plans::Plans;
use crate::repositories::projects::Projects;
use crate::repositories::sources::Sources;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// PRD §14 weights.
pub const WEIGHT_TASK_COMPLETION: f64 = 0.4;
pub const WEIGHT_KNOWLEDGE_BREADTH: f64 = 0.3;
pub const WEIGHT_EVIDENCE_DENSITY: f64 = 0.2;
pub const WEIGHT_SOURCE_DIVERSITY: f64 = 0.1;

/// A dimension is a gap below this coverage.
pub const GAP_COVERAGE_THRESHOLD: f64 = 0.6;
/// ... or with fewer than this many independent quality sources.
pub const GAP_MIN_QUALITY_SOURCES: usize = 2;
/// A quality source scores at least this (mirrors the frontend threshold).
pub const QUALITY_SOURCE_THRESHOLD: f64 = 0.7;

/// Distinct node types needed for full per-dimension knowledge breadth.
const KNOWLEDGE_BREADTH_TARGET: f64 = 5.0;
/// Claims with support evidence needed for full per-dimension density.
const EVIDENCE_DENSITY_TARGET: f64 = 5.0;
/// Distinct source types needed for full per-dimension diversity.
const SOURCE_DIVERSITY_TARGET: f64 = 3.0;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoverageReport {
    pub project_id: String,
    /// Weighted project-level coverage in [0, 1].
    pub overall: f64,
    /// Project-level components behind `overall` (the same weights).
    pub components: CoverageComponents,
    pub dimensions: Vec<DimensionCoverage>,
    /// Project-level gap reasons, mirroring the per-dimension rules.
    pub gaps: Vec<GapReport>,
    /// Unix epoch milliseconds (UTC) of this computation.
    pub computed_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CoverageComponents {
    pub task_completion: f64,
    pub knowledge_breadth: f64,
    pub evidence_density: f64,
    pub source_diversity: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DimensionCoverage {
    pub dimension: String,
    pub coverage: f64,
    pub components: CoverageComponents,
    pub tasks_total: usize,
    pub tasks_completed: usize,
    pub knowledge_nodes: usize,
    pub evidence_items: usize,
    pub quality_sources: usize,
    pub source_types: Vec<String>,
    pub reasons: Vec<String>,
    pub gap: Option<GapReport>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GapReport {
    pub dimension: String,
    pub trigger: String,
    pub rule: String,
    pub detail: String,
    pub quality_sources_found: usize,
    pub coverage: f64,
}

/// Computes the coverage report for a project from its repositories.
pub fn compute(conn: &Connection, project_id: &str) -> Result<CoverageReport, CoreError> {
    if Projects::get(conn, project_id)?.is_none() {
        return Err(CoreError::database(format!(
            "project '{project_id}' not found"
        )));
    }

    // Configured dimensions: the project's latest research configuration
    // owns the dimension list (list_for_project orders by created_at).
    let configs = ResearchConfigs::list_for_project(conn, project_id)?;
    let dimensions: Vec<String> = configs
        .last()
        .map(|config| config.dimensions.clone())
        .unwrap_or_default();

    let tasks = project_tasks(conn, project_id)?;
    let nodes = KnowledgeNodes::list_for_project(conn, project_id)?;
    let claims = Claims::list_for_project(conn, project_id)?;
    let sources = Sources::list_for_project(conn, project_id)?;
    // Claims carrying at least one *support* evidence item.
    let mut supported_claims: HashSet<String> = HashSet::new();
    for claim in &claims {
        for evidence in Evidence::list_for_claim(conn, &claim.id)? {
            if evidence.direction == "support" {
                supported_claims.insert(claim.id.clone());
                break;
            }
        }
    }

    let task_completion = completion_ratio(tasks.iter());
    let knowledge_breadth = if dimensions.is_empty() {
        0.0
    } else {
        let covered = dimensions
            .iter()
            .filter(|dimension| nodes.iter().any(|node| node_in_dimension(node, dimension)))
            .count();
        (covered as f64) / (dimensions.len() as f64)
    };
    let evidence_density = if claims.is_empty() {
        0.0
    } else {
        (supported_claims.len() as f64) / (claims.len() as f64)
    };
    let source_diversity = if sources.is_empty() {
        0.0
    } else {
        (distinct_domains(&sources).len() as f64) / (sources.len() as f64)
    };
    let components = CoverageComponents {
        task_completion: round4(task_completion),
        knowledge_breadth: round4(knowledge_breadth),
        evidence_density: round4(evidence_density),
        source_diversity: round4(source_diversity),
    };
    let overall = round4(
        WEIGHT_TASK_COMPLETION * task_completion
            + WEIGHT_KNOWLEDGE_BREADTH * knowledge_breadth
            + WEIGHT_EVIDENCE_DENSITY * evidence_density
            + WEIGHT_SOURCE_DIVERSITY * source_diversity,
    );

    let mut dimension_reports = Vec::with_capacity(dimensions.len());
    let mut gaps = Vec::new();
    for dimension in &dimensions {
        let report = dimension_report(
            dimension,
            &tasks,
            &nodes,
            &claims,
            &supported_claims,
            &sources,
        );
        if let Some(gap) = &report.gap {
            gaps.push(gap.clone());
        }
        dimension_reports.push(report);
    }

    Ok(CoverageReport {
        project_id: project_id.to_string(),
        overall,
        components,
        dimensions: dimension_reports,
        gaps,
        computed_at: crate::ids::now_unix_ms(),
    })
}

#[allow(clippy::too_many_arguments)]
fn dimension_report(
    dimension: &str,
    tasks: &[crate::repositories::plans::TaskRecord],
    nodes: &[crate::repositories::knowledge::KnowledgeNodeRecord],
    claims: &[crate::repositories::claims::ClaimRecord],
    supported_claims: &HashSet<String>,
    sources: &[crate::repositories::sources::SourceRecord],
) -> DimensionCoverage {
    let dim_nodes: Vec<_> = nodes
        .iter()
        .filter(|node| node_in_dimension(node, dimension))
        .collect();
    let dim_tasks: Vec<_> = tasks
        .iter()
        .filter(|task| task_in_dimension(task, dimension))
        .collect();
    let dim_claim_ids: HashSet<&str> = dim_nodes
        .iter()
        .flat_map(|node| node.claim_ids.iter())
        .map(String::as_str)
        .collect();
    let dim_claims: Vec<_> = claims
        .iter()
        .filter(|claim| dim_claim_ids.contains(claim.id.as_str()))
        .collect();
    let dim_source_ids: HashSet<&str> = dim_nodes
        .iter()
        .flat_map(|node| node.source_ids.iter())
        .map(String::as_str)
        .collect();
    let dim_sources: Vec<_> = sources
        .iter()
        .filter(|source| dim_source_ids.contains(source.id.as_str()))
        .collect();

    let tasks_total = dim_tasks.len();
    let tasks_completed = dim_tasks
        .iter()
        .filter(|task| task.status == "COMPLETED")
        .count();
    let task_completion = completion_ratio(dim_tasks.iter().copied());

    let node_types: HashSet<&str> = dim_nodes
        .iter()
        .map(|node| node.node_type.as_str())
        .collect();
    let knowledge_breadth = (node_types.len() as f64 / KNOWLEDGE_BREADTH_TARGET).min(1.0);

    let claims_with_support = dim_claims
        .iter()
        .filter(|claim| supported_claims.contains(&claim.id))
        .count();
    let evidence_density = (claims_with_support as f64 / EVIDENCE_DENSITY_TARGET).min(1.0);
    let evidence_items: usize = dim_claims
        .iter()
        .map(|claim| match supported_claims.contains(&claim.id) {
            true => 1,
            false => 0,
        })
        .sum();

    let source_types: Vec<String> = {
        let mut types: Vec<String> = dim_sources
            .iter()
            .map(|source| source.source_type.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        types.sort();
        types
    };
    let source_diversity = (source_types.len() as f64 / SOURCE_DIVERSITY_TARGET).min(1.0);
    let quality_sources = dim_sources
        .iter()
        .filter(|source| source.quality_score.unwrap_or(0.0) >= QUALITY_SOURCE_THRESHOLD)
        .map(|source| source_domain(source))
        .collect::<HashSet<_>>()
        .len();

    let coverage = round4(
        WEIGHT_TASK_COMPLETION * task_completion
            + WEIGHT_KNOWLEDGE_BREADTH * knowledge_breadth
            + WEIGHT_EVIDENCE_DENSITY * evidence_density
            + WEIGHT_SOURCE_DIVERSITY * source_diversity,
    );

    let reasons = vec![
        if tasks_total > 0 {
            format!("Task completion {tasks_completed}/{tasks_total}.")
        } else {
            "No research tasks for this dimension yet.".to_string()
        },
        format!(
            "Knowledge breadth covers {}/{} node types ({} nodes).",
            node_types.len(),
            KNOWLEDGE_BREADTH_TARGET as usize,
            dim_nodes.len()
        ),
        format!(
            "Evidence density {claims_with_support}/{} claims with support evidence.",
            EVIDENCE_DENSITY_TARGET as usize
        ),
        format!(
            "Source diversity {}/{} source types ({} sources).",
            source_types.len(),
            SOURCE_DIVERSITY_TARGET as usize,
            dim_sources.len()
        ),
    ];

    let coverage_below = coverage < GAP_COVERAGE_THRESHOLD;
    let sources_below = quality_sources < GAP_MIN_QUALITY_SOURCES;
    let gap = if coverage_below || sources_below {
        let trigger = if coverage_below {
            "coverage_below_threshold"
        } else {
            "insufficient_quality_sources"
        };
        Some(GapReport {
            dimension: dimension.to_string(),
            trigger: trigger.to_string(),
            rule: format!(
                "coverage {coverage:.2} below {GAP_COVERAGE_THRESHOLD}; \
                 independent quality sources {quality_sources} < {GAP_MIN_QUALITY_SOURCES}"
            ),
            detail: format!(
                "Propose additional search and extraction tasks for '{dimension}' \
                 to raise coverage and independent quality sources."
            ),
            quality_sources_found: quality_sources,
            coverage,
        })
    } else {
        None
    };

    DimensionCoverage {
        dimension: dimension.to_string(),
        coverage,
        components: CoverageComponents {
            task_completion: round4(task_completion),
            knowledge_breadth: round4(knowledge_breadth),
            evidence_density: round4(evidence_density),
            source_diversity: round4(source_diversity),
        },
        tasks_total,
        tasks_completed,
        knowledge_nodes: dim_nodes.len(),
        evidence_items,
        quality_sources,
        source_types,
        reasons,
        gap,
    }
}

/// Every task of every plan in the project.
fn project_tasks(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<crate::repositories::plans::TaskRecord>, CoreError> {
    let mut tasks = Vec::new();
    for plan in Plans::list_for_project(conn, project_id)? {
        tasks.extend(Plans::tasks_for_plan(conn, &plan.id)?);
    }
    Ok(tasks)
}

fn completion_ratio<'a>(
    tasks: impl IntoIterator<Item = &'a crate::repositories::plans::TaskRecord>,
) -> f64 {
    let mut total = 0_usize;
    let mut completed = 0_usize;
    for task in tasks {
        total += 1;
        if task.status == "COMPLETED" {
            completed += 1;
        }
    }
    if total == 0 {
        0.0
    } else {
        (completed as f64) / (total as f64)
    }
}

/// Dimension attribution bridges (documented in the module docstring).
fn node_in_dimension(
    node: &crate::repositories::knowledge::KnowledgeNodeRecord,
    dimension: &str,
) -> bool {
    let lowered = dimension.to_ascii_lowercase();
    node.tags
        .iter()
        .any(|tag| tag.to_ascii_lowercase() == lowered)
}

fn task_in_dimension(task: &crate::repositories::plans::TaskRecord, dimension: &str) -> bool {
    let lowered = dimension.to_ascii_lowercase();
    task.title.to_ascii_lowercase().contains(&lowered)
        || task.idempotency_key.to_ascii_lowercase().contains(&lowered)
}

fn source_domain(source: &crate::repositories::sources::SourceRecord) -> String {
    source
        .canonical_url
        .split('/')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn distinct_domains(sources: &[crate::repositories::sources::SourceRecord]) -> HashSet<String> {
    sources.iter().map(source_domain).collect()
}

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::claims::{Claims, NewClaim};
    use crate::repositories::configs::{NewResearchConfig, ResearchConfigs};
    use crate::repositories::evidence::{Evidence, NewEvidence};
    use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};
    use crate::repositories::plans::{NewPlan, NewTask, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::sources::{NewSource, Sources};
    use crate::repositories::with_write_tx;
    use rusqlite::Connection;

    struct Seed {
        conn: Connection,
        project_id: String,
    }

    /// Creates a project configured with one dimension ("theory") and empty
    /// repositories; tests layer data on top.
    fn seeded() -> Seed {
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
        with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: project_id.clone(),
                    domain: "AI".into(),
                    topic: "scaling".into(),
                    dimensions: vec!["theory".into()],
                    ..Default::default()
                },
            )
            .map(|_| ())
        })
        .unwrap();
        Seed { conn, project_id }
    }

    fn add_node(conn: &mut Connection, project_id: &str, node_type: &str, tags: &[&str]) -> String {
        with_write_tx(conn, |tx| {
            KnowledgeNodes::upsert_by_slug(
                tx,
                &NewKnowledgeNode {
                    id: None,
                    project_id: project_id.to_string(),
                    node_type: node_type.to_string(),
                    title: format!("{node_type}-1"),
                    slug: format!("{node_type}-1"),
                    summary: String::new(),
                    confidence: "unverified".into(),
                    aliases: vec![],
                    tags: tags.iter().map(|tag| tag.to_string()).collect(),
                    source_ids: vec![],
                    claim_ids: vec![],
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap()
    }

    fn add_source(
        conn: &mut Connection,
        project_id: &str,
        canonical: &str,
        source_type: &str,
        quality: Option<f64>,
    ) -> String {
        let id = with_write_tx(conn, |tx| {
            Sources::upsert_by_canonical_url(
                tx,
                &NewSource {
                    project_id: project_id.to_string(),
                    url: format!("https://example.com/{canonical}"),
                    canonical_url: canonical.to_string(),
                    title: canonical.to_string(),
                    source_type: source_type.to_string(),
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap();
        if let Some(quality) = quality {
            with_write_tx(conn, |tx| {
                tx.execute(
                    "UPDATE sources SET quality_score = ?2 WHERE id = ?1",
                    rusqlite::params![id, quality],
                )
                .map_err(CoreError::from)
            })
            .unwrap();
        }
        id
    }

    fn add_task(conn: &mut Connection, project_id: &str, title: &str, status: &str) {
        let task_id = with_write_tx(conn, |tx| {
            let config_id = ResearchConfigs::list_for_project(tx, project_id).unwrap()[0]
                .id
                .clone();
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.to_string(),
                        research_config_id: config_id,
                        title: "T".into(),
                        rationale: String::new(),
                    },
                    sections: vec![],
                    tasks: vec![NewTask {
                        title: title.to_string(),
                        description: String::new(),
                        task_type: "search".into(),
                        idempotency_key: format!("key-{title}"),
                        section_index: None,
                        depends_on: vec![],
                    }],
                },
            )
            .map(|created| created.tasks[0].id.clone())
        })
        .unwrap();
        with_write_tx(conn, |tx| {
            crate::repositories::tasks::Tasks::update_status(tx, &task_id, status).map(|_| ())
        })
        .unwrap();
    }

    #[test]
    fn empty_project_reports_zero_coverage() {
        let seed = seeded();
        let report = compute(&seed.conn, &seed.project_id).unwrap();
        assert_eq!(report.overall, 0.0);
        assert_eq!(report.dimensions.len(), 1);
        assert_eq!(report.dimensions[0].dimension, "theory");
        assert!(report.dimensions[0].gap.is_some(), "0.0 < 0.6 is a gap");
        assert_eq!(
            report.dimensions[0].gap.as_ref().unwrap().trigger,
            "coverage_below_threshold"
        );
    }

    #[test]
    fn unknown_project_is_a_structured_error() {
        let seed = seeded();
        let err = compute(&seed.conn, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn weights_match_the_prd_formula() {
        let mut seed = seeded();
        let project_id = seed.project_id.clone();
        // theory task completed -> task completion 1.0 (weight 0.4)
        add_task(&mut seed.conn, &project_id, "theory survey", "COMPLETED");
        let report = compute(&seed.conn, &seed.project_id).unwrap();
        assert_eq!(report.components.task_completion, 1.0);
        assert_eq!(report.overall, 0.4, "only the task component contributes");

        // A theory-tagged node covers the dimension -> knowledge breadth 1.0.
        add_node(&mut seed.conn, &seed.project_id, "Concept", &["theory"]);
        let report = compute(&seed.conn, &seed.project_id).unwrap();
        assert_eq!(report.components.knowledge_breadth, 1.0);
        assert!((report.overall - 0.7).abs() < 1e-9);
    }

    #[test]
    fn per_dimension_components_follow_the_mock_semantics() {
        let mut seed = seeded();
        // Two node types + one claim with support evidence + one source.
        let claim_node = add_node(&mut seed.conn, &seed.project_id, "Concept", &["theory"]);
        add_node(&mut seed.conn, &seed.project_id, "Paper", &["theory"]);
        let source_id = add_source(
            &mut seed.conn,
            &seed.project_id,
            "arxiv.org/1",
            "paper",
            Some(0.9),
        );
        let claim_id = with_write_tx(&mut seed.conn, |tx| {
            Claims::insert(
                tx,
                &NewClaim {
                    id: None,
                    project_id: seed.project_id.clone(),
                    subject: "Scaling".into(),
                    predicate: "follows".into(),
                    object_value: "power law".into(),
                    scope: String::new(),
                    confidence: "medium".into(),
                    provenance: "run-1".into(),
                    status: "draft".into(),
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap();
        let evidence_id = with_write_tx(&mut seed.conn, |tx| {
            Evidence::insert(
                tx,
                &NewEvidence {
                    id: None,
                    project_id: seed.project_id.clone(),
                    source_id: source_id.clone(),
                    quote: "scaling follows a power law".into(),
                    value: String::new(),
                    locator: "p.1".into(),
                    locator_detail: String::new(),
                    retrieved_at: 1,
                    direction: "support".into(),
                },
            )
            .map(|(record, _)| record.id)
        })
        .unwrap();
        with_write_tx(&mut seed.conn, |tx| {
            crate::repositories::claims::ClaimEvidence::link(tx, &claim_id, &evidence_id)
        })
        .unwrap();
        // Link node -> claim and node -> source for dimension attribution.
        with_write_tx(&mut seed.conn, |tx| {
            tx.execute(
                "UPDATE knowledge_nodes SET claim_ids = ?2, source_ids = ?3 WHERE id = ?1",
                rusqlite::params![
                    claim_node,
                    format!(r#"["{claim_id}"]"#),
                    format!(r#"["{source_id}"]"#)
                ],
            )
            .map_err(CoreError::from)
        })
        .unwrap();

        let report = compute(&seed.conn, &seed.project_id).unwrap();
        let dimension = &report.dimensions[0];
        assert_eq!(dimension.knowledge_nodes, 2);
        assert_eq!(dimension.components.knowledge_breadth, 0.4, "2 of 5 types");
        assert_eq!(dimension.components.evidence_density, 0.2, "1 of 5 claims");
        assert_eq!(
            dimension.components.source_diversity, 0.3333,
            "1 of 3 types"
        );
        assert_eq!(dimension.quality_sources, 1, "one 0.9-quality domain");
        // Coverage is low (no tasks), so the coverage rule fires first; both
        // rule texts still appear (mirrors projections.ts rule joining).
        let gap = dimension.gap.as_ref().unwrap();
        assert_eq!(gap.trigger, "coverage_below_threshold");
        assert!(gap.rule.contains("independent quality sources"));
        // Evidence density feeds the overall ratio too.
        assert_eq!(
            report.components.evidence_density, 1.0,
            "the claim has support"
        );
    }

    #[test]
    fn good_coverage_with_few_quality_sources_gaps_on_sources() {
        let mut seed = seeded();
        let project_id = seed.project_id.clone();
        add_task(&mut seed.conn, &project_id, "theory survey", "COMPLETED");
        for node_type in ["Concept", "Person", "Paper", "Technology", "Event"] {
            add_node(&mut seed.conn, &seed.project_id, node_type, &["theory"]);
        }
        let source_id = add_source(
            &mut seed.conn,
            &seed.project_id,
            "a.org/1",
            "paper",
            Some(0.9),
        );
        let node = add_node(&mut seed.conn, &seed.project_id, "Concept", &["theory"]);
        with_write_tx(&mut seed.conn, |tx| {
            tx.execute(
                "UPDATE knowledge_nodes SET source_ids = ?2 WHERE id = ?1",
                rusqlite::params![node, format!(r#"["{source_id}"]"#)],
            )
            .map_err(CoreError::from)
        })
        .unwrap();

        let report = compute(&seed.conn, &seed.project_id).unwrap();
        let dimension = &report.dimensions[0];
        // 0.4 (tasks) + 0.3 (5/5 types) = 0.7 >= 0.6, but only 1 quality source.
        assert!(dimension.coverage >= GAP_COVERAGE_THRESHOLD);
        let gap = dimension.gap.as_ref().expect("gap from the source rule");
        assert_eq!(gap.trigger, "insufficient_quality_sources");
        assert_eq!(gap.quality_sources_found, 1);
    }

    #[test]
    fn healthy_dimension_has_no_gap() {
        let mut seed = seeded();
        let project_id = seed.project_id.clone();
        add_task(&mut seed.conn, &project_id, "theory survey", "COMPLETED");
        for node_type in ["Concept", "Person", "Paper"] {
            add_node(&mut seed.conn, &seed.project_id, node_type, &["theory"]);
        }
        let source_id = add_source(
            &mut seed.conn,
            &seed.project_id,
            "a.org/1",
            "paper",
            Some(0.8),
        );
        let source2 = add_source(
            &mut seed.conn,
            &seed.project_id,
            "b.org/1",
            "web",
            Some(0.9),
        );
        // Attach both quality sources to the theory nodes.
        let node = add_node(&mut seed.conn, &seed.project_id, "Technology", &["theory"]);
        with_write_tx(&mut seed.conn, |tx| {
            tx.execute(
                "UPDATE knowledge_nodes SET source_ids = ?2 WHERE id = ?1",
                rusqlite::params![node, format!(r#"["{source_id}","{source2}"]"#)],
            )
            .map_err(CoreError::from)
        })
        .unwrap();

        let report = compute(&seed.conn, &seed.project_id).unwrap();
        let dimension = &report.dimensions[0];
        assert_eq!(
            dimension.quality_sources, 2,
            "two independent quality domains"
        );
        // 0.4 (tasks) + 0.3*(4/5) + 0.1*(2/3) = 0.6467 >= 0.6.
        assert!(dimension.coverage >= GAP_COVERAGE_THRESHOLD);
        assert!(dimension.gap.is_none(), "no gap rule fires");
        assert!(report.gaps.is_empty());
    }
}
