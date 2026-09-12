//! Offline fixture envelope binding (unified, ADR-017).
//!
//! One closed envelope covers the two historical variants; a fixture uses
//! exactly one variant marker (`schema_version` + `contract` or
//! `fixture_envelope_version` + `kind`). Variant-specific required fields and
//! payload-contract resolution are enforced by the offline validators
//! (scripts/validate-fixture.py, scripts/check-contracts.ps1,
//! tests/fixtures-support loaders).

use serde::{Deserialize, Serialize};

use crate::schema_version::SchemaVersionV1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FixtureProvenanceKind {
    Synthetic,
    PublicDomain,
    LicensedExcerpt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FixtureOrigin {
    Synthetic,
    CuratedPublic,
    UserContributed,
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
pub struct FixtureExpectedOutput {
    pub name: String,
    pub schema: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixtureProvenance {
    pub kind: Option<FixtureProvenanceKind>,
    pub origin: Option<FixtureOrigin>,
    pub synthetic: Option<bool>,
    pub license: Option<String>,
    pub notes: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixtureStability {
    pub stable_fields: Option<Vec<String>>,
    pub volatile_fields: Option<Vec<String>>,
    pub deterministic: Option<bool>,
    pub ignored_fields: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixtureEnvelope {
    pub schema_version: Option<SchemaVersionV1>,
    pub fixture_envelope_version: Option<SchemaVersionV1>,
    pub fixture_id: String,
    pub description: Option<String>,
    pub contract: Option<FixtureContract>,
    pub kind: Option<String>,
    pub prompt: Option<FixturePrompt>,
    pub input: serde_json::Value,
    pub expected: Option<serde_json::Value>,
    pub expected_outputs: Option<Vec<FixtureExpectedOutput>>,
    pub provenance: FixtureProvenance,
    pub stability: Option<FixtureStability>,
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

impl ContractValid for FixtureExpectedOutput {
    fn check_contract(&self) -> Result<(), String> {
        if self.name.is_empty() {
            return Err("expected_outputs name must not be empty".into());
        }
        if self.schema.is_empty() {
            return Err("expected_outputs schema must not be empty".into());
        }
        if !self.payload.is_object() {
            return Err("expected_outputs payload must be an object".into());
        }
        Ok(())
    }
}

impl ContractValid for FixtureEnvelope {
    fn check_contract(&self) -> Result<(), String> {
        if self.fixture_id.len() < 3 {
            return Err("fixture_id must be at least 3 characters".into());
        }
        if let Some(description) = &self.description {
            if description.is_empty() {
                return Err("description must not be empty when present".into());
            }
        }
        if let Some(contract) = &self.contract {
            contract.check_contract()?;
        }
        if let Some(prompt) = &self.prompt {
            prompt.check_contract()?;
        }
        if let Some(kind) = &self.kind {
            if kind.is_empty() {
                return Err("kind must not be empty when present".into());
            }
        }
        if let Some(outputs) = &self.expected_outputs {
            for output in outputs {
                output.check_contract()?;
            }
        }
        Ok(())
    }
}
