//! Provider configuration and usage accounting bindings (closed records).

use serde::{Deserialize, Serialize};

use crate::schema_version::SchemaVersionV1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    Llm,
    Search,
    Embedding,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderRetry {
    pub max_attempts: i64,
    pub backoff_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderConfig {
    pub schema_version: SchemaVersionV1,
    pub provider_id: String,
    pub kind: ProviderKind,
    pub base_url: String,
    pub key_reference: Option<String>,
    pub model: String,
    pub timeout_ms: i64,
    pub retry: ProviderRetry,
    pub extra_headers: Option<std::collections::BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EstimatedCost {
    pub amount: f64,
    pub currency: Currency,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Currency {
    #[serde(rename = "USD")]
    Usd,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UsageRecord {
    pub schema_version: SchemaVersionV1,
    pub usage_id: String,
    pub task_id: String,
    pub run_id: Option<String>,
    pub provider_id: String,
    pub kind: Option<ProviderKind>,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub duration_ms: i64,
    pub estimated_cost_usd: Option<EstimatedCost>,
    pub cache_hit: Option<bool>,
    pub retries: Option<i64>,
    pub created_at: String,
}

use crate::ContractValid;

impl ContractValid for ProviderRetry {
    fn check_contract(&self) -> Result<(), String> {
        if !(1..=10).contains(&self.max_attempts) {
            return Err(format!(
                "retry.max_attempts must be between 1 and 10, got {}",
                self.max_attempts
            ));
        }
        if self.backoff_ms < 0 {
            return Err("retry.backoff_ms must be >= 0".into());
        }
        Ok(())
    }
}

impl ContractValid for ProviderConfig {
    fn check_contract(&self) -> Result<(), String> {
        if self.provider_id.is_empty() || self.base_url.is_empty() || self.model.is_empty() {
            return Err("provider_id, base_url, and model must not be empty".into());
        }
        if self.timeout_ms < 100 {
            return Err(format!(
                "timeout_ms must be >= 100, got {}",
                self.timeout_ms
            ));
        }
        self.retry.check_contract()
    }
}

impl ContractValid for EstimatedCost {
    fn check_contract(&self) -> Result<(), String> {
        if self.amount < 0.0 {
            return Err(format!(
                "estimated_cost_usd.amount must be >= 0, got {}",
                self.amount
            ));
        }
        Ok(())
    }
}

impl ContractValid for UsageRecord {
    fn check_contract(&self) -> Result<(), String> {
        if self.usage_id.is_empty() || self.task_id.is_empty() || self.provider_id.is_empty() {
            return Err("usage_id, task_id, and provider_id must not be empty".into());
        }
        if self.model.is_empty() {
            return Err("model must not be empty".into());
        }
        if self.input_tokens < 0 || self.output_tokens < 0 {
            return Err("input_tokens and output_tokens must be >= 0".into());
        }
        if self.duration_ms < 0 {
            return Err("duration_ms must be >= 0".into());
        }
        if self.retries.is_some_and(|r| r < 0) {
            return Err("retries must be >= 0".into());
        }
        if let Some(cost) = &self.estimated_cost_usd {
            cost.check_contract()?;
        }
        Ok(())
    }
}
