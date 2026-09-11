//! Typed IPC envelopes for Tauri commands and forwarded research events.
//!
//! Contract source: `docs/API.md` — typed Tauri commands use
//! `{schema_version, request_id, data, error}` and events use
//! `research.event.v1` with run/task IDs, sequence, timestamp, type, and a
//! redacted payload. Field names here follow that draft and will be
//! reconciled when workgroup A freezes the IPC contract (W2-05).

use crate::error::CoreError;
use crate::redaction::redact_json;
use crate::versions::{EVENT_ENVELOPE, IPC_SCHEMA_VERSION};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Request envelope for typed Tauri commands.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IpcRequest<T> {
    pub schema_version: String,
    pub request_id: String,
    pub data: T,
}

impl<T> IpcRequest<T> {
    pub fn new(request_id: impl Into<String>, data: T) -> Self {
        Self {
            schema_version: IPC_SCHEMA_VERSION.to_string(),
            request_id: request_id.into(),
            data,
        }
    }

    /// Returns true when the request speaks the schema version this core
    /// serves. Note: `docs/api/ERRORS.md` currently has no generic
    /// validation error code, so callers must decide how to reject mismatched
    /// versions until workgroup A freezes one (tracked in the group C
    /// handoff as a contract proposal).
    pub fn matches_schema_version(&self) -> bool {
        self.schema_version == IPC_SCHEMA_VERSION
    }
}

/// Response envelope for typed Tauri commands. Exactly one of `data`/`error`
/// is set; serialization omits the empty one.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IpcResponse<T> {
    pub schema_version: String,
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CoreError>,
}

impl<T> IpcResponse<T> {
    pub fn ok(request_id: impl Into<String>, data: T) -> Self {
        Self {
            schema_version: IPC_SCHEMA_VERSION.to_string(),
            request_id: request_id.into(),
            data: Some(data),
            error: None,
        }
    }

    pub fn err(request_id: impl Into<String>, error: CoreError) -> Self {
        Self {
            schema_version: IPC_SCHEMA_VERSION.to_string(),
            request_id: request_id.into(),
            data: None,
            error: Some(error),
        }
    }
}

/// A research event forwarded from the worker protocol to the frontend.
///
/// Payloads are redacted at construction time; secret-looking fields never
/// reach the UI. Field names follow the `research.event.v1` draft in
/// `docs/API.md` pending the W2-02 freeze.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchEvent {
    pub schema: String,
    pub run_id: String,
    pub task_id: Option<String>,
    pub sequence: u64,
    /// Unix epoch milliseconds, UTC.
    pub timestamp_ms: u64,
    pub event_type: String,
    pub payload: Value,
}

impl ResearchEvent {
    pub fn new(
        run_id: impl Into<String>,
        task_id: Option<String>,
        sequence: u64,
        timestamp_ms: u64,
        event_type: impl Into<String>,
        mut payload: Value,
    ) -> Self {
        redact_json(&mut payload);
        Self {
            schema: EVENT_ENVELOPE.to_string(),
            run_id: run_id.into(),
            task_id,
            sequence,
            timestamp_ms,
            event_type: event_type.into(),
            payload,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;
    use serde_json::json;

    #[test]
    fn success_response_serializes_with_data_and_no_error() {
        let resp = IpcResponse::ok("req-1", json!({"answer": 42}));
        let value = serde_json::to_value(&resp).unwrap();
        assert_eq!(value["schema_version"], IPC_SCHEMA_VERSION);
        assert_eq!(value["request_id"], "req-1");
        assert_eq!(value["data"]["answer"], 42);
        assert!(value.get("error").is_none());
    }

    #[test]
    fn error_response_serializes_with_error_and_no_data() {
        let err = CoreError::new(
            ErrorCode::WorkerNotAvailable,
            "The research worker is not available.",
            "supervisor exhausted restarts",
            false,
        );
        let resp: IpcResponse<Value> = IpcResponse::err("req-2", err);
        let value = serde_json::to_value(&resp).unwrap();
        assert!(value.get("data").is_none());
        assert_eq!(value["error"]["code"], "WORKER_NOT_AVAILABLE");
        assert_eq!(value["error"]["retryable"], false);
    }

    #[test]
    fn request_schema_version_is_checkable() {
        let ok_req = IpcRequest::new("req-3", 1_u32);
        assert!(ok_req.matches_schema_version());

        let mut bad_req = IpcRequest::new("req-4", 1_u32);
        bad_req.schema_version = "9.9".into();
        assert!(!bad_req.matches_schema_version());
    }

    #[test]
    fn events_redact_sensitive_payload_fields() {
        let secret = "s".repeat(12);
        let event = ResearchEvent::new(
            "run-1",
            Some("task-1".into()),
            7,
            1_700_000_000_000,
            "task.progress",
            json!({"message": "calling provider", "api_key": secret.clone()}),
        );
        assert_eq!(event.schema, EVENT_ENVELOPE);
        assert_eq!(event.sequence, 7);
        assert_eq!(event.payload["api_key"], crate::redaction::REDACTED);
        assert_eq!(event.payload["message"], "calling provider");
        let text = serde_json::to_string(&event).unwrap();
        assert!(!text.contains(&secret));
    }
}
