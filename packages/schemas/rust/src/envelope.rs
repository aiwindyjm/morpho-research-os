//! Offline fixture envelope binding.

use serde::{Deserialize, Serialize};

use crate::schema_version::SchemaVersionV1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FixtureProvenanceKind {
    Synthetic,
    PublicDomain,
    LicensedExcerpt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixtureContract {
    pub schema: String,
    pub schema_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixturePrompt {
    pub prompt_id: String,
    pub prompt_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixtureProvenance {
    pub kind: FixtureProvenanceKind,
    pub notes: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixtureStability {
    pub stable_fields: Vec<String>,
    pub volatile_fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixtureEnvelope {
    pub schema_version: SchemaVersionV1,
    pub fixture_id: String,
    pub description: String,
    pub contract: FixtureContract,
    pub prompt: Option<FixturePrompt>,
    pub provenance: FixtureProvenance,
    pub input: serde_json::Value,
    pub expected: Option<serde_json::Value>,
    pub stability: FixtureStability,
}

use crate::ContractValid;

impl ContractValid for FixtureContract {
    fn check_contract(&self) -> Result<(), String> {
        if self.schema.len() < 3 {
            return Err("contract.schema must be at least 3 characters".into());
        }
        Ok(())
    }
}

impl ContractValid for FixturePrompt {
    fn check_contract(&self) -> Result<(), String> {
        if self.prompt_id.len() < 3 {
            return Err("prompt_id must be at least 3 characters".into());
        }
        if self.prompt_version.is_empty() {
            return Err("prompt_version must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for FixtureStability {
    fn check_contract(&self) -> Result<(), String> {
        if self.stable_fields.is_empty() {
            return Err("stable_fields must not be empty".into());
        }
        Ok(())
    }
}

impl ContractValid for FixtureEnvelope {
    fn check_contract(&self) -> Result<(), String> {
        if self.fixture_id.len() < 3 {
            return Err("fixture_id must be at least 3 characters".into());
        }
        if self.description.is_empty() {
            return Err("description must not be empty".into());
        }
        self.contract.check_contract()?;
        if let Some(prompt) = &self.prompt {
            prompt.check_contract()?;
        }
        self.stability.check_contract()?;
        Ok(())
    }
}
