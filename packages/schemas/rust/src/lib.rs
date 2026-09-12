//! Serde bindings for the canonical Morpho Research OS JSON Schemas.
//!
//! Every binding mirrors a schema file in `packages/schemas` and is proven
//! equivalent by the shared corpus under `packages/schemas/fixtures/cases`
//! (see `tests/corpus.rs`).

pub mod envelope;
pub mod event;
pub mod knowledge;
pub mod project;
pub mod prompt;
pub mod provider;
pub mod schema_version;
pub mod worker;

use serde::de::DeserializeOwned;

pub use envelope::{
    FixtureContract, FixtureEnvelope, FixtureExpectedOutput, FixtureOrigin, FixturePrompt,
    FixtureProvenance, FixtureProvenanceKind, FixtureStability,
};
pub use event::{Event, EventType};
pub use knowledge::{
    Artifact, ArtifactFormat, ArtifactKind, Claim, ClaimProvenance, Confidence, ContentFormat,
    CreatedBy, Evidence, EvidenceDirection, EvidenceLocator, KnowledgeNode, KnowledgeNodeType,
    NodeStatus, QualityRating, Relation, RelationConfidence, RelationDirection, ReviewState,
    Source, SourceContent, SourceKind, SourceQuality,
};
pub use project::{
    PlanGeneratedBy, Project, ResearchConfig, ResearchPlan, ResearchPlanStatus, ResearchPurpose,
    ResearchRun, ResearchRunStatus, ResearchSection, ResearchTask, ResearchTaskStatus,
    ResearchTaskType, TaskDependency, TaskDependencyCondition, TimeRange,
};
pub use prompt::{GoldenCase, ModelCapability, ModelHint, PromptMetadata, PromptStage, SchemaRef};
pub use provider::{EstimatedCost, ProviderConfig, ProviderKind, ProviderRetry, UsageRecord};
pub use schema_version::SchemaVersionV1;
pub use worker::{
    ProtocolVersion, WorkerCancelResponse, WorkerCancelStatus, WorkerErrorBlock, WorkerErrorCode,
    WorkerErrorEnvelope, WorkerEvent, WorkerEventType, WorkerExecutionStatus, WorkerHealthResponse,
    WorkerHealthStatus, WorkerJobProgress, WorkerJobRequest, WorkerJobResponse, WorkerJobStatus,
    WorkerJobType, WorkerVersionResponse,
};

/// Post-deserialization constraints from the canonical JSON Schemas that serde
/// derive cannot express mechanically (numeric ranges, minItems, minLength).
/// Implementations mirror the schema vocabulary exactly; `tests/corpus.rs`
/// proves they agree with the canonical validator.
pub trait ContractValid {
    fn check_contract(&self) -> Result<(), String> {
        Ok(())
    }
}

/// Canonical schema names that have a Serde binding. Keep in sync with the
/// schema files in `packages/schemas`; `tests/corpus.rs` enforces completeness.
pub const BINDING_NAMES: &[&str] = &[
    "artifact",
    "claim",
    "evidence",
    "event",
    "fixture-envelope",
    "knowledge-node",
    "project",
    "prompt-metadata",
    "provider-config",
    "relation",
    "research-config",
    "research-plan",
    "research-run",
    "research-section",
    "research-task",
    "source",
    "source-content",
    "task-dependency",
    "usage-record",
    "worker-cancel-response",
    "worker-error",
    "worker-event",
    "worker-health",
    "worker-job-request",
    "worker-job-response",
    "worker-job-status",
    "worker-version",
];

/// Validates `value` against the binding registered for `name`.
///
/// Returns `Err` with a descriptive message when the instance does not satisfy
/// the contract or the name is unknown. Keep the match arms in sync with the
/// schema files in `packages/schemas`; `tests/corpus.rs` enforces completeness.
pub fn validate_binding(name: &str, value: &serde_json::Value) -> Result<(), String> {
    match name {
        "artifact" => check::<Artifact>(value),
        "claim" => check::<Claim>(value),
        "evidence" => check::<Evidence>(value),
        "event" => check::<Event>(value),
        "fixture-envelope" => check::<FixtureEnvelope>(value),
        "knowledge-node" => check::<KnowledgeNode>(value),
        "project" => check::<Project>(value),
        "prompt-metadata" => check::<PromptMetadata>(value),
        "provider-config" => check::<ProviderConfig>(value),
        "relation" => check::<Relation>(value),
        "research-config" => check::<ResearchConfig>(value),
        "research-plan" => check::<ResearchPlan>(value),
        "research-run" => check::<ResearchRun>(value),
        "research-section" => check::<ResearchSection>(value),
        "research-task" => check::<ResearchTask>(value),
        "source" => check::<Source>(value),
        "source-content" => check::<SourceContent>(value),
        "task-dependency" => check::<TaskDependency>(value),
        "usage-record" => check::<UsageRecord>(value),
        "worker-cancel-response" => check::<WorkerCancelResponse>(value),
        "worker-error" => check::<WorkerErrorEnvelope>(value),
        "worker-event" => check::<WorkerEvent>(value),
        "worker-health" => check::<WorkerHealthResponse>(value),
        "worker-job-request" => check::<WorkerJobRequest>(value),
        "worker-job-response" => check::<WorkerJobResponse>(value),
        "worker-job-status" => check::<WorkerJobStatus>(value),
        "worker-version" => check::<WorkerVersionResponse>(value),
        other => Err(format!("unknown schema name '{other}'")),
    }
}

fn check<T: DeserializeOwned + ContractValid>(value: &serde_json::Value) -> Result<(), String> {
    let instance: T = serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;
    instance.check_contract()
}
