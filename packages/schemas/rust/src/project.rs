//! Project, research configuration, plan, section, task, dependency, and run bindings.
//!
//! Domain records are open: unknown additive fields from newer minors are ignored,
//! matching the canonical JSON Schemas. Enums use `rename_all` to match the
//! canonical casing exactly.

use serde::{Deserialize, Serialize};

use crate::schema_version::SchemaVersionV1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchPurpose {
    Learning,
    Teaching,
    Writing,
    Research,
    Industry,
    Product,
    Strategy,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchPlanStatus {
    Draft,
    PendingApproval,
    Approved,
    Rejected,
    Superseded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchTaskType {
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
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResearchTaskStatus {
    Pending,
    Planning,
    Running,
    Validating,
    NeedsReview,
    Completed,
    Failed,
    Paused,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TaskDependencyCondition {
    Completed,
    CompletedOrSkipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchRunStatus {
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub schema_version: SchemaVersionV1,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub vault_path: Option<String>,
    pub archived: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRange {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchConfig {
    pub schema_version: SchemaVersionV1,
    pub config_id: String,
    pub project_id: String,
    pub domain: String,
    pub topic: String,
    pub purpose: ResearchPurpose,
    pub audience: Option<String>,
    pub depth: i32,
    pub dimensions: Vec<String>,
    pub time_range: Option<TimeRange>,
    pub geographic_scope: Option<String>,
    pub languages: Vec<String>,
    pub source_types: Vec<String>,
    pub source_domains: Option<Vec<String>>,
    pub update_frequency: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanGeneratedBy {
    pub prompt_id: String,
    pub prompt_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchPlan {
    pub schema_version: SchemaVersionV1,
    pub plan_id: String,
    pub project_id: String,
    pub config_id: String,
    pub title: Option<String>,
    pub status: ResearchPlanStatus,
    pub section_ids: Vec<String>,
    pub generated_by: Option<PlanGeneratedBy>,
    pub approved_at: Option<String>,
    pub rejected_at: Option<String>,
    pub superseded_by: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchSection {
    pub schema_version: SchemaVersionV1,
    pub section_id: String,
    pub plan_id: String,
    pub title: String,
    pub dimension: Option<String>,
    pub rationale: Option<String>,
    pub order: i64,
    pub task_ids: Option<Vec<String>>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchTask {
    pub schema_version: SchemaVersionV1,
    pub task_id: String,
    pub plan_id: String,
    pub run_id: Option<String>,
    pub section_id: Option<String>,
    pub project_id: String,
    #[serde(rename = "type")]
    pub task_type: ResearchTaskType,
    pub status: ResearchTaskStatus,
    pub idempotency_key: String,
    pub checkpoint: Option<serde_json::Value>,
    pub retry_count: Option<i64>,
    pub max_retries: Option<i64>,
    pub cache_refs: Option<Vec<String>>,
    pub result_ref: Option<String>,
    pub error_ref: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDependency {
    pub schema_version: SchemaVersionV1,
    pub task_id: String,
    pub depends_on_task_id: String,
    pub condition: TaskDependencyCondition,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchRun {
    pub schema_version: SchemaVersionV1,
    pub run_id: String,
    pub project_id: String,
    pub plan_id: String,
    pub status: ResearchRunStatus,
    pub config_snapshot: Option<serde_json::Value>,
    pub plan_snapshot_ref: Option<String>,
    pub stats: Option<serde_json::Value>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

use crate::ContractValid;

impl ContractValid for Project {
    fn check_contract(&self) -> Result<(), String> {
        if self.name.is_empty() {
            return Err("name must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for ResearchConfig {
    fn check_contract(&self) -> Result<(), String> {
        if self.domain.is_empty() {
            return Err("domain must not be empty".into());
        }
        if self.topic.is_empty() {
            return Err("topic must not be empty".into());
        }
        if !(1..=5).contains(&self.depth) {
            return Err(format!("depth must be between 1 and 5, got {}", self.depth));
        }
        if self.dimensions.is_empty() || self.dimensions.iter().any(|d| d.is_empty()) {
            return Err("dimensions must have at least one non-empty item".into());
        }
        if self.languages.is_empty() || self.languages.iter().any(|l| l.len() < 2) {
            return Err("languages must have at least one item of length >= 2".into());
        }
        if self.source_types.is_empty() || self.source_types.iter().any(|s| s.is_empty()) {
            return Err("source_types must have at least one non-empty item".into());
        }
        Ok(())
    }
}

impl ContractValid for ResearchPlan {
    fn check_contract(&self) -> Result<(), String> {
        if self.section_ids.is_empty() {
            return Err("section_ids must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for ResearchSection {
    fn check_contract(&self) -> Result<(), String> {
        if self.title.is_empty() {
            return Err("title must not be empty".into());
        }
        if self.order < 0 {
            return Err(format!("order must be >= 0, got {}", self.order));
        }
        Ok(())
    }
}

impl ContractValid for ResearchTask {
    fn check_contract(&self) -> Result<(), String> {
        if self.idempotency_key.is_empty() {
            return Err("idempotency_key must not be empty".into());
        }
        if self.retry_count.is_some_and(|r| r < 0) {
            return Err("retry_count must be >= 0".into());
        }
        if self.max_retries.is_some_and(|r| r < 0) {
            return Err("max_retries must be >= 0".into());
        }
        Ok(())
    }
}

impl ContractValid for TaskDependency {}
impl ContractValid for ResearchRun {}
