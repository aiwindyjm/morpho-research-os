//! Research result ingestion (ADR-024): worker-validated domain records in,
//! transactional SQLite writes out.
//!
//! The worker's `GET /jobs/{id}/results` returns every record its result sink
//! collected. This module is the Rust half of the handoff. Validation happens
//! in layers (review R6 — `deny_unknown_fields` alone is not semantic
//! validation):
//!
//! 1. **Envelope**: strict serde parse, the results schema version must be a
//!    supported one, the envelope's `job_id` must equal the job the core
//!    drained, and the referenced run must exist, belong to the target
//!    project, and carry that job as its persisted `worker_job_id`
//!    (migration 004 binding). `records` is required.
//! 2. **Records**: every record is parsed into a typed wire struct with
//!    closed vocabularies — record kinds, source types, node types, claim
//!    statuses (ADR-016), confidence states, relation directions, evidence
//!    directions, content classes — and evidence locators must carry at
//!    least one anchor (RES-06: no locator, no auditable claim).
//! 3. **References**: every cross-record reference must resolve — sources by
//!    batch membership, nodes and claims by batch membership or by an
//!    already-ingested row of the same project. Unresolvable references
//!    reject the whole batch; silent skipping would break traceability.
//!
//! Identity rules (review R1 — worker ids are NOT global primary keys):
//!
//! * worker ids are deterministic per (type, canonical name) with no project
//!   dimension, so the core mints **project-scoped** ids
//!   (`<project_id>:<worker_id>`) for knowledge nodes, relations, claims, and
//!   evidence. Two projects may research the same concept without colliding,
//!   and re-ingesting the same batch into the same project is idempotent by
//!   primary key;
//! * nodes keep the worker node id as their per-project `slug`, so
//!   cross-batch node references resolve by `(project, slug)`;
//! * sources upsert by `(project, canonical_url)`; the worker's source ids
//!   map onto core ids and every later reference (evidence `source_id`, node
//!   `source_ids`) is translated through that map;
//! * databases written before project scoping keep working: a legacy row
//!   under the raw worker id of the same project is reused instead of
//!   duplicated.
//!
//! Content payloads (review R8): every `source-content` record lands its
//! bytes in a core-owned cache file under the ingestion's `content_dir`
//! (never inside the user's Markdown vault) with its class (`full-text` /
//! `snippet` / `unavailable`), fingerprint, and fetch time persisted on the
//! `source_contents` row.
//!
//! V0.1 persists the traceability chain `source → source-content → node →
//! relation → claim → evidence (+ claim_evidence)`. `extraction`, `dropped`,
//! and the report kinds stay in the worker payload and event log only.

use crate::error::CoreError;
use crate::repositories::claims::{ClaimEvidence, Claims, NewClaim, CLAIM_STATUS_STATES};
use crate::repositories::evidence::{Evidence, NewEvidence};
use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode, NODE_TYPES};
use crate::repositories::relations::{NewRelation, Relations};
use crate::repositories::runs::Runs;
use crate::repositories::sources::{NewSource, SourceContents, Sources, CONTENT_CLASSES};
use crate::repositories::with_write_tx;
use rusqlite::{Connection, Transaction};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// The only results-envelope schema version this core understands.
pub const RESULTS_SCHEMA_VERSION: &str = "1";

/// Confidence states shared by nodes and claims (PRD §6).
const CONFIDENCE_STATES: [&str; 6] = [
    "confirmed",
    "high",
    "medium",
    "low",
    "unverified",
    "conflicting",
];

/// Worker relation direction vocabulary.
const RELATION_DIRECTIONS: [&str; 2] = ["directed", "undirected"];

// ---------------------------------------------------------------------------
// Wire shapes (strict mirrors of the worker's pydantic models)
// ---------------------------------------------------------------------------

/// The job whose results are being ingested — the pump's drain target.
#[derive(Debug, Clone, PartialEq)]
pub struct IngestTarget<'a> {
    pub project_id: &'a str,
    /// The worker-acknowledged job id (must match the envelope AND the run's
    /// persisted `worker_job_id`).
    pub job_id: &'a str,
    pub run_id: &'a str,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ResultsEnvelopeWire {
    schema_version: String,
    job_id: String,
    /// Required: an envelope without the member is malformed, not empty.
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
    /// Availability classification (review R8): `full-text`, `snippet`, or
    /// `unavailable`.
    #[serde(default)]
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

