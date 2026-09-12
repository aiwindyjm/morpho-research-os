//! Domain research event binding (PRD §6 "Event").
//!
//! Ordered, append-only, reconnectable projections of research activity.
//! Closed envelope (deny_unknown_fields) with a permissive, already-redacted
//! payload; payloads must never contain secrets or raw provider responses.

use serde::{Deserialize, Serialize};

use crate::schema_version::SchemaVersionV1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EventType {
    #[serde(rename = "task.created")]
    TaskCreated,
    #[serde(rename = "task.started")]
    TaskStarted,
    #[serde(rename = "task.progress")]
    TaskProgress,
    #[serde(rename = "task.checkpoint")]
    TaskCheckpoint,
    #[serde(rename = "task.completed")]
    TaskCompleted,
    #[serde(rename = "task.failed")]
    TaskFailed,
    #[serde(rename = "task.skipped")]
    TaskSkipped,
    #[serde(rename = "run.started")]
    RunStarted,
    #[serde(rename = "run.paused")]
    RunPaused,
    #[serde(rename = "run.completed")]
    RunCompleted,
    #[serde(rename = "run.failed")]
    RunFailed,
    #[serde(rename = "run.cancelled")]
    RunCancelled,
    #[serde(rename = "plan.drafted")]
    PlanDrafted,
    #[serde(rename = "plan.approved")]
    PlanApproved,
    #[serde(rename = "plan.rejected")]
    PlanRejected,
    #[serde(rename = "plan.superseded")]
    PlanSuperseded,
    #[serde(rename = "source.discovered")]
    SourceDiscovered,
    #[serde(rename = "source.fetched")]
    SourceFetched,
    #[serde(rename = "source.evaluated")]
    SourceEvaluated,
    #[serde(rename = "claim.created")]
    ClaimCreated,
    #[serde(rename = "claim.updated")]
    ClaimUpdated,
    #[serde(rename = "claim.superseded")]
    ClaimSuperseded,
    #[serde(rename = "review.requested")]
    ReviewRequested,
    #[serde(rename = "review.resolved")]
    ReviewResolved,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Event {
    pub schema_version: SchemaVersionV1,
    pub event_id: String,
    pub sequence: i64,
    pub occurred_at: String,
    pub run_id: Option<String>,
    pub task_id: Option<String>,
    pub project_id: String,
    #[serde(rename = "type")]
    pub event_type: EventType,
    pub summary: Option<String>,
    pub payload: serde_json::Value,
}

use crate::ContractValid;

impl ContractValid for Event {
    fn check_contract(&self) -> Result<(), String> {
        if self.event_id.is_empty() || self.project_id.is_empty() {
            return Err("event_id and project_id must not be empty".into());
        }
        if self.sequence < 1 {
            return Err("sequence must be at least 1".into());
        }
        if let Some(run_id) = &self.run_id {
            if run_id.is_empty() {
                return Err("run_id must not be empty when present".into());
            }
        }
        if let Some(task_id) = &self.task_id {
            if task_id.is_empty() {
                return Err("task_id must not be empty when present".into());
            }
        }
        Ok(())
    }
}
