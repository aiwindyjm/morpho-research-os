//! Serde bindings for the canonical Morpho Research OS JSON Schemas.
//!
//! Every binding mirrors a schema file in `packages/schemas` and is proven
//! equivalent by the shared corpus under `packages/schemas/fixtures/cases`
//! (see `tests/corpus.rs`).

pub mod envelope;
pub mod project;
pub mod schema_version;
pub mod worker;

use serde::de::DeserializeOwned;

pub use envelope::{
    FixtureContract, FixtureEnvelope, FixturePrompt, FixtureProvenance, FixtureProvenanceKind,
    FixtureStability,
};
pub use project::{
    PlanGeneratedBy, Project, ResearchConfig, ResearchPlan, ResearchPlanStatus, ResearchPurpose,
    ResearchRun, ResearchRunStatus, ResearchSection, ResearchTask, ResearchTaskStatus,
    ResearchTaskType, TaskDependency, TaskDependencyCondition, TimeRange,
};
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
    "fixture-envelope",
    "project",
    "research-config",
    "research-plan",
    "research-run",
    "research-section",
    "research-task",
    "task-dependency",
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
        "fixture-envelope" => check::<FixtureEnvelope>(value),
        "project" => check::<Project>(value),
        "research-config" => check::<ResearchConfig>(value),
        "research-plan" => check::<ResearchPlan>(value),
        "research-run" => check::<ResearchRun>(value),
        "research-section" => check::<ResearchSection>(value),
        "research-task" => check::<ResearchTask>(value),
        "task-dependency" => check::<TaskDependency>(value),
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