impl EvidenceLocatorWire {
    fn has_anchor(&self) -> bool {
        [
            self.quote.as_deref(),
            self.section.as_deref(),
            self.url_fragment.as_deref(),
            self.position.as_deref(),
        ]
        .into_iter()
        .flatten()
        .any(|value| !value.is_empty())
    }
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

/// One fully validated record, ready to write.
#[derive(Debug)]
enum ParsedRecord {
    Source(SourceWire),
    SourceContent(SourceContentWire),
    Node(NodeWire),
    Relation(RelationWire),
    Claim(ClaimWire),
    Evidence(EvidenceWire),
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

/// The core id for a worker-minted id: project-scoped so the same worker id
/// in two projects yields two independent rows (review R1).
fn scoped_id(project_id: &str, worker_id: &str) -> String {
    format!("{project_id}:{worker_id}")
}

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

/// Worker knowledge `type` values are lowercase members of the shared
/// 14-type vocabulary; the core stores the capitalized spelling.
fn capitalized_node_type(value: &str) -> Result<String, CoreError> {
    if !NODE_TYPES
        .iter()
        .any(|core| core.eq_ignore_ascii_case(value))
    {
        return Err(CoreError::database(format!(
            "unknown node type '{value}' in worker results"
        )));
    }
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => Ok(first.to_uppercase().collect::<String>() + chars.as_str()),
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

fn valid_confidence(value: &str) -> Result<(), CoreError> {
    if value.is_empty() || CONFIDENCE_STATES.contains(&value) {
        Ok(())
    } else {
        Err(CoreError::database(format!(
            "unknown confidence '{value}' in worker results"
        )))
    }
}

/// Parses an RFC 3339 timestamp into epoch milliseconds; empty/unparsable
/// values fall back to now (worker timestamps are conventions, not
/// format-asserted).
fn epoch_ms(value: &str) -> i64 {
    crate::ids::parse_rfc3339_ms(value).unwrap_or_else(crate::ids::now_unix_ms)
}

fn parse_record<T: serde::de::DeserializeOwned>(
    kind: &str,
    record: &Value,
) -> Result<T, CoreError> {
    serde_json::from_value(record.clone()).map_err(|err| {
        CoreError::database(format!("worker {kind} record failed validation: {err}"))
    })
}

impl ResultIngestion {
    /// Validates and persists one results batch. The whole batch commits or
    /// rolls back together; re-ingesting the same batch is a no-op.
    pub fn ingest(
        conn: &mut Connection,
        target: &IngestTarget<'_>,
        results: &Value,
        content_dir: &Path,
    ) -> Result<IngestStats, CoreError> {
        let envelope: ResultsEnvelopeWire =
            serde_json::from_value(results.clone()).map_err(|err| {
                CoreError::database(format!("worker results envelope failed validation: {err}"))
            })?;
        if envelope.schema_version != RESULTS_SCHEMA_VERSION {
            return Err(CoreError::database(format!(
                "unsupported worker results schema_version '{}' (this core speaks \
                 '{RESULTS_SCHEMA_VERSION}')",
                envelope.schema_version
            )));
        }
        if envelope.job_id != target.job_id {
            return Err(CoreError::database(format!(
                "worker results envelope names job '{}' but the core drained job '{}'",
                envelope.job_id, target.job_id
            )));
        }
        // The run must exist, belong to the target project, and carry this
        // job as its persisted worker binding (review R6).
        let run = Runs::get(conn, target.run_id)?
            .ok_or_else(|| CoreError::database(format!("run '{}' not found", target.run_id)))?;
        if run.project_id != target.project_id {
            return Err(CoreError::database(format!(
                "run '{}' belongs to project '{}' but results were drained for project '{}'",
                target.run_id, run.project_id, target.project_id
            )));
        }
        if run.worker_job_id.as_deref() != Some(target.job_id) {
            return Err(CoreError::database(format!(
                "run '{}' is not bound to worker job '{}' (bound: {:?})",
                target.run_id, target.job_id, run.worker_job_id
            )));
        }

        // First pass validates every record (strict parse + closed
        // vocabularies) so a bad batch never writes half of itself, and
        // collects the batch's worker ids for reference resolution.
        let mut parsed: Vec<ParsedRecord> = Vec::with_capacity(envelope.records.len());
        let mut batch_sources: HashSet<String> = HashSet::new();
        let mut batch_nodes: HashSet<String> = HashSet::new();
        let mut batch_claims: HashSet<String> = HashSet::new();
        let mut stats = IngestStats::default();
        for record in &envelope.records {
            match record.kind.as_str() {
                "source" => {
                    let wire: SourceWire = parse_record("source", &record.record)?;
                    valid_source_type(&wire.source_type)?;
                    batch_sources.insert(wire.source_id.clone());
                    parsed.push(ParsedRecord::Source(wire));
                }
                "source-content" => {
                    let wire: SourceContentWire = parse_record("source-content", &record.record)?;
                    if !CONTENT_CLASSES.contains(&wire.locator_base.as_str()) {
                        return Err(CoreError::database(format!(
                            "unknown content class '{}' in worker results (expected one of \
                             {CONTENT_CLASSES:?})",
                            wire.locator_base
                        )));
                    }
                    parsed.push(ParsedRecord::SourceContent(wire));
                }
                "node" => {
                    let wire: NodeWire = parse_record("node", &record.record)?;
                    capitalized_node_type(&wire.node_type)?;
                    valid_confidence(&wire.confidence)?;
                    batch_nodes.insert(wire.node_id.clone());
                    parsed.push(ParsedRecord::Node(wire));
                }
                "relation" => {
                    let wire: RelationWire = parse_record("relation", &record.record)?;
                    if !RELATION_DIRECTIONS.contains(&wire.direction.as_str()) {
                        return Err(CoreError::database(format!(
                            "unknown relation direction '{}' in worker results",
                            wire.direction
                        )));
                    }
                    valid_confidence(&wire.confidence)?;
                    parsed.push(ParsedRecord::Relation(wire));
                }
                "claim" => {
                    let wire: ClaimWire = parse_record("claim", &record.record)?;
                    if !CLAIM_STATUS_STATES.contains(&wire.status.as_str()) {
                        return Err(CoreError::database(format!(
                            "unknown claim status '{}' in worker results (expected one of \
                             {CLAIM_STATUS_STATES:?})",
                            wire.status
                        )));
                    }
                    valid_confidence(&wire.confidence)?;
                    batch_claims.insert(wire.claim_id.clone());
                    parsed.push(ParsedRecord::Claim(wire));
                }
                "evidence" => {
                    let wire: EvidenceWire = parse_record("evidence", &record.record)?;
                    evidence_direction(&wire.direction)?;
                    if !wire.locator.has_anchor() {
                        return Err(CoreError::database(format!(
                            "evidence '{}' carries no locator anchor (quote, section, fragment, \
                             or position required — RES-06)",
                            wire.evidence_id
                        )));
                    }
                    parsed.push(ParsedRecord::Evidence(wire));
                }
                // Reports and raw extraction material stay worker-side.
                "extraction" | "dropped" | "validation-report" | "note" | "incremental-report" => {
                    stats.skipped += 1;
                }
                other => {
                    return Err(CoreError::database(format!(
                        "unknown record kind '{other}' in worker results"
                    )))
                }
            }
        }

        let mut deferred_links: Vec<(String, String)> = Vec::new();
        // Files this batch newly created inside the transaction (round-2
        // review P1): a rolled-back batch compensates by removing them, so a
        // failed batch never leaves files behind. Pre-existing files are
        // never touched (their names already hash to their bytes), and a
        // corrupt file replaced with verified bytes stays replaced.
        let mut published_files: Vec<std::path::PathBuf> = Vec::new();
        let outcome = with_write_tx(conn, |tx| {
            let mut source_map: HashMap<String, String> = HashMap::new();
            for record in &parsed {
                match record {
                    ParsedRecord::Source(wire) => {
                        write_source(tx, target.project_id, wire, &mut source_map, &mut stats)?;
                    }
                    ParsedRecord::SourceContent(wire) => {
                        write_source_content(
                            tx,
                            target.project_id,
                            wire,
                            &source_map,
                            content_dir,
                            &mut published_files,
                            &mut stats,
                        )?;
                    }
                    ParsedRecord::Node(wire) => {
                        write_node(
                            tx,
                            target.project_id,
                            wire,
                            &source_map,
                            &batch_nodes,
                            &batch_claims,
                            &mut stats,
                        )?;
                    }
                    ParsedRecord::Relation(wire) => {
                        write_relation(tx, target.project_id, wire, &batch_nodes, &mut stats)?;
                    }
                    ParsedRecord::Claim(wire) => {
                        write_claim(tx, target.project_id, wire, &batch_nodes, &mut stats)?;
                    }
                    ParsedRecord::Evidence(wire) => {
                        let link = write_evidence(
                            tx,
                            target.project_id,
                            wire,
                            &source_map,
                            &batch_claims,
                            &mut stats,
                        )?;
                        deferred_links.push(link);
                    }
                }
            }
            // Claim-evidence links land after both endpoints exist, so record
            // order inside the batch cannot violate the foreign keys.
            for (claim_id, evidence_id) in deferred_links.clone() {
                ClaimEvidence::link(tx, &claim_id, &evidence_id)?;
            }
            // The delivery fact commits WITH the domain rows (round-2 review
            // P1): the run only reads `delivered` once its results are.
            crate::repositories::runs::Runs::set_delivery_status(tx, target.run_id, "delivered")?;
            Ok(stats)
        });
        if outcome.is_err() {
            // Compensation: remove the files this failed batch created. A
            // crash between publish and rollback can still leave an
            // unreferenced, hash-verified file — harmless and reusable by
            // the next successful ingest of the same content.
            for path in &published_files {
                let _ = std::fs::remove_file(path);
            }
        }
        outcome
    }
}

// ---------------------------------------------------------------------------
// Per-record writers (free functions over the open transaction)
// ---------------------------------------------------------------------------

/// Resolves a worker source id to the core source id. Sources resolve only
/// within the batch: worker source ids are per-run, so a reference the batch
/// cannot satisfy is a broken batch (review R6 — no silent skips).
fn resolve_source(
    source_map: &HashMap<String, String>,
    worker_id: &str,
) -> Result<String, CoreError> {
    source_map.get(worker_id).cloned().ok_or_else(|| {
        CoreError::database(format!(
            "worker results reference source '{worker_id}' which the batch never delivered"
        ))
    })
}

/// Resolves a worker node id to the core node id: an already-written row of
/// this project by slug (batch order and prior batches alike), else the
/// scoped id when the batch carries the node, else a structured error.
fn resolve_node(
    tx: &Transaction<'_>,
    project_id: &str,
    worker_id: &str,
    batch_nodes: &HashSet<String>,
) -> Result<String, CoreError> {
    if let Some(existing) = KnowledgeNodes::get_by_slug(tx, project_id, worker_id)? {
        return Ok(existing.id);
    }
    if batch_nodes.contains(worker_id) {
        return Ok(scoped_id(project_id, worker_id));
    }
    Err(CoreError::database(format!(
        "worker results reference node '{worker_id}' which is neither in the batch nor ingested \
         for this project"
    )))
}

/// Resolves a worker claim id to the core claim id: an already-ingested
/// scoped row, a legacy pre-scoping row of the same project, else the scoped
/// id when the batch carries the claim, else a structured error.
fn resolve_claim(
    tx: &Transaction<'_>,
    project_id: &str,
    worker_id: &str,
    batch_claims: &HashSet<String>,
) -> Result<String, CoreError> {
    let scoped = scoped_id(project_id, worker_id);
    if Claims::get(tx, &scoped)?.is_some() {
        return Ok(scoped);
    }
    if let Some(legacy) = Claims::get(tx, worker_id)? {
        if legacy.project_id == project_id {
            return Ok(legacy.id);
        }
    }
    if batch_claims.contains(worker_id) {
        return Ok(scoped);
    }
    Err(CoreError::database(format!(
        "worker results reference claim '{worker_id}' which is neither in the batch nor ingested \
         for this project"
    )))
}

fn write_source(
    tx: &Transaction<'_>,
    project_id: &str,
    wire: &SourceWire,
    source_map: &mut HashMap<String, String>,
    stats: &mut IngestStats,
) -> Result<(), CoreError> {
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
            .ok_or_else(|| CoreError::database("source quality record lacks an overall score"))?;
        Sources::apply_evaluation(tx, &stored.id, overall, &quality.to_string())?;
    }
    source_map.insert(wire.source_id.clone(), stored.id);
    stats.sources += 1;
    Ok(())
}

fn write_source_content(
    tx: &Transaction<'_>,
    _project_id: &str,
    wire: &SourceContentWire,
    source_map: &HashMap<String, String>,
    content_dir: &Path,
    published_files: &mut Vec<std::path::PathBuf>,
    stats: &mut IngestStats,
) -> Result<(), CoreError> {
    let core_source_id = resolve_source(source_map, &wire.source_id)?;
    // Deterministic content id: stable across re-ingests, unique per source
    // + content fingerprint.
    let content_id = format!("sc:{core_source_id}:{}", wire.fingerprint);
    let (cache_path, byte_size, created) = write_content_file(
        content_dir,
        &core_source_id,
        &wire.fingerprint,
        &wire.content,
        &wire.content_type,
    )?;
    if created {
        published_files.push(std::path::PathBuf::from(&cache_path));
    }
    SourceContents::upsert(
        tx,
        &content_id,
        &crate::repositories::sources::NewSourceContent {
            source_id: &core_source_id,
            content_hash: &wire.fingerprint,
            format: if wire.content_type.is_empty() {
                "text/plain"
            } else {
                &wire.content_type
            },
            cache_path: &cache_path,
            byte_size,
            extracted_at: epoch_ms(&wire.fetched_at),
            content_class: &wire.locator_base,
        },
    )?;
    stats.source_contents += 1;
    Ok(())
}

fn write_node(
    tx: &Transaction<'_>,
    project_id: &str,
    wire: &NodeWire,
    source_map: &HashMap<String, String>,
    _batch_nodes: &HashSet<String>,
    batch_claims: &HashSet<String>,
    stats: &mut IngestStats,
) -> Result<(), CoreError> {
    let mut mapped_sources = Vec::with_capacity(wire.source_ids.len());
    for worker_id in &wire.source_ids {
        mapped_sources.push(resolve_source(source_map, worker_id)?);
    }
    let mut mapped_claims = Vec::with_capacity(wire.claim_ids.len());
    for worker_id in &wire.claim_ids {
        mapped_claims.push(resolve_claim(tx, project_id, worker_id, batch_claims)?);
    }
    KnowledgeNodes::upsert_by_slug(
        tx,
        &NewKnowledgeNode {
            // Project-scoped id: the same worker node id in another project
            // must not collide on the primary key (review R1).
            id: Some(scoped_id(project_id, &wire.node_id)),
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
            claim_ids: mapped_claims,
        },
    )?;
    stats.nodes += 1;
    Ok(())
}

fn write_relation(
    tx: &Transaction<'_>,
    project_id: &str,
    wire: &RelationWire,
    batch_nodes: &HashSet<String>,
    stats: &mut IngestStats,
) -> Result<(), CoreError> {
    let from = resolve_node(tx, project_id, &wire.subject_node_id, batch_nodes)?;
    let to = resolve_node(tx, project_id, &wire.object_node_id, batch_nodes)?;
    Relations::insert(
        tx,
        &NewRelation {
            id: Some(scoped_id(project_id, &wire.relation_id)),
            project_id: project_id.to_string(),
            from_node_id: from,
            to_node_id: to,
            relation_type: wire.predicate.clone(),
            confidence: if wire.confidence.is_empty() {
                "unverified".into()
            } else {
                wire.confidence.clone()
            },
        },
    )?;
    stats.relations += 1;
    Ok(())
}

fn write_claim(
    tx: &Transaction<'_>,
    project_id: &str,
    wire: &ClaimWire,
    batch_nodes: &HashSet<String>,
    stats: &mut IngestStats,
) -> Result<(), CoreError> {
    let subject = resolve_node(tx, project_id, &wire.subject_node_id, batch_nodes)?;
    let scoped = scoped_id(project_id, &wire.claim_id);
    // Legacy continuity: a pre-scoping row of the same project keeps its id
    // so re-researching a topic updates instead of duplicating.
    let core_id = match Claims::get(tx, &scoped)? {
        Some(_) => scoped,
        None => match Claims::get(tx, &wire.claim_id)? {
            Some(legacy) if legacy.project_id == project_id => legacy.id,
            _ => scoped,
        },
    };
    let status = if wire.status.is_empty() {
        "draft".to_string()
    } else {
        wire.status.clone()
    };
    let confidence = if wire.confidence.is_empty() {
        "unverified".to_string()
    } else {
        wire.confidence.clone()
    };
    let (stored, created) = Claims::insert(
        tx,
        &NewClaim {
            id: Some(core_id),
            project_id: project_id.to_string(),
            subject,
            predicate: wire.predicate.clone(),
            object_value: wire.object_value.clone(),
            scope: wire.scope.clone(),
            // The FIRST record may already carry the validated review
            // lifecycle (ADR-016); insert honors it (review R7).
            status: status.clone(),
            confidence: confidence.clone(),
            provenance: if wire.provenance.is_null() {
                String::new()
            } else {
                wire.provenance.to_string()
            },
        },
    )?;
    if !created {
        // A later validated record may carry the review lifecycle the stored
        // row lacks; the repository verifies project ownership (review R1).
        Claims::update_review_state(tx, &stored.id, project_id, &status, &confidence)?;
    }
    stats.claims += 1;
    Ok(())
}

/// Writes one evidence record; returns the `(claim_id, evidence_id)` pair to
/// link after all rows exist.
fn write_evidence(
    tx: &Transaction<'_>,
    project_id: &str,
    wire: &EvidenceWire,
    source_map: &HashMap<String, String>,
    batch_claims: &HashSet<String>,
    stats: &mut IngestStats,
) -> Result<(String, String), CoreError> {
    let core_source_id = resolve_source(source_map, &wire.source_id)?;
    let claim_id = resolve_claim(tx, project_id, &wire.claim_id, batch_claims)?;
    let quote = wire.locator.quote.clone().unwrap_or_default();
    let locator = flatten_locator(&wire.locator);
    // The structured locator persists losslessly (migration 006, round-2
    // review P2) — the flattened string stays for display, the JSON keeps
    // every anchor plus the worker's original retrieval time.
    let locator_detail = serde_json::to_string(&serde_json::json!({
        "quote": wire.locator.quote,
        "section": wire.locator.section,
        "url_fragment": wire.locator.url_fragment,
        "position": wire.locator.position,
        "retrieved_at": wire.locator.retrieved_at,
    }))
    .map_err(|err| CoreError::database(format!("serialize locator detail failed: {err}")))?;
    let retrieved_at = evidence_retrieved_at(tx, &core_source_id, &wire.locator.retrieved_at);
    let evidence_id = scoped_id(project_id, &wire.evidence_id);
    Evidence::insert(
        tx,
        &NewEvidence {
            id: Some(evidence_id.clone()),
            project_id: project_id.to_string(),
            source_id: core_source_id,
            quote,
            value: String::new(),
            locator,
            locator_detail,
            retrieved_at,
            direction: evidence_direction(&wire.direction)?.to_string(),
        },
    )?;
    stats.evidence += 1;
    Ok((claim_id, evidence_id))
}

/// The evidence's original retrieval time (round-2 review P2): the worker's
/// locator timestamp when present, else the source's persisted fetch time —
/// never the ingestion clock. `0` means genuinely unknown.
fn evidence_retrieved_at(
    tx: &Transaction<'_>,
    core_source_id: &str,
    locator_retrieved_at: &str,
) -> i64 {
    if let Some(epoch) = crate::ids::parse_rfc3339_ms(locator_retrieved_at) {
        if !locator_retrieved_at.is_empty() {
            return epoch;
        }
    }
    let source_fetch: Option<i64> = tx
        .query_row(
            "SELECT MAX(extracted_at) FROM source_contents WHERE source_id = ?1",
            rusqlite::params![core_source_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    source_fetch.unwrap_or(0)
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

/// Provable cache↔database consistency (round-2 review P1):
///
/// 1. the payload's SHA-256 must equal the declared fingerprint — the file's
///    name therefore determines its bytes, so a tampered payload can never
///    land under a committed fingerprint's name;
/// 2. the payload lands in a uniquely named temporary file first and is
///    published by rename (atomic on both POSIX and Windows when the target
///    does not exist), so a crash can never leave a torn file under the
///    referenced name;
/// 3. a referenced file whose bytes no longer hash to its name (external
///    tampering, torn write from an older build) is replaced from the
///    verified temporary file — the store self-heals;
/// 4. failed batches can therefore never mutate committed content: the
///    fingerprint check rejects mismatches before anything is written, and
///    content-addressed names make an extra file from a rolled-back batch
///    indistinguishable from (and reusable by) the next successful ingest.
fn write_content_file(
    dir: &Path,
    core_source_id: &str,
    fingerprint: &str,
    content: &str,
    content_type: &str,
) -> Result<(String, i64, bool), CoreError> {
    // The fingerprint is verified for EVERY row (empty content hashes to the
    // well-known empty digest), so the batch rejects before any write when
    // the declared fingerprint does not match the payload.
    let computed = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    };
    if !fingerprint.eq_ignore_ascii_case(&computed) {
        return Err(CoreError::database(format!(
            "source-content fingerprint mismatch: declared '{fingerprint}' but the payload \
             hashes to '{computed}' — the batch is rejected"
        )));
    }
    if content.is_empty() {
        return Ok((String::new(), 0, false));
    }
    let sanitize = |value: &str| {
        value
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect::<String>()
    };
    let extension = match content_type {
        "text/html" => "html",
        "text/markdown" => "md",
        "application/json" => "json",
        _ => "txt",
    };
    let file_name = format!(
        "{}-{}.{}",
        sanitize(core_source_id),
        sanitize(fingerprint),
        extension
    );
    std::fs::create_dir_all(dir).map_err(|err| {
        CoreError::database(format!(
            "creating the source-content cache directory '{}' failed: {err}",
            dir.display()
        ))
    })?;
    let path = dir.join(&file_name);

    // Idempotent fast path: the referenced file already exists AND still
    // hashes to its own name — nothing to do.
    if let Ok(existing) = std::fs::read(&path) {
        let existing_hash = {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(&existing);
            format!("{:x}", hasher.finalize())
        };
        if existing_hash.eq_ignore_ascii_case(fingerprint) {
            return Ok((
                path.to_string_lossy().into_owned(),
                content.len() as i64,
                false,
            ));
        }
        // Corrupted/torn referenced file: fall through and replace it from
        // the verified temporary file.
    }

    // Write a unique temporary file, then publish atomically. Temp names are
    // hidden (dot-prefixed) and never referenced by the database.
    let tmp = dir.join(format!(
        ".tmp-{}-{}",
        sanitize(fingerprint),
        crate::ids::new_id()
    ));
    std::fs::write(&tmp, content).map_err(|err| {
        CoreError::database(format!(
            "writing source content to '{}' failed: {err}",
            tmp.display()
        ))
    })?;
    let publish = || {
        // Windows rename fails onto an existing target: a stale file under
        // the final name (which either failed the hash check above or landed
        // between check and publish) is removed first.
        if path.exists() {
            let _ = std::fs::remove_file(&path);
        }
        std::fs::rename(&tmp, &path)
    };
    publish().map_err(|err| {
        let _ = std::fs::remove_file(&tmp);
        CoreError::database(format!(
            "publishing source content to '{}' failed: {err}",
            path.display()
        ))
    })?;
    Ok((
        path.to_string_lossy().into_owned(),
        content.len() as i64,
        true,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::claims::Claims;
    use crate::repositories::knowledge::KnowledgeNodes;
    use crate::repositories::plans::{NewPlan, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::runs::{NewRun, Runs};
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

    /// Creates a run bound to `job_id` inside `project_id` so ingestions can
    /// verify the job/run/project linkage.
    fn bound_run(conn: &mut Connection, project_id: &str, job_id: &str) -> String {
        let config_id = with_write_tx(conn, |tx| {
            crate::repositories::configs::ResearchConfigs::insert(
                tx,
                &crate::repositories::configs::NewResearchConfig {
                    project_id: project_id.to_string(),
                    ..Default::default()
                },
            )
            .map(|c| c.id)
        })
        .unwrap();
        let plan_id = with_write_tx(conn, |tx| {
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
                    tasks: vec![],
                },
            )
            .map(|created| created.plan.id)
        })
        .unwrap();
        let run = with_write_tx(conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id: project_id.to_string(),
                    plan_id,
                    started_at: None,
                },
            )
        })
        .unwrap();
        with_write_tx(conn, |tx| Runs::set_worker_job(tx, &run.id, job_id)).unwrap();
        run.id
    }

    fn target<'a>(project_id: &'a str, job_id: &'a str, run_id: &'a str) -> IngestTarget<'a> {
        IngestTarget {
            project_id,
            job_id,
            run_id,
        }
    }

