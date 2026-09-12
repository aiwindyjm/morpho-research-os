//! Knowledge-layer domain record bindings (open records).
//!
//! Chain: Source -> Evidence -> Claim -> Knowledge. Claims and evidence are
//! never folded into node summaries; conflicting claims coexist.

use serde::{Deserialize, Serialize};

use crate::schema_version::SchemaVersionV1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceKind {
    Web,
    Paper,
    Book,
    Github,
    Dataset,
    News,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QualityRating {
    High,
    Medium,
    Low,
    Unevaluated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ContentFormat {
    Html,
    Pdf,
    Markdown,
    Plain,
    Json,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KnowledgeNodeType {
    Concept,
    Person,
    Organization,
    Company,
    Paper,
    Book,
    Experiment,
    Event,
    Technology,
    Product,
    Application,
    Policy,
    Dataset,
    Controversy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NodeStatus {
    Active,
    Merged,
    Superseded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Confidence {
    Confirmed,
    High,
    Medium,
    Low,
    Unverified,
    Conflicting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReviewState {
    Unreviewed,
    NeedsReview,
    Reviewed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EvidenceDirection {
    Support,
    Contradict,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RelationConfidence {
    Confirmed,
    High,
    Medium,
    Low,
    Unverified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArtifactKind {
    VaultExport,
    Report,
    GraphSnapshot,
    CoverageReport,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceQuality {
    pub authority: Option<QualityRating>,
    pub fitness: Option<QualityRating>,
    pub evaluated_at: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub schema_version: SchemaVersionV1,
    pub source_id: String,
    pub project_id: String,
    pub url: String,
    pub title: String,
    pub kind: SourceKind,
    pub published_at: Option<String>,
    pub retrieved_at: String,
    pub languages: Option<Vec<String>>,
    pub dedup_key: String,
    pub quality: Option<SourceQuality>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceContent {
    pub schema_version: SchemaVersionV1,
    pub content_id: String,
    pub source_id: String,
    pub format: ContentFormat,
    pub content_hash: String,
    pub language: Option<String>,
    pub fetched_at: String,
    pub cache_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeNode {
    pub schema_version: SchemaVersionV1,
    pub node_id: String,
    pub project_id: String,
    #[serde(rename = "type")]
    pub node_type: KnowledgeNodeType,
    pub title: String,
    pub aliases: Option<Vec<String>>,
    pub summary: Option<String>,
    pub status: Option<NodeStatus>,
    pub confidence: Confidence,
    pub source_ids: Option<Vec<String>>,
    pub claim_ids: Option<Vec<String>>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClaimProvenance {
    pub created_by: Option<CreatedBy>,
    pub prompt_id: Option<String>,
    pub prompt_version: Option<String>,
    pub task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CreatedBy {
    User,
    Ai,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    pub schema_version: SchemaVersionV1,
    pub claim_id: String,
    pub project_id: String,
    pub subject_node_id: String,
    pub predicate: String,
    pub object: String,
    pub scope: Option<String>,
    pub status: Confidence,
    pub evidence_ids: Option<Vec<String>>,
    pub provenance: Option<ClaimProvenance>,
    pub review_state: Option<ReviewState>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvidenceLocator {
    pub quote: Option<String>,
    pub page: Option<String>,
    pub section: Option<String>,
    pub fragment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub schema_version: SchemaVersionV1,
    pub evidence_id: String,
    pub claim_id: String,
    pub source_id: String,
    pub direction: EvidenceDirection,
    pub locator: EvidenceLocator,
    pub extraction_method: Option<CreatedBy>,
    pub retrieved_at: String,
    pub revised_at: Option<String>,
    pub superseded_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RelationDirection {
    Directed,
    Undirected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relation {
    pub schema_version: SchemaVersionV1,
    pub relation_id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub predicate: String,
    pub direction: Option<RelationDirection>,
    pub confidence: RelationConfidence,
    pub status: Option<NodeStatus>,
    pub source_ids: Option<Vec<String>>,
    pub claim_ids: Option<Vec<String>>,
    pub provenance: Option<ClaimProvenance>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArtifactFormat {
    Markdown,
    Json,
    Png,
    Svg,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub schema_version: SchemaVersionV1,
    pub artifact_id: String,
    pub project_id: String,
    pub kind: ArtifactKind,
    pub run_id: Option<String>,
    pub path: Option<String>,
    pub format: Option<ArtifactFormat>,
    pub note: Option<String>,
    pub created_at: String,
}

use crate::ContractValid;

impl ContractValid for Source {
    fn check_contract(&self) -> Result<(), String> {
        if self.source_id.is_empty() || self.project_id.is_empty() {
            return Err("source_id and project_id must not be empty".into());
        }
        if self.url.is_empty() || self.title.is_empty() || self.dedup_key.is_empty() {
            return Err("url, title, and dedup_key must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for SourceContent {
    fn check_contract(&self) -> Result<(), String> {
        if self.content_id.is_empty() || self.source_id.is_empty() {
            return Err("content_id and source_id must not be empty".into());
        }
        if self.content_hash.len() < 8 {
            return Err("content_hash must be at least 8 characters".into());
        }
        Ok(())
    }
}

impl ContractValid for KnowledgeNode {
    fn check_contract(&self) -> Result<(), String> {
        if self.node_id.is_empty() || self.project_id.is_empty() {
            return Err("node_id and project_id must not be empty".into());
        }
        if self.title.is_empty() {
            return Err("title must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for Claim {
    fn check_contract(&self) -> Result<(), String> {
        if self.claim_id.is_empty() || self.project_id.is_empty() || self.subject_node_id.is_empty()
        {
            return Err("claim_id, project_id, and subject_node_id must not be empty".into());
        }
        if self.predicate.is_empty() || self.object.is_empty() {
            return Err("predicate and object must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for Evidence {
    fn check_contract(&self) -> Result<(), String> {
        if self.evidence_id.is_empty() || self.claim_id.is_empty() || self.source_id.is_empty() {
            return Err("evidence_id, claim_id, and source_id must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for Relation {
    fn check_contract(&self) -> Result<(), String> {
        if self.relation_id.is_empty() || self.from_node_id.is_empty() || self.to_node_id.is_empty()
        {
            return Err("relation_id, from_node_id, and to_node_id must not be empty".into());
        }
        if self.predicate.is_empty() {
            return Err("predicate must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for Artifact {
    fn check_contract(&self) -> Result<(), String> {
        if self.artifact_id.is_empty() || self.project_id.is_empty() {
            return Err("artifact_id and project_id must not be empty".into());
        }
        Ok(())
    }
}
