//! Worker protocol message bindings.
//!
//! Protocol messages are CLOSED envelopes: unknown fields are rejected in every
//! stack (zod strict / pydantic forbid / serde `deny_unknown_fields`).

use serde::{Deserialize, Serialize};

use crate::schema_version::SchemaVersionV1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkerJobType {
    Search,
    SourceEvaluation,
    Extraction,
    Entity,
    Relation,
    Validation,
    Writer,
    Synthesis,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProtocolVersion {
    #[serde(rename = "1.0")]
    V1_0,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkerErrorCode {
    #[serde(rename = "WORKER_NOT_AVAILABLE")]
    WorkerNotAvailable,
    #[serde(rename = "PROVIDER_AUTH_FAILED")]
    ProviderAuthFailed,
    #[serde(rename = "PROVIDER_TIMEOUT")]
    ProviderTimeout,
    #[serde(rename = "SEARCH_FAILED")]
    SearchFailed,
    #[serde(rename = "SOURCE_PARSE_FAILED")]
    SourceParseFailed,
    #[serde(rename = "LLM_INVALID_JSON")]
    LlmInvalidJson,
    #[serde(rename = "TASK_DEPENDENCY_FAILED")]
    TaskDependencyFailed,
    #[serde(rename = "VAULT_WRITE_FAILED")]
    VaultWriteFailed,
    #[serde(rename = "VAULT_SCHEMA_MISMATCH")]
    VaultSchemaMismatch,
    #[serde(rename = "DATABASE_ERROR")]
    DatabaseError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerHealthResponse {
    pub schema_version: SchemaVersionV1,
    pub status: WorkerHealthStatus,
    pub worker_version: String,
    pub protocol_version: ProtocolVersion,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkerHealthStatus {
    #[serde(rename = "ok")]
    Ok,
    #[serde(rename = "degraded")]
    Degraded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerVersionResponse {
    pub schema_version: SchemaVersionV1,
    pub worker_version: String,
    pub protocol_version: ProtocolVersion,
    pub capabilities: Vec<WorkerJobType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerJobRequest {
    pub schema_version: SchemaVersionV1,
    pub job_id: String,
    pub task_id: String,
    pub run_id: Option<String>,
    #[serde(rename = "type")]
    pub job_type: WorkerJobType,
    pub payload: Option<serde_json::Value>,
    pub idempotency_key: String,
    pub checkpoint: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerJobResponse {
    pub schema_version: SchemaVersionV1,
    pub job_id: String,
    pub status: WorkerAcceptStatus,
    pub accepted: bool,
    pub duplicate: Option<bool>,
    pub accepted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkerAcceptStatus {
    Queued,
    Running,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerJobProgress {
    pub percent: Option<i64>,
    pub stage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkerExecutionStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerJobStatus {
    pub schema_version: SchemaVersionV1,
    pub job_id: String,
    pub task_id: String,
    #[serde(rename = "type")]
    pub job_type: WorkerJobType,
    pub status: WorkerExecutionStatus,
    pub progress: Option<WorkerJobProgress>,
    pub checkpoint: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkerCancelStatus {
    Cancelling,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerCancelResponse {
    pub schema_version: SchemaVersionV1,
    pub job_id: String,
    pub status: WorkerCancelStatus,
    pub previous_status: Option<WorkerAcceptStatus>,
    pub requested_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkerEventType {
    #[serde(rename = "job.accepted")]
    JobAccepted,
    #[serde(rename = "job.started")]
    JobStarted,
    #[serde(rename = "job.progress")]
    JobProgress,
    #[serde(rename = "job.checkpoint")]
    JobCheckpoint,
    #[serde(rename = "job.completed")]
    JobCompleted,
    #[serde(rename = "job.failed")]
    JobFailed,
    #[serde(rename = "job.cancelled")]
    JobCancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerEvent {
    pub schema_version: SchemaVersionV1,
    pub event_id: String,
    pub seq: i64,
    pub job_id: String,
    pub run_id: Option<String>,
    pub task_id: Option<String>,
    pub timestamp: String,
    #[serde(rename = "type")]
    pub event_type: WorkerEventType,
    pub payload: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerErrorBlock {
    pub code: WorkerErrorCode,
    pub user_message: String,
    pub developer_detail: String,
    pub retryable: bool,
    pub correlation_id: String,
    pub cause: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkerErrorEnvelope {
    pub schema_version: SchemaVersionV1,
    pub error: WorkerErrorBlock,
}

use crate::ContractValid;

impl ContractValid for WorkerHealthResponse {
    fn check_contract(&self) -> Result<(), String> {
        if self.worker_version.is_empty() {
            return Err("worker_version must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for WorkerVersionResponse {
    fn check_contract(&self) -> Result<(), String> {
        if self.worker_version.is_empty() {
            return Err("worker_version must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for WorkerJobRequest {
    fn check_contract(&self) -> Result<(), String> {
        if self.job_id.is_empty() || self.task_id.is_empty() || self.idempotency_key.is_empty() {
            return Err("job_id, task_id, and idempotency_key must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for WorkerJobResponse {
    fn check_contract(&self) -> Result<(), String> {
        if self.job_id.is_empty() {
            return Err("job_id must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for WorkerJobStatus {
    fn check_contract(&self) -> Result<(), String> {
        if self.job_id.is_empty() || self.task_id.is_empty() {
            return Err("job_id and task_id must not be empty".into());
        }
        if self
            .progress
            .as_ref()
            .is_some_and(|p| p.percent.is_some_and(|v| !(0..=100).contains(&v)))
        {
            return Err("progress.percent must be between 0 and 100".into());
        }
        Ok(())
    }
}

impl ContractValid for WorkerCancelResponse {
    fn check_contract(&self) -> Result<(), String> {
        if self.job_id.is_empty() {
            return Err("job_id must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for WorkerEvent {
    fn check_contract(&self) -> Result<(), String> {
        if self.event_id.is_empty() || self.job_id.is_empty() {
            return Err("event_id and job_id must not be empty".into());
        }
        if self.seq < 1 {
            return Err(format!("seq must be >= 1, got {}", self.seq));
        }
        Ok(())
    }
}

impl ContractValid for WorkerErrorBlock {
    fn check_contract(&self) -> Result<(), String> {
        if self.user_message.is_empty() || self.correlation_id.is_empty() {
            return Err("user_message and correlation_id must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for WorkerErrorEnvelope {
    fn check_contract(&self) -> Result<(), String> {
        self.error.check_contract()
    }
}