    fn content_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    /// The real SHA-256 the ingestion now verifies against (the worker's
    /// `content_fingerprint`).
    fn sha256_of(content: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    const MAIN_CONTENT: &str = "Quantum entanglement correlates distant particles.";

    /// A worker-shaped results envelope covering the whole traceability
    /// chain (field names exactly as the worker's pydantic models emit).
    fn results_envelope(job_id: &str) -> Value {
        json!({
            "schema_version": "1",
            "job_id": job_id,
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
                        "fingerprint": sha256_of(MAIN_CONTENT),
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
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();

        let stats = ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &results_envelope("job-1"),
            dir.path(),
        )
        .unwrap();
        assert_eq!(
            stats,
            IngestStats {
                sources: 2,
                source_contents: 1,
                nodes: 2,
                relations: 1,
                claims: 1,
                evidence: 1,
                skipped: 1,
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

        // Nodes carry project-scoped ids with the worker id as slug; the
        // type is capitalized to the core vocabulary; source_ids were
        // translated to core ids.
        let node = KnowledgeNodes::get_by_slug(&conn, &project_id, "wn-1")
            .unwrap()
            .unwrap();
        assert_eq!(node.id, format!("{project_id}:wn-1"));
        assert_eq!(node.node_type, "Concept");
        assert_eq!(node.source_ids, vec![evaluated.id.clone()]);
        assert_eq!(node.claim_ids, vec![format!("{project_id}:wc-1")]);

        // The claim references the scoped node id; the evidence row points
        // at the CORE source id and is linked through claim_evidence.
        let claim = Claims::get(&conn, &format!("{project_id}:wc-1"))
            .unwrap()
            .unwrap();
        assert_eq!(claim.subject, format!("{project_id}:wn-1"));
        assert_eq!(claim.confidence, "high");
        let linked =
            crate::repositories::evidence::Evidence::list_for_project(&conn, &project_id).unwrap();
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].id, format!("{project_id}:we-1"));
        assert_eq!(linked[0].source_id, evaluated.id);
        assert_eq!(linked[0].direction, "support");
        assert_eq!(linked[0].locator, "Conclusions");
        let by_claim =
            crate::projections::evidence_views(&claim.id, std::slice::from_ref(&linked[0]));
        assert_eq!(by_claim.len(), 1);
        assert_eq!(by_claim[0].source_id, evaluated.id);

        // The content payload landed in a core-owned cache file with its
        // class and fetch time (review R8) — not just a row count.
        let content_row_id = format!("sc:{}:{}", evaluated.id, sha256_of(MAIN_CONTENT));
        let content = crate::repositories::sources::SourceContents::get(&conn, &content_row_id)
            .unwrap()
            .expect("content row exists");
        assert_eq!(content.content_class, "full-text");
        assert_eq!(content.byte_size, 50);
        assert!(!content.cache_path.is_empty(), "cache_path must be set");
        let cached = std::fs::read_to_string(&content.cache_path).unwrap();
        assert_eq!(cached, "Quantum entanglement correlates distant particles.");
        assert!(
            content.cache_path.starts_with(dir.path().to_str().unwrap()),
            "content stays inside the core cache dir"
        );

        // Re-ingesting the same batch is a no-op (idempotent by identity).
        let again = ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &results_envelope("job-1"),
            dir.path(),
        )
        .unwrap();
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
            crate::repositories::evidence::Evidence::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            crate::repositories::claims::Claims::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
    }

    /// Review R1: the worker mints the same deterministic node id for the
    /// same concept in every project; both projects must ingest it
    /// independently.
    #[test]
    fn identical_worker_node_ids_stay_isolated_between_projects() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);
        let run1 = bound_run(&mut conn, &p1, "job-p1");
        let run2 = bound_run(&mut conn, &p2, "job-p2");
        let dir = content_dir();
        let data = |job: &str| {
            json!({"schema_version":"1", "job_id":job, "records":[
                {"kind":"node","record":{
                    "node_id":"16d591fe-d303-5bf7-8394-9f5f8d1c0ac9",
                    "type":"concept","title":"Entanglement","confidence":"high"
                }},
            ]})
        };
        ResultIngestion::ingest(
            &mut conn,
            &target(&p1, "job-p1", &run1),
            &data("job-p1"),
            dir.path(),
        )
        .unwrap();
        ResultIngestion::ingest(
            &mut conn,
            &target(&p2, "job-p2", &run2),
            &data("job-p2"),
            dir.path(),
        )
        .unwrap();
        assert_eq!(
            KnowledgeNodes::list_for_project(&conn, &p1).unwrap().len(),
            1
        );
        assert_eq!(
            KnowledgeNodes::list_for_project(&conn, &p2).unwrap().len(),
            1,
            "the second project ingests the same concept independently"
        );
        let n1 = KnowledgeNodes::get_by_slug(&conn, &p1, "16d591fe-d303-5bf7-8394-9f5f8d1c0ac9")
            .unwrap()
            .unwrap();
        let n2 = KnowledgeNodes::get_by_slug(&conn, &p2, "16d591fe-d303-5bf7-8394-9f5f8d1c0ac9")
            .unwrap()
            .unwrap();
        assert_ne!(n1.id, n2.id, "core ids are project-scoped");
    }

    /// Review R1: a second project's batch carrying the same worker claim id
    /// must never modify the first project's claim.
    #[test]
    fn a_foreign_projects_claim_is_not_modified_by_ingestion() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);
        let run1 = bound_run(&mut conn, &p1, "job-p1");
        let run2 = bound_run(&mut conn, &p2, "job-p2");
        let dir = content_dir();
        let claim_record = |status: &str, confidence: &str| {
            json!({"kind":"claim","record":{
                "claim_id":"shared-claim", "subject_node_id":"wn-x",
                "predicate":"is", "object_value":"value",
                "status":status,"confidence":confidence
            }})
        };
        let node_record = json!({"kind":"node","record":{
            "node_id":"wn-x", "type":"concept", "title":"X", "confidence":"high"
        }});
        let first = json!({"schema_version":"1","job_id":"job-p1","records":[
            node_record.clone(), claim_record("draft", "high"),
        ]});
        let second = json!({"schema_version":"1","job_id":"job-p2","records":[
            node_record, claim_record("needs_review", "conflicting"),
        ]});
        ResultIngestion::ingest(&mut conn, &target(&p1, "job-p1", &run1), &first, dir.path())
            .unwrap();
        ResultIngestion::ingest(
            &mut conn,
            &target(&p2, "job-p2", &run2),
            &second,
            dir.path(),
        )
        .unwrap();

        let p1_claims = Claims::list_for_project(&conn, &p1).unwrap();
        assert_eq!(p1_claims.len(), 1);
        assert_eq!(p1_claims[0].status, "draft");
        assert_eq!(p1_claims[0].confidence, "high");
        let p2_claims = Claims::list_for_project(&conn, &p2).unwrap();
        assert_eq!(p2_claims.len(), 1, "the second project owns its own claim");
        assert_eq!(p2_claims[0].status, "needs_review");
    }

    /// Review R7: the FIRST ingestion of a validated `needs_review` claim
    /// keeps that status — no second record required.
    #[test]
    fn first_ingestion_preserves_a_validated_claim_review_status() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-review");
        let dir = content_dir();
        let data = json!({"schema_version":"1", "job_id":"job-review", "records":[
            {"kind":"node","record":{
                "node_id":"node-review", "type":"concept", "title":"N", "confidence":"high"
            }},
            {"kind":"claim","record":{
                "claim_id":"claim-review", "subject_node_id":"node-review",
                "predicate":"is", "object_value":"uncertain",
                "status":"needs_review", "confidence":"conflicting"
            }},
        ]});
        ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-review", &run_id),
            &data,
            dir.path(),
        )
        .unwrap();
        let claim = Claims::get(&conn, &format!("{project_id}:claim-review"))
            .unwrap()
            .unwrap();
        assert_eq!(claim.status, "needs_review");
        assert_eq!(claim.confidence, "conflicting");
    }

    #[test]
    fn a_validated_claim_update_supersedes_the_stored_state() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &results_envelope("job-1"),
            dir.path(),
        )
        .unwrap();

        // The validation stage re-persisted the claim with review flags
        // (ADR-016): status moves to needs_review, confidence to conflicting.
        let updated = json!({
            "schema_version": "1",
            "job_id": "job-1",
            "records": [
                {"kind": "claim", "record": {
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
                }}
            ]
        });
        ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &updated,
            dir.path(),
        )
        .unwrap();
        let claim = Claims::get(&conn, &format!("{project_id}:wc-1"))
            .unwrap()
            .unwrap();
        assert_eq!(claim.status, "needs_review");
        assert_eq!(claim.confidence, "conflicting");
    }

    // ------------------------------------------------------------------
    // Envelope and boundary validation (review R6)
    // ------------------------------------------------------------------

    #[test]
    fn an_unknown_results_schema_version_is_rejected() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        let err = ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &json!({"schema_version":"999", "job_id":"job-1", "records":[]}),
            dir.path(),
        )
        .unwrap_err();
        assert!(
            err.developer_detail
                .contains("unsupported worker results schema_version"),
            "{err:?}"
        );
    }

    #[test]
    fn results_for_a_different_job_are_rejected() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        let err = ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &json!({"schema_version":"1", "job_id":"wrong-job", "records":[]}),
            dir.path(),
        )
        .unwrap_err();
        assert!(
            err.developer_detail.contains("names job 'wrong-job'"),
            "{err:?}"
        );
    }

    #[test]
    fn results_for_a_run_of_another_project_or_unbound_job_are_rejected() {
        let mut conn = migrated_memory_db().unwrap();
        let p1 = project(&mut conn);
        let p2 = project(&mut conn);
        let run1 = bound_run(&mut conn, &p1, "job-1");
        let dir = content_dir();
        let empty = json!({"schema_version":"1", "job_id":"job-1", "records":[]});

        // Project mismatch.
        let err =
            ResultIngestion::ingest(&mut conn, &target(&p2, "job-1", &run1), &empty, dir.path())
                .unwrap_err();
        assert!(
            err.developer_detail.contains("belongs to project"),
            "{err:?}"
        );

        // Run not bound to this job.
        let run2 = bound_run(&mut conn, &p2, "job-other");
        let err =
            ResultIngestion::ingest(&mut conn, &target(&p2, "job-1", &run2), &empty, dir.path())
                .unwrap_err();
        assert!(
            err.developer_detail.contains("is not bound to worker job"),
            "{err:?}"
        );

        // Unknown run.
        let err = ResultIngestion::ingest(
            &mut conn,
            &target(&p1, "job-1", "no-such-run"),
            &empty,
            dir.path(),
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"), "{err:?}");
    }

    #[test]
    fn a_missing_records_member_is_rejected() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        let err = ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &json!({"schema_version":"1", "job_id":"job-1"}),
            dir.path(),
        )
        .unwrap_err();
        assert!(
            err.developer_detail.contains("envelope failed validation"),
            "{err:?}"
        );
    }

    #[test]
    fn unknown_fields_kinds_and_enums_reject_the_whole_batch() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();

        let run_target = target(&project_id, "job-1", &run_id);

        // Unknown record kind.
        let bad_kind = json!({
            "schema_version": "1", "job_id": "job-1",
            "records": [{"kind": "sandcastle", "record": {}}],
        });
        assert!(ResultIngestion::ingest(&mut conn, &run_target, &bad_kind, dir.path()).is_err());

        // Unknown field inside a record: nothing may be half-written.
        let bad_field = json!({
            "schema_version": "1", "job_id": "job-1",
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
        assert!(ResultIngestion::ingest(&mut conn, &run_target, &bad_field, dir.path()).is_err());

        // Missing required field (source_id).
        let missing = json!({
            "schema_version": "1", "job_id": "job-1",
            "records": [
                {"kind": "source", "record": {
                    "url": "u", "canonical_url": "c"
                }},
            ],
        });
        assert!(ResultIngestion::ingest(&mut conn, &run_target, &missing, dir.path()).is_err());

        // Illegal enum values.
        let node = |node_type: &str, confidence: &str| {
            json!({"schema_version":"1","job_id":"job-1","records":[
                {"kind":"node","record":{
                    "node_id":"wn-bad","type":node_type,"title":"B",
                    "confidence":confidence
                }},
            ]})
        };
        assert!(ResultIngestion::ingest(
            &mut conn,
            &run_target,
            &node("alien", "high"),
            dir.path()
        )
        .unwrap_err()
        .developer_detail
        .contains("unknown node type"));
        assert!(ResultIngestion::ingest(
            &mut conn,
            &run_target,
            &node("concept", "certainly"),
            dir.path()
        )
        .unwrap_err()
        .developer_detail
        .contains("unknown confidence"));
        let bad_status = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"claim","record":{
                "claim_id":"wc-bad","subject_node_id":"wn-bad",
                "status":"final","confidence":"high"
            }},
        ]});
        assert!(
            ResultIngestion::ingest(&mut conn, &run_target, &bad_status, dir.path())
                .unwrap_err()
                .developer_detail
                .contains("unknown claim status")
        );
        let bad_direction = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"relation","record":{
                "relation_id":"wr-bad","subject_node_id":"wn-bad",
                "object_node_id":"wn-bad2","direction":"sideways"
            }},
        ]});
        assert!(
            ResultIngestion::ingest(&mut conn, &run_target, &bad_direction, dir.path())
                .unwrap_err()
                .developer_detail
                .contains("unknown relation direction")
        );
        let bad_class = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"source-content","record":{
                "source_id":"ws-1","content":"x","fingerprint":"f",
                "locator_base":"maybe"
            }},
        ]});
        assert!(
            ResultIngestion::ingest(&mut conn, &run_target, &bad_class, dir.path())
                .unwrap_err()
                .developer_detail
                .contains("unknown content class")
        );

        assert!(
            Sources::list_for_project(&conn, &project_id)
                .unwrap()
                .is_empty(),
            "a rejected batch writes nothing"
        );
    }

    /// Review R6: unresolvable references reject the batch instead of being
    /// silently skipped — every reference stays traceable.
    #[test]
    fn unresolvable_references_reject_the_batch() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        let run_target = target(&project_id, "job-1", &run_id);

        // Evidence whose source the batch never delivered.
        let orphan_evidence = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"evidence","record":{
                "evidence_id":"we-9","claim_id":"wc-9","source_id":"ws-ghost",
                "locator":{"quote":"q","section":null,"url_fragment":null,
                            "position":null,"retrieved_at":""},
                "direction":"contradicts"
            }},
        ]});
        let err = ResultIngestion::ingest(&mut conn, &run_target, &orphan_evidence, dir.path())
            .unwrap_err();
        assert!(
            err.developer_detail
                .contains("which the batch never delivered"),
            "{err:?}"
        );

        // A claim whose subject node is unknown to the batch and the project.
        let orphan_claim = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"claim","record":{
                "claim_id":"wc-9","subject_node_id":"wn-ghost",
                "status":"draft","confidence":"high"
            }},
        ]});
        let err =
            ResultIngestion::ingest(&mut conn, &run_target, &orphan_claim, dir.path()).unwrap_err();
        assert!(
            err.developer_detail
                .contains("neither in the batch nor ingested"),
            "{err:?}"
        );

        // Evidence with no locator anchor at all (RES-06).
        let anchorless = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"source","record":{
                "source_id":"ws-1","url":"u","canonical_url":"c","source_type":"paper"
            }},
            {"kind":"claim","record":{
                "claim_id":"wc-a","subject_node_id":"wn-a","status":"draft","confidence":"high"
            }},
            {"kind":"node","record":{
                "node_id":"wn-a","type":"concept","title":"A"
            }},
            {"kind":"evidence","record":{
                "evidence_id":"we-a","claim_id":"wc-a","source_id":"ws-1",
                "locator":{"quote":null,"section":null,"url_fragment":null,
                            "position":null,"retrieved_at":""},
                "direction":"supports"
            }},
        ]});
        let err =
            ResultIngestion::ingest(&mut conn, &run_target, &anchorless, dir.path()).unwrap_err();
        assert!(
            err.developer_detail.contains("no locator anchor"),
            "{err:?}"
        );

        assert!(
            Sources::list_for_project(&conn, &project_id)
                .unwrap()
                .is_empty(),
            "rejected reference batches write nothing"
        );
    }

    /// Cross-batch continuity: a later batch may reference nodes and claims
    /// an earlier batch of the same project ingested (incremental runs).
    #[test]
    fn later_batches_reference_earlier_nodes_and_claims() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &results_envelope("job-1"),
            dir.path(),
        )
        .unwrap();

        // A second batch carrying only a claim about the earlier node.
        let follow_up = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"claim","record":{
                "claim_id":"wc-2","subject_node_id":"wn-2",
                "predicate":"worked_at","object_value":"CERN",
                "status":"draft","confidence":"medium"
            }},
        ]});
        ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &follow_up,
            dir.path(),
        )
        .unwrap();
        let claim = Claims::get(&conn, &format!("{project_id}:wc-2"))
            .unwrap()
            .unwrap();
        assert_eq!(
            claim.subject,
            format!("{project_id}:wn-2"),
            "the earlier node resolves across batches"
        );
    }

    /// A row written by a pre-scoping build of this core is reused, not
    /// duplicated, when the same worker id arrives again.
    #[test]
    fn legacy_unscoped_rows_of_the_same_project_are_reused() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();

        // Simulate a pre-scoping database: the raw worker id is the row id.
        with_write_tx(&mut conn, |tx| {
            tx.execute(
                "INSERT INTO claims (id, project_id, subject, predicate, object_value, scope,
                                      status, confidence, provenance, created_at, updated_at)
                 VALUES ('wc-legacy', ?1, 's', 'p', '', '', 'draft', 'low', '', 1, 1)",
                rusqlite::params![project_id],
            )
            .map_err(CoreError::from)
        })
        .unwrap();

        let batch = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"claim","record":{
                "claim_id":"wc-legacy","subject_node_id":"wn-1",
                "predicate":"p","object_value":"v",
                "status":"confirmed","confidence":"high"
            }},
            {"kind":"node","record":{
                "node_id":"wn-1","type":"concept","title":"N"
            }},
        ]});
        ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &batch,
            dir.path(),
        )
        .unwrap();
        let claims = Claims::list_for_project(&conn, &project_id).unwrap();
        assert_eq!(claims.len(), 1, "no duplicate was created");
        assert_eq!(claims[0].id, "wc-legacy");
        assert_eq!(
            claims[0].status, "confirmed",
            "the update reached the legacy row"
        );
    }

    /// `unavailable` content: the row persists the classification with no
    /// file and no bytes (review R8).
    #[test]
    fn unavailable_content_persists_its_class_without_a_file() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        let batch = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"source","record":{
                "source_id":"ws-1","url":"https://x.test/a","canonical_url":"x.test/a",
                "source_type":"web_page"
            }},
            {"kind":"source-content","record":{
                "source_id":"ws-1","content":"","content_type":"text/plain",
                "fingerprint": sha256_of(""),"fetched_at":"2026-09-16T10:00:02Z",
                "locator_base":"unavailable"
            }},
        ]});
        ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &batch,
            dir.path(),
        )
        .unwrap();
        let sources = Sources::list_for_project(&conn, &project_id).unwrap();
        let row = crate::repositories::sources::SourceContents::get(
            &conn,
            &format!("sc:{}:{}", sources[0].id, sha256_of("")),
        )
        .unwrap()
        .unwrap();
        assert_eq!(row.content_class, "unavailable");
        assert_eq!(row.byte_size, 0);
        assert_eq!(row.cache_path, "");
        assert_eq!(
            dir.path().read_dir().unwrap().count(),
            0,
            "no file was written for empty content"
        );
    }

    /// Cache-consistency failure path (review E): when the cache file
    /// cannot be written (here: the content dir path is occupied by a
    /// FILE), the whole batch rejects — a row claiming cached content that
    /// does not exist on disk must never persist.
    #[test]
    fn an_unwritable_content_cache_rejects_the_batch() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let home = tempfile::tempdir().unwrap();
        let blocked = home.path().join("blocked");
        std::fs::write(&blocked, b"not a directory").unwrap();
        let batch = json!({"schema_version":"1","job_id":"job-1","records":[
            {"kind":"source","record":{
                "source_id":"ws-1","url":"https://x.test/a","canonical_url":"x.test/a",
                "source_type":"web_page"
            }},
            {"kind":"source-content","record":{
                "source_id":"ws-1","content":"payload bytes",
                "content_type":"text/plain","fingerprint": sha256_of("payload bytes"),
                "fetched_at":"2026-09-16T10:00:02Z","locator_base":"full-text"
            }},
        ]});
        let err = ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &batch,
            &blocked,
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("cache directory"), "{err:?}");
        // Nothing persisted — including the source row of the same batch.
        assert!(Sources::list_for_project(&conn, &project_id)
            .unwrap()
            .is_empty());
    }

    // ------------------------------------------------------------------
    // Cache <-> database consistency (round-2 review P1)
    // ------------------------------------------------------------------

    /// Round-2 probe: a batch that fails must never mutate the previously
    /// committed cache payload. The tampered batch declares `hello`'s
    /// fingerprint for different bytes — the SHA-256 verification rejects
    /// the batch before anything is written.
    #[test]
    fn a_rolled_back_batch_never_mutates_committed_cache_content() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-review");
        let dir = content_dir();
        let fingerprint = sha256_of("hello");
        let run_target = target(&project_id, "job-review", &run_id);

        let valid = json!({"schema_version":"1","job_id":"job-review","records":[
            {"kind":"source","record":{"source_id":"ws-1","url":"https://review.test/a",
                "canonical_url":"review.test/a","source_type":"paper"}},
            {"kind":"source-content","record":{"source_id":"ws-1","content":"hello",
                "content_type":"text/plain","fingerprint":fingerprint,
                "fetched_at":"2026-09-17T00:00:00Z","locator_base":"full-text"}},
        ]});
        ResultIngestion::ingest(&mut conn, &run_target, &valid, dir.path()).unwrap();
        let cache_path: String = conn
            .query_row("SELECT cache_path FROM source_contents LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(std::fs::read_to_string(&cache_path).unwrap(), "hello");

        // Tampered payload under the committed fingerprint's name.
        let tampered = json!({"schema_version":"1","job_id":"job-review","records":[
            {"kind":"source","record":{"source_id":"ws-1","url":"https://review.test/a",
                "canonical_url":"review.test/a","source_type":"paper"}},
            {"kind":"source-content","record":{"source_id":"ws-1","content":"tampered",
                "content_type":"text/plain","fingerprint":fingerprint,
                "fetched_at":"2026-09-17T00:00:01Z","locator_base":"full-text"}},
        ]});
        let err =
            ResultIngestion::ingest(&mut conn, &run_target, &tampered, dir.path()).unwrap_err();
        assert!(
            err.developer_detail.contains("fingerprint mismatch"),
            "{err:?}"
        );
        assert_eq!(
            std::fs::read_to_string(&cache_path).unwrap(),
            "hello",
            "a rolled-back batch must not mutate the previously committed cache payload"
        );

        // A valid-fingerprint payload in a batch whose LATER record fails:
        // the database rolls back AND the failed batch leaves no new file
        // behind (compensation).
        let tampered_hash = sha256_of("tampered");
        let rollback = json!({"schema_version":"1","job_id":"job-review","records":[
            {"kind":"source","record":{"source_id":"ws-1","url":"https://review.test/a",
                "canonical_url":"review.test/a","source_type":"paper"}},
            {"kind":"source-content","record":{"source_id":"ws-1","content":"tampered",
                "content_type":"text/plain","fingerprint":tampered_hash,
                "fetched_at":"2026-09-17T00:00:01Z","locator_base":"full-text"}},
            {"kind":"relation","record":{"relation_id":"wr-bad",
                "subject_node_id":"missing-a","predicate":"related",
                "object_node_id":"missing-b","direction":"directed",
                "confidence":"medium"}},
        ]});
        assert!(ResultIngestion::ingest(&mut conn, &run_target, &rollback, dir.path()).is_err());
        assert_eq!(
            std::fs::read_to_string(&cache_path).unwrap(),
            "hello",
            "the committed payload keeps its bytes"
        );
        assert_eq!(
            dir.path().read_dir().unwrap().count(),
            1,
            "the failed batch left no file behind (only the committed one remains)"
        );
        // No database row survived the rollback either.
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM source_contents", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1);
    }

    /// A corrupted cache file (torn write / external tampering) self-heals on
    /// the next ingest of the same verified content.
    #[test]
    fn a_corrupted_cache_file_self_heals_on_reingest() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        let run_target = target(&project_id, "job-1", &run_id);
        let batch = |fingerprint: &str| {
            json!({"schema_version":"1","job_id":"job-1","records":[
                {"kind":"source","record":{"source_id":"ws-1","url":"https://x.test/a",
                    "canonical_url":"x.test/a","source_type":"web_page"}},
                {"kind":"source-content","record":{"source_id":"ws-1","content":"payload",
                    "content_type":"text/plain","fingerprint":fingerprint,
                    "fetched_at":"2026-09-17T00:00:00Z","locator_base":"full-text"}},
            ]})
        };
        let fingerprint = sha256_of("payload");
        ResultIngestion::ingest(&mut conn, &run_target, &batch(&fingerprint), dir.path()).unwrap();
        let cache_path: String = conn
            .query_row("SELECT cache_path FROM source_contents LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        // Simulate a torn write: the referenced file no longer hashes to its
        // name.
        std::fs::write(&cache_path, "torn-bytes").unwrap();

        ResultIngestion::ingest(&mut conn, &run_target, &batch(&fingerprint), dir.path()).unwrap();
        assert_eq!(
            std::fs::read_to_string(&cache_path).unwrap(),
            "payload",
            "the verified payload replaced the corrupted bytes"
        );
    }

    /// Evidence locators persist losslessly with the WORKER's retrieval time
    /// (round-2 review P2) — never the ingestion clock.
    #[test]
    fn evidence_locator_detail_and_retrieved_at_persist_worker_facts() {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = project(&mut conn);
        let run_id = bound_run(&mut conn, &project_id, "job-1");
        let dir = content_dir();
        ResultIngestion::ingest(
            &mut conn,
            &target(&project_id, "job-1", &run_id),
            &results_envelope("job-1"),
            dir.path(),
        )
        .unwrap();
        let evidence =
            crate::repositories::evidence::Evidence::list_for_project(&conn, &project_id).unwrap();
        assert_eq!(evidence.len(), 1);
        let record = &evidence[0];
        let detail: serde_json::Value =
            serde_json::from_str(&record.locator_detail).expect("locator_detail is JSON");
        assert_eq!(
            detail["quote"],
            json!("Entanglement requires nonclassical correlations")
        );
        assert_eq!(detail["section"], json!("Conclusions"));
        assert_eq!(detail["url_fragment"], json!(null));
        assert_eq!(
            detail["retrieved_at"],
            json!("2026-09-16T10:00:00Z"),
            "the worker's original retrieval time persists verbatim"
        );
        // retrieved_at parses from the locator's timestamp, not the ingest
        // clock.
        assert_eq!(
            record.retrieved_at,
            crate::ids::parse_rfc3339_ms("2026-09-16T10:00:00Z").unwrap()
        );
    }
}
