//! Prompt metadata bindings (closed record).

use serde::{Deserialize, Serialize};

use crate::schema_version::SchemaVersionV1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PromptStage {
    Planner,
    Search,
    Extraction,
    Entity,
    Relation,
    Validation,
    Writing,
    Synthesis,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModelCapability {
    Strong,
    Medium,
    Cheap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SchemaRef {
    pub schema: String,
    pub schema_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelHint {
    pub capability: ModelCapability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoldenCase {
    pub case_id: String,
    pub fixture_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PromptMetadata {
    pub schema_version: SchemaVersionV1,
    pub prompt_id: String,
    pub version: String,
    pub stage: PromptStage,
    pub purpose: String,
    pub input_schema: SchemaRef,
    pub output_schema: SchemaRef,
    pub model_hint: Option<ModelHint>,
    pub safety: Option<Vec<String>>,
    pub golden_cases: Vec<GoldenCase>,
}

use crate::ContractValid;

impl ContractValid for SchemaRef {
    fn check_contract(&self) -> Result<(), String> {
        if self.schema.len() < 3 {
            return Err("schema reference name must be at least 3 characters".into());
        }
        if self.schema_version.is_empty() {
            return Err("schema reference version must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for GoldenCase {
    fn check_contract(&self) -> Result<(), String> {
        if self.case_id.len() < 3 {
            return Err("case_id must be at least 3 characters".into());
        }
        if self.fixture_ref.len() < 3 {
            return Err("fixture_ref must be at least 3 characters".into());
        }
        Ok(())
    }
}

impl ContractValid for PromptMetadata {
    fn check_contract(&self) -> Result<(), String> {
        if self.prompt_id.len() < 5 {
            return Err("prompt_id must be at least 5 characters".into());
        }
        if self.version.len() < 5 {
            return Err("version must be a full SemVer string (e.g. '1.0.0')".into());
        }
        if self.purpose.is_empty() {
            return Err("purpose must not be empty".into());
        }
        self.input_schema.check_contract()?;
        self.output_schema.check_contract()?;
        if self
            .safety
            .as_ref()
            .is_some_and(|items| items.iter().any(|s| s.is_empty()))
        {
            return Err("safety entries must not be empty".into());
        }
        if self.golden_cases.is_empty() {
            return Err("golden_cases must have at least one entry".into());
        }
        for case in &self.golden_cases {
            case.check_contract()?;
        }
        Ok(())
    }
}
