//! Research result ingestion (ADR-024): worker-validated domain records in,
//! transactional SQLite writes out.
//!
//! The worker's `GET /jobs/{id}/results` returns every record its result sink
//! collected. This module is the Rust half of the handoff: each record is
//! re-validated through typed serde structs mirroring the worker's pydantic
//! models (unknown fields rejected), then written through the repositories
//! inside ONE write transaction per batch. Identity rules:
//!
//! * sources upsert by `(project, canonical_url)`; the worker's source ids
//!   map onto the core ids and every later reference (evidence `source_id`,
//!   node `source_ids`) is translated through that map;
//! * knowledge nodes upsert by `(project, slug)` with the worker's node id
//!   kept as BOTH id and slug, so relations (which reference worker node
//!   ids) satisfy their foreign keys verbatim;
//! * claims, evidence, and relations keep their worker-minted ids and are
//!   idempotent by primary key — re-ingesting the same batch changes
//!   nothing.
//!
//! V0.1 persists the traceability chain `source → source-content → node →
//! relation → claim → evidence (+ claim_evidence)`. `extraction`, `dropped`,
//! and the report kinds stay in the worker payload and event log only.

use crate::error::CoreError;
use crate::repositories::claims::{ClaimEvidence, Claims, NewClaim};
use crate::repositories::evidence::{Evidence, NewEvidence};
use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};
use crate::repositories::relations::{NewRelation, Relations};
use crate::repositories::sources::{NewSource, SourceContents, Sources};
use crate::repositories::with_write_tx;
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Wire shapes (strict mirrors of the worker's pydantic models)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ResultsEnvelopeWire {
    #[allow(dead_code)]
    schema_version: String,
    #[allow(dead_code)]
    job_id: String,
    #[serde(default)]
    records: Vec<RecordWire>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RecordWire {
    kind: String,
    record: Value,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SourceWire {
    source_id: String,
    url: String,
    canonical_url: String,
    // Wire-completeness fields: parsing them enforces the strict shape; the
    // ingestion itself reads the canonical identity and the quality only.
    #[serde(default)]
    #[allow(dead_code)]
    url_dedup_key: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    source_type: String,
    #[serde(default)]
    #[allow(dead_code)]
    found_via: String,
    #[serde(default)]
    #[allow(dead_code)]
    published_at: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    retrieved_at: String,
    #[serde(default)]
    #[allow(dead_code)]
    snippet: String,
    #[serde(default)]
    quality: Option<Value>,
    #[serde(default)]
    #[allow(dead_code)]
    metadata: Value,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SourceContentWire {
    source_id: String,
    #[serde(default)]
    #[allow(dead_code)]
    url_dedup_key: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    content_type: String,
    #[serde(default)]
    fingerprint: String,
    #[serde(default)]
    fetched_at: String,
    #[serde(default)]
    #[allow(dead_code)]
    locator_base: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct NodeWire {
    node_id: String,
    #[serde(rename = "type")]
    node_type: String,
    title: String,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    #[allow(dead_code)]
    status: String,
    #[serde(default)]
    confidence: String,
    #[serde(default)]
    source_ids: Vec<String>,
    #[serde(default)]
    claim_ids: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    provenance: Value,
    #[serde(default)]
    #[allow(dead_code)]
    created_at: String,
    #[serde(default)]
    #[allow(dead_code)]
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RelationWire {
    relation_id: String,
    subject_node_id: String,
    #[serde(default)]
    predicate: String,
    object_node_id: String,
    #[serde(default)]
    #[allow(dead_code)]
    direction: String,
    #[serde(default)]
    confidence: String,
    #[serde(default)]
    #[allow(dead_code)]
    provenance: Value,
    #[serde(default)]
    #[allow(dead_code)]
    status: String,
    #[serde(default)]
    #[allow(dead_code)]
    created_at: String,
    #[serde(default)]
    #[allow(dead_code)]
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ClaimWire {
    claim_id: String,
    subject_node_id: String,
    #[serde(default)]
    predicate: String,
    #[serde(default)]
    object_value: String,
    #[serde(default)]
    #[allow(dead_code)]
    object_node_id: Option<String>,
    #[serde(default)]
    scope: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    confidence: String,
    #[serde(default)]
    #[allow(dead_code)]
    evidence_ids: Vec<String>,
    #[serde(default)]
    provenance: Value,
    #[serde(default)]
    #[allow(dead_code)]
    review_state: String,
    #[serde(default)]
    #[allow(dead_code)]
    created_at: String,
    #[serde(default)]
    #[allow(dead_code)]
    updated_at: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct EvidenceLocatorWire {
    #[serde(default)]
    quote: Option<String>,
    #[serde(default)]
    section: Option<String>,
    #[serde(default)]
    url_fragment: Option<String>,
    #[serde(default)]
    position: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    retrieved_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EvidenceWire {
    evidence_id: String,
    claim_id: String,
    source_id: String,
    #[serde(default)]
    locator: EvidenceLocatorWire,
    #[serde(default)]
    #[allow(dead_code)]
    extraction_method: String,
    #[serde(default)]
    direction: String,
    #[serde(default)]
    #[allow(dead_code)]
    confidence: Option<f64>,
    #[serde(default)]
    #[allow(dead_code)]
    created_at: String,
}

/// Per-batch outcome, surfaced in logs and tests.
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct IngestStats {
    pub sources: u64,
    pub source_contents: u64,
    pub nodes: u64,
    pub relations: u64,
    pub claims: u64,
    pub evidence: u64,
    pub skipped: u64,
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

pub struct ResultIngestion;

/// Worker source_type vocabulary (Python `SourceType`), mapped onto the
/// core's stored spelling (identical apart from validation).
fn valid_source_type(value: &str) -> Result<&str, CoreError> {
    const TYPES: [&str; 10] = [
        "web_page",
        "paper",
        "book",
        "documentation",
        "news",
        "blog",
        "forum",
        "dataset",
        "video",
        "other",
    ];
    if TYPES.contains(&value) {
        Ok(value)
    } else {
        Err(CoreError::database(format!(
            "unknown source_type '{value}' in worker results"
        )))
    }
}

/// Worker knowledge `type` values are lowercase; the core's NODE_TYPES are
/// capitalized. Both vocabularies share the same 14 members.
fn capitalized_node_type(value: &str) -> Result<String, CoreError> {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => {
            let capitalized: String = first.to_uppercase().collect::<String>() + chars.as_str();
            Ok(capitalized)
        }
        None => Err(CoreError::database("empty node type in worker results")),
    }
}

/// Worker evidence direction ("supports"/"contradicts") onto the schema
/// CHECK spelling ("support"/"contradict").
fn evidence_direction(value: &str) -> Result<&'static str, CoreError> {
    match value {
        "supports" | "support" => Ok("support"),
        "contradicts" | "contradict" => Ok("contradict"),
        other => Err(CoreError::database(format!(
            "unknown evidence direction '{other}' in worker results"
        ))),
    }
}

/// Parses an RFC 3339 timestamp into epoch milliseconds; empty/unparsable
/// values fall back to now (worker timestamps are conventions, not
/// format-asserted).
fn epoch_ms(value: &str) -> i64 {
    crate::ids::parse_rfc3339_ms(value).unwrap_or_else(crate::ids::now_unix_ms)
}

impl ResultIngestion {
    /// Validates and persists one results batch. The whole batch commits or
    /// rolls back together; re-ingesting the same batch is a no-op.
    pub fn ingest(
        conn: &mut Connection,
        project_id: &str,
        results: &Value,
    ) -> Result<IngestStats, CoreError> {
        let envelope: ResultsEnvelopeWire =
            serde_json::from_value(results.clone()).map_err(|err| {
                CoreError::database(format!("worker results envelope failed validation: {err}"))
            })?;
        let mut stats = IngestStats::default();
        // First pass validates every record (deny_unknown_fields) so a bad
        // batch never writes half of itself.
        let mut parsed: Vec<(&str, Value)> = Vec::with_capacity(envelope.records.len());
        for record in &envelope.records {
            match record.kind.as_str() {
                "source" | "source-content" | "node" | "relation" | "claim" | "evidence" => {
                    parse_one(&record.kind, &record.record)?;
                    parsed.push((record.kind.as_str(), record.record.clone()));
                }
                // Reports and raw extraction material stay worker-side.
                "extraction" | "dropped" | "validation-report" | "note" | "incremental-report" => {}
                other => {
                    return Err(CoreError::database(format!(
                        "unknown record kind '{other}' in worker results"
                    )))
                }
            }
        }
        with_write_tx(conn, |tx| {
            let mut source_map: HashMap<String, String> = HashMap::new();
            for (kind, record) in &parsed {
                match *kind {
                    "source" => {
                        let wire: SourceWire = serde_json::from_value(record.clone())
                            .map_err(|err| CoreError::database(format!("{err}")))?;
                        let (stored, _created) = Sources::upsert_by_canonical_url(
                            tx,
                            &NewSource {
                                project_id: project_id.to_string(),
                                url: wire.url.clone(),
                                canonical_url: wire.canonical_url.clone(),
                                title: if wire.title.is_empty() {
                                    wire.url.clone()
                                } else {
                                    wire.title.clone()
                                },
                                source_type: valid_source_type(&wire.source_type)?.to_string(),
                            },
                        )?;
                        if let Some(quality) = &wire.quality {
                            let overall = quality
                                .get("overall")
                                .and_then(Value::as_f64)
                                .ok_or_else(|| {
                                    CoreError::database(
                                        "source quality record lacks an overall score",
                                    )
                                })?;
                            Sources::apply_evaluation(
                                tx,
                                &stored.id,
                                overall,
                                &quality.to_string(),
                            )?;
                        }
                        source_map.insert(wire.source_id, stored.id);
                        stats.sources += 1;
                    }
                    "source-content" => {
                        let wire: SourceContentWire = serde_json::from_value(record.clone())
                            .map_err(|err| CoreError::database(format!("{err}")))?;
                        let Some(core_source_id) = source_map.get(&wire.source_id) else {
                            stats.skipped += 1;
                            continue;
                        };
                        // Deterministic content id: stable across re-ingests,
                        // unique per source + content fingerprint.
                        let content_id = format!("sc:{}:{}", core_source_id, wire.fingerprint);
                        SourceContents::upsert(
                            tx,
                            &content_id,
                            core_source_id,
                            &wire.fingerprint,
                            if wire.content_type.is_empty() {
                                "text/plain"
                            } else {
                                &wire.content_type
                            },
                            wire.content.len() as i64,
                            epoch_ms(&wire.fetched_at),
                        )?;
                        stats.source_contents += 1;
                    }
                    "node" => {
                        let wire: NodeWire = serde_json::from_value(record.clone())
                            .map_err(|err| CoreError::database(format!("{err}")))?;
                        let mapped_sources = wire
                            .source_ids
                            .iter()
                            .filter_map(|id| source_map.get(id).cloned())
                            .collect::<Vec<_>>();
                        KnowledgeNodes::upsert_by_slug(
                            tx,
                            &NewKnowledgeNode {
                                // Worker node ids are deterministic per type
                                // + canonical title: keeping the id (as id and
                                // slug) makes relation FKs resolve verbatim.
                                id: Some(wire.node_id.clone()),
                                project_id: project_id.to_string(),
                                node_type: capitalized_node_type(&wire.node_type)?,
                                title: wire.title.clone(),
                                slug: wire.node_id.clone(),
                                summary: wire.summary.clone(),
                                confidence: if wire.confidence.is_empty() {
                                    "unverified".into()
                                } else {
                                    wire.confidence.clone()
                                },
                                aliases: wire.aliases.clone(),
                                tags: Vec::new(),
                                source_ids: mapped_sources,
                                claim_ids: wire.claim_ids.clone(),
                            },
                        )?;
                        stats.nodes += 1;
                    }
                    "relation" => {
                        let wire: RelationWire = serde_json::from_value(record.clone())
                            .map_err(|err| CoreError::database(format!("{err}")))?;
                        Relations::insert(
                            tx,
                            &NewRelation {
                                id: Some(wire.relation_id.clone()),
                                project_id: project_id.to_string(),
                                from_node_id: wire.subject_node_id.clone(),
                                to_node_id: wire.object_node_id.clone(),
                                relation_type: wire.predicate.clone(),
                                confidence: if wire.confidence.is_empty() {
                                    "unverified".into()
                                } else {
                                    wire.confidence.clone()
                                },
                            },
                        )?;
                        stats.relations += 1;
                    }
                    "claim" => {
                        let wire: ClaimWire = serde_json::from_value(record.clone())
                            .map_err(|err| CoreError::database(format!("{err}")))?;
                        let (stored, created) = Claims::insert(
                            tx,
                            &NewClaim {
                                id: Some(wire.claim_id.clone()),
                                project_id: project_id.to_string(),
                                subject: wire.subject_node_id.clone(),
                                predicate: wire.predicate.clone(),
                                object_value: wire.object_value.clone(),
                                scope: wire.scope.clone(),
                                confidence: if wire.confidence.is_empty() {
                                    "unverified".into()
                                } else {
                                    wire.confidence.clone()
                                },
                                provenance: if wire.provenance.is_null() {
                                    String::new()
                                } else {
                                    wire.provenance.to_string()
                                },
                            },
                        )?;
                        // A later validated record may carry the review
                        // lifecycle the insert defaulted to draft.
                        let status_changed =
                            !wire.status.is_empty() && wire.status != stored.status;
                        let confidence_changed = wire.confidence != stored.confidence;
                        if !created && (status_changed || confidence_changed) {
                            Claims::update_review_state(
                                tx,
                                &wire.claim_id,
                                if wire.status.is_empty() {
                                    "draft"
                                } else {
                                    &wire.status
                                },
                                if wire.confidence.is_empty() {
                                    "unverified"
                                } else {
                                    &wire.confidence
                                },
                            )?;
                        }
                        stats.claims += 1;
                    }
                    "evidence" => {
                        let wire: EvidenceWire = serde_json::from_value(record.clone())
                            .map_err(|err| CoreError::database(format!("{err}")))?;
                        let Some(core_source_id) = source_map.get(&wire.source_id) else {
                            stats.skipped += 1;
                            continue;
                        };
                        let quote = wire.locator.quote.clone().unwrap_or_default();
                        let locator = flatten_locator(&wire.locator);
                        Evidence::insert(
                            tx,
                            &NewEvidence {
                                id: Some(wire.evidence_id.clone()),
                                project_id: project_id.to_string(),
                                source_id: core_source_id.clone(),
                                quote,
                                value: String::new(),
                                locator,
                                direction: evidence_direction(&wire.direction)?.to_string(),
                            },
                        )?;
                        ClaimEvidence::link(tx, &wire.claim_id, &wire.evidence_id)?;
                        stats.evidence += 1;
                    }
                    _ => unreachable!("the first pass filtered unknown kinds"),
                }
            }
            Ok(stats)
        })
    }
}

/// Validates one record against its strict wire struct (the first pass).
fn parse_one(kind: &str, record: &Value) -> Result<(), CoreError> {
    let result = match kind {
        "source" => serde_json::from_value::<SourceWire>(record.clone()).map(|_| ()),
        "source-content" => serde_json::from_value::<SourceContentWire>(record.clone()).map(|_| ()),
        "node" => serde_json::from_value::<NodeWire>(record.clone()).map(|_| ()),
        "relation" => serde_json::from_value::<RelationWire>(record.clone()).map(|_| ()),
        "claim" => serde_json::from_value::<ClaimWire>(record.clone()).map(|_| ()),
        "evidence" => serde_json::from_value::<EvidenceWire>(record.clone()).map(|_| ()),
        _ => return Ok(()),
    };
    result.map_err(|err| {
        CoreError::database(format!("worker {kind} record failed validation: {err}"))
    })
}

/// Flattens the structured locator onto the stored string, preferring the
/// most precise anchor (URL fragment > section > position). The view layer
/// re-derives the kind from the string (ADR-020 bridge).
fn flatten_locator(locator: &EvidenceLocatorWire) -> String {
    if let Some(fragment) = locator.url_fragment.as_deref().filter(|s| !s.is_empty()) {
        return fragment.to_string();
    }
    if let Some(section) = locator.section.as_deref().filter(|s| !s.is_empty()) {
        return section.to_string();
    }
    if let Some(position) = locator.position.as_deref().filter(|s| !s.is_empty()) {
        return position.to_string();
    }
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::claims::Claims;
    use crate::repositories::evidence::Evidence;
    use crate::repositories::knowledge::KnowledgeNodes;
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::sources::Sources;
    use crate::repositories::with_write_tx;
    use serde_json::json;

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

    /// A worker-shaped results envelope covering the whole traceability
    /// chain (field names exactly as the worker's pydantic models emit).
    fn results_envelope() -> Value {
        json!({
            "schema_version": "1",
            "job_id": "job-1",
            "records": [
                {
                    "kind": "source",
                    "record": {
                        "source_id": "ws-1",
                        "url": "https://concepts.test/page?utm=x",
                        "canonical_url": "concepts.test/page",
                        "url_dedup_key": "concepts.test/page",
                        "title": "Entanglement concepts",
                        "source_type": "paper",
                        "found_via": "mock",
                        "published_at": "2024-05-01T00:00:00Z",
                        "retrieved_at": "2026-09-16T10:00:00Z",
                        "snippet": "correlations...",
                        "quality": {
                            "authority": 0.9, "freshness": 0.8, "relevance": 0.7,
                            "type_fit": 0.9, "overall": 0.82, "tier": "high",
                            "reasons": ["cited"], "note": "fitness, not truth"
                        },
                        "metadata": {}
                    }
                },
                {
                    "kind": "source",
                    "record": {
                        "source_id": "ws-2",
                        "url": "https://history.test/bell",
                        "canonical_url": "history.test/bell",
                        "url_dedup_key": "history.test/bell",
                        "title": "Bell history",
                        "source_type": "web_page",
                        "found_via": "mock",
                        "published_at": null,
                        "retrieved_at": "2026-09-16T10:00:01Z",
                        "snippet": "",
                        "quality": null,
                        "metadata": {}
                    }
                },
                {
                    "kind": "source-content",
                    "record": {
                        "source_id": "ws-1",
                        "url_dedup_key": "concepts.test/page",
                        "content": "Quantum entanglement correlates distant particles.",
                        "content_type": "text/plain",
                        "fingerprint": "abc123",
                        "fetched_at": "2026-09-16T10:00:02Z",
                        "locator_base": "full-text"
                    }
                },
                {
                    "kind": "node",
                    "record": {
                        "node_id": "wn-1",
                        "type": "concept",
                        "title": "Quantum Entanglement",
                        "aliases": ["entanglement"],
                        "summary": "Nonclassical correlations.",
                        "status": "active",
                        "confidence": "high",
                        "source_ids": ["ws-1"],
                        "claim_ids": ["wc-1"],
                        "provenance": [],
                        "created_at": "2026-09-16T10:00:03Z",
                        "updated_at": "2026-09-16T10:00:03Z"
                    }
                },
                {
                    "kind": "node",
                    "record": {
                        "node_id": "wn-2",
                        "type": "person",
                        "title": "John Bell",
                        "aliases": [],
                        "summary": "Physicist.",
                        "status": "active",
                        "confidence": "unverified",
                        "source_ids": ["ws-2"],
                        "claim_ids": [],
                        "provenance": [],
                        "created_at": "2026-09-16T10:00:03Z",
                        "updated_at": "2026-09-16T10:00:03Z"
                    }
                },
                {
                    "kind": "relation",
                    "record": {
                        "relation_id": "wr-1",
                        "subject_node_id": "wn-2",
                        "predicate": "derived",
                        "object_node_id": "wn-1",
                        "direction": "directed",
                        "confidence": "medium",
                        "provenance": [],
                        "status": "active",
                        "created_at": "2026-09-16T10:00:04Z",
                        "updated_at": "2026-09-16T10:00:04Z"
                    }
                },
                {
                    "kind": "claim",
                    "record": {
                        "claim_id": "wc-1",
                        "subject_node_id": "wn-1",
                        "predicate": "requires",
                        "object_value": "nonclassical correlations",
                        "object_node_id": null,
                        "scope": "concepts",
                        "status": "draft",
                        "confidence": "high",
                        "evidence_ids": ["we-1"],
                        "provenance": [{"source_id": "ws-1"}],
                        "review_state": "none",
                        "created_at": "2026-09-16T10:00:05Z",
                        "updated_at": "2026-09-16T10:00:05Z"
                    }
                },
                {
                    "kind": "evidence",
                    "record": {
                        "evidence_id": "we-1",
                        "claim_id": "wc-1",
                        "source_id": "ws-1",
                        "locator": {
                            "quote": "Entanglement requires nonclassical correlations",
                            "section": "Conclusions",
                            "url_fragment": null,
                            "position": null,
                            "retrieved_at": "2026-09-16T10:00:00Z"
                        },
                        "extraction_method": "llm.source-extraction.v1",
                        "direction": "supports",
                        "confidence": 0.7,
                        "created_at": "2026-09-16T10:00:06Z"
                    }
                },
                // Reports stay worker-side: accepted in the envelope, not
                // persisted.
                {"kind": "validation-report", "record": {"status": "ok"}},
            ]
        })
    }

    #[test]
    fn ingests_the_full_traceability_chain_from_an_empty_database() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);

        let stats = ResultIngestion::ingest(&mut conn, &project_id, &results_envelope()).unwrap();
        assert_eq!(
            stats,
            IngestStats {
                sources: 2,
                source_contents: 1,
                nodes: 2,
                relations: 1,
                claims: 1,
                evidence: 1,
                skipped: 0,
            }
        );

        // Sources upserted by canonical URL with the evaluated quality; the
        // worker id maps onto the core id.
        let sources = Sources::list_for_project(&conn, &project_id).unwrap();
        assert_eq!(sources.len(), 2);
        let evaluated = sources
            .iter()
            .find(|s| s.canonical_url == "concepts.test/page")
            .unwrap();
        assert_eq!(evaluated.status, "evaluated");
        assert!((evaluated.quality_score.unwrap() - 0.82).abs() < 1e-9);

        // Nodes keep the worker ids (as id and slug); the type is
        // capitalized to the core vocabulary; source_ids were translated to
        // core ids.
        let node = KnowledgeNodes::get_by_slug(&conn, &project_id, "wn-1")
            .unwrap()
            .unwrap();
        assert_eq!(node.id, "wn-1");
        assert_eq!(node.node_type, "Concept");
        assert_eq!(node.source_ids, vec![evaluated.id.clone()]);

        // The claim references the node id verbatim; the evidence row points
        // at the CORE source id and is linked through claim_evidence.
        let claim = Claims::get(&conn, "wc-1").unwrap().unwrap();
        assert_eq!(claim.subject, "wn-1");
        assert_eq!(claim.confidence, "high");
        let linked =
            crate::repositories::evidence::Evidence::list_for_project(&conn, &project_id).unwrap();
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].id, "we-1");
        assert_eq!(linked[0].source_id, evaluated.id);
        assert_eq!(linked[0].direction, "support");
        assert_eq!(linked[0].locator, "Conclusions");
        let by_claim = crate::projections::evidence_views("wc-1", std::slice::from_ref(&linked[0]));
        assert_eq!(by_claim.len(), 1);
        assert_eq!(by_claim[0].source_id, evaluated.id);

        // Re-ingesting the same batch is a no-op (idempotent by identity).
        let again = ResultIngestion::ingest(&mut conn, &project_id, &results_envelope()).unwrap();
        assert_eq!(again.sources, 2, "the canonical URL upserts, no duplicate");
        assert_eq!(
            Sources::list_for_project(&conn, &project_id).unwrap().len(),
            2
        );
        assert_eq!(
            KnowledgeNodes::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            Evidence::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn a_validated_claim_update_supersedes_the_draft_state() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        ResultIngestion::ingest(&mut conn, &project_id, &results_envelope()).unwrap();

        // The validation stage re-persisted the claim with review flags
        // (ADR-016): status moves to needs_review, confidence to conflicting.
        let updated = json!({
            "schema_version": "1",
            "job_id": "job-1",
            "records": [
                {
                    "kind": "claim",
                    "record": {
                        "claim_id": "wc-1",
                        "subject_node_id": "wn-1",
                        "predicate": "requires",
                        "object_value": "nonclassical correlations",
                        "object_node_id": null,
                        "scope": "concepts",
                        "status": "needs_review",
                        "confidence": "conflicting",
                        "evidence_ids": ["we-1"],
                        "provenance": [],
                        "review_state": "needs_review",
                        "created_at": "2026-09-16T10:00:05Z",
                        "updated_at": "2026-09-16T10:00:09Z"
                    }
                }
            ]
        });
        ResultIngestion::ingest(&mut conn, &project_id, &updated).unwrap();
        let claim = Claims::get(&conn, "wc-1").unwrap().unwrap();
        assert_eq!(claim.status, "needs_review");
        assert_eq!(claim.confidence, "conflicting");
    }

    #[test]
    fn unknown_fields_and_kinds_reject_the_whole_batch() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);

        // Unknown record kind.
        let bad_kind = json!({
            "schema_version": "1",
            "job_id": "j",
            "records": [{"kind": "sandcastle", "record": {}}],
        });
        assert!(ResultIngestion::ingest(&mut conn, &project_id, &bad_kind).is_err());

        // Unknown field inside a record: nothing may be half-written.
        let bad_field = json!({
            "schema_version": "1",
            "job_id": "j",
            "records": [
                {"kind": "source", "record": {
                    "source_id": "ws-1", "url": "u", "canonical_url": "c",
                    "url_dedup_key": "c", "title": "T", "source_type": "paper",
                    "found_via": "", "published_at": null, "retrieved_at": "",
                    "snippet": "", "quality": null, "metadata": {},
                    "surprise": 1
                }},
            ],
        });
        assert!(ResultIngestion::ingest(&mut conn, &project_id, &bad_field).is_err());
        assert!(
            Sources::list_for_project(&conn, &project_id)
                .unwrap()
                .is_empty(),
            "a rejected batch writes nothing"
        );
    }

    #[test]
    fn evidence_before_its_source_is_skipped_not_failed() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        // Evidence referencing a source the batch never delivered (ordering
        // bug simulation): the batch still lands, the orphan is counted.
        let orphan = json!({
            "schema_version": "1",
            "job_id": "j",
            "records": [
                {"kind": "evidence", "record": {
                    "evidence_id": "we-9", "claim_id": "wc-9", "source_id": "ws-ghost",
                    "locator": {"quote": "q", "section": null, "url_fragment": null,
                                "position": null, "retrieved_at": ""},
                    "extraction_method": "llm.source-extraction.v1",
                    "direction": "contradicts", "confidence": 0.5,
                    "created_at": ""
                }},
            ],
        });
        let stats = ResultIngestion::ingest(&mut conn, &project_id, &orphan).unwrap();
        assert_eq!(stats.skipped, 1);
        assert_eq!(stats.evidence, 0);
    }
}
