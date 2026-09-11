//! Structured error model for all Tauri commands and core services.
//!
//! Contract source: `docs/api/ERRORS.md` — every error carries a stable
//! `code`, a safe `user_message`, a `developer_detail`, a `retryable` flag, a
//! `correlation_id`, and an optional `cause`. Secret values must never appear
//! in any field; details pass through [`crate::redaction`] before being
//! stored.

use crate::redaction::redact_secrets;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Stable error codes from `docs/api/ERRORS.md`. Adding or renaming a code is
/// a contract change and requires workgroup A sign-off.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    WorkerNotAvailable,
    ProviderAuthFailed,
    ProviderTimeout,
    SearchFailed,
    SourceParseFailed,
    LlmInvalidJson,
    TaskDependencyFailed,
    VaultWriteFailed,
    DatabaseError,
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            ErrorCode::WorkerNotAvailable => "WORKER_NOT_AVAILABLE",
            ErrorCode::ProviderAuthFailed => "PROVIDER_AUTH_FAILED",
            ErrorCode::ProviderTimeout => "PROVIDER_TIMEOUT",
            ErrorCode::SearchFailed => "SEARCH_FAILED",
            ErrorCode::SourceParseFailed => "SOURCE_PARSE_FAILED",
            ErrorCode::LlmInvalidJson => "LLM_INVALID_JSON",
            ErrorCode::TaskDependencyFailed => "TASK_DEPENDENCY_FAILED",
            ErrorCode::VaultWriteFailed => "VAULT_WRITE_FAILED",
            ErrorCode::DatabaseError => "DATABASE_ERROR",
        };
        f.write_str(name)
    }
}

/// Correlation identifier tying an error to the request that produced it.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CorrelationId(String);

impl CorrelationId {
    pub fn new() -> Self {
        // UUIDv7: time-ordered, lexicographically sortable.
        Self(uuid::Uuid::now_v7().to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for CorrelationId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for CorrelationId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// The unified error returned by every Tauri command and core service.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoreError {
    pub code: ErrorCode,
    /// Safe, user-facing message. Never contains secrets or internals.
    pub user_message: String,
    /// Developer-facing detail. Redacted before storage.
    pub developer_detail: String,
    pub retryable: bool,
    pub correlation_id: CorrelationId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cause: Option<String>,
}

impl CoreError {
    pub fn new(
        code: ErrorCode,
        user_message: impl Into<String>,
        developer_detail: impl Into<String>,
        retryable: bool,
    ) -> Self {
        Self {
            code,
            user_message: user_message.into(),
            developer_detail: redact_secrets(&developer_detail.into()),
            retryable,
            correlation_id: CorrelationId::new(),
            cause: None,
        }
    }

    pub fn with_cause(mut self, cause: impl Into<String>) -> Self {
        self.cause = Some(redact_secrets(&cause.into()));
        self
    }

    pub fn database(detail: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::DatabaseError,
            "A local database operation failed.",
            detail,
            false,
        )
    }
}

impl fmt::Display for CoreError {
    /// Display is intentionally safe for any surface: code plus user message.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.user_message)
    }
}

impl std::error::Error for CoreError {}

impl From<rusqlite::Error> for CoreError {
    fn from(err: rusqlite::Error) -> Self {
        let retryable = match &err {
            rusqlite::Error::SqliteFailure(extended, _) => {
                extended.code == rusqlite::ErrorCode::DatabaseBusy
                    || extended.code == rusqlite::ErrorCode::DatabaseLocked
            }
            _ => false,
        };
        CoreError::new(
            ErrorCode::DatabaseError,
            "A local database operation failed.",
            err.to_string(),
            retryable,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_serialize_to_contract_names() {
        assert_eq!(
            serde_json::to_string(&ErrorCode::WorkerNotAvailable).unwrap(),
            "\"WORKER_NOT_AVAILABLE\""
        );
        assert_eq!(
            serde_json::to_string(&ErrorCode::ProviderAuthFailed).unwrap(),
            "\"PROVIDER_AUTH_FAILED\""
        );
        assert_eq!(
            serde_json::to_string(&ErrorCode::LlmInvalidJson).unwrap(),
            "\"LLM_INVALID_JSON\""
        );
        let parsed: ErrorCode = serde_json::from_str("\"DATABASE_ERROR\"").unwrap();
        assert_eq!(parsed, ErrorCode::DatabaseError);
    }

    #[test]
    fn error_serializes_all_contract_fields() {
        let err = CoreError::new(
            ErrorCode::DatabaseError,
            "A local database operation failed.",
            "constraint failed at insert",
            false,
        )
        .with_cause("tasks.idempotency_key UNIQUE");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "DATABASE_ERROR");
        assert_eq!(json["user_message"], "A local database operation failed.");
        assert_eq!(json["developer_detail"], "constraint failed at insert");
        assert_eq!(json["retryable"], false);
        assert!(json["correlation_id"].is_string());
        assert_eq!(json["cause"], "tasks.idempotency_key UNIQUE");
    }

    #[test]
    fn optional_cause_is_skipped_when_absent() {
        let err = CoreError::new(
            ErrorCode::SearchFailed,
            "Search failed.",
            "empty result set",
            true,
        );
        let json = serde_json::to_value(&err).unwrap();
        assert!(json.get("cause").is_none());
    }

    #[test]
    fn developer_detail_is_redacted() {
        let secret = "s".repeat(10);
        let err = CoreError::new(
            ErrorCode::ProviderAuthFailed,
            "Provider authentication failed.",
            format!("request body was api_key={secret}"),
            false,
        );
        assert!(!err.developer_detail.contains(&secret));
        assert!(err.developer_detail.contains(crate::redaction::REDACTED));
    }

    #[test]
    fn display_never_leaks_detail_or_cause() {
        let err = CoreError::new(
            ErrorCode::DatabaseError,
            "A local database operation failed.",
            "internal path C:/Users/x/db.sqlite",
            false,
        )
        .with_cause("deep internals");
        let text = err.to_string();
        assert_eq!(text, "DATABASE_ERROR: A local database operation failed.");
        assert!(!text.contains("db.sqlite"));
        assert!(!text.contains("deep internals"));
    }

    #[test]
    fn correlation_ids_are_unique_and_ordered() {
        let a = CorrelationId::new();
        let b = CorrelationId::new();
        assert_ne!(a, b);
        assert!(b.as_str() > a.as_str(), "UUIDv7 ids sort by time");
    }

    #[test]
    fn sqlite_busy_errors_map_to_retryable_database_errors() {
        let busy = rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_BUSY),
            None,
        );
        let mapped = CoreError::from(busy);
        assert_eq!(mapped.code, ErrorCode::DatabaseError);
        assert!(mapped.retryable);

        let constraint = rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CONSTRAINT),
            None,
        );
        let mapped = CoreError::from(constraint);
        assert!(!mapped.retryable);
    }
}
