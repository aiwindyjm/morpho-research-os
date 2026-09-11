//! Typed Tauri command adapters.
//!
//! Every command returns the [`IpcResponse`] envelope from `docs/API.md` and
//! reports failures through the unified [`CoreError`] model. This module must
//! stay a thin adapter: business behavior lives in the service/repository
//! layers, never here.

use crate::ipc::{IpcRequest, IpcResponse};
use crate::versions::{
    APP_NAME, APP_VERSION, EVENT_ENVELOPE, IPC_SCHEMA_VERSION, WORKER_PROTOCOL_VERSION,
};
use serde::{Deserialize, Serialize};

/// Static capability information served over IPC. Lets the frontend verify
/// envelope/protocol compatibility without touching any backend internals.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoreInfo {
    pub app_name: String,
    pub app_version: String,
    pub ipc_schema_version: String,
    pub event_envelope: String,
    pub worker_protocol_version: String,
    /// The SQLite schema version this core migrates to.
    pub database_schema_version: i64,
}

#[tauri::command]
pub fn core_info() -> IpcResponse<CoreInfo> {
    IpcResponse::ok(
        uuid::Uuid::now_v7().to_string(),
        CoreInfo {
            app_name: APP_NAME.to_string(),
            app_version: APP_VERSION.to_string(),
            ipc_schema_version: IPC_SCHEMA_VERSION.to_string(),
            event_envelope: EVENT_ENVELOPE.to_string(),
            worker_protocol_version: WORKER_PROTOCOL_VERSION.to_string(),
            database_schema_version: crate::db::LATEST_SCHEMA_VERSION,
        },
    )
}

/// Round-trip echo command demonstrating the request/response envelope.
/// Schema-version negotiation is a W2-05 contract concern; see
/// [`IpcRequest::matches_schema_version`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PingRequest {
    pub echo: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Pong {
    pub echo: String,
}

#[tauri::command]
pub fn ping(request: IpcRequest<PingRequest>) -> IpcResponse<Pong> {
    IpcResponse::ok(
        request.request_id.clone(),
        Pong {
            echo: request.data.echo,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_info_reports_versions() {
        let resp = core_info();
        assert!(resp.error.is_none());
        let info = resp.data.unwrap();
        assert_eq!(info.app_name, "Morpho Research OS");
        assert_eq!(info.app_version, "0.0.1");
        assert_eq!(info.ipc_schema_version, IPC_SCHEMA_VERSION);
        assert_eq!(info.event_envelope, "research.event.v1");
        assert!(info.worker_protocol_version.starts_with("0.1."));
        assert_eq!(
            info.database_schema_version,
            crate::db::LATEST_SCHEMA_VERSION
        );
    }

    #[test]
    fn ping_round_trips_the_envelope() {
        let request = IpcRequest::new(
            "req-ping-1",
            PingRequest {
                echo: "hello".into(),
            },
        );
        let resp = ping(request);
        assert_eq!(resp.request_id, "req-ping-1");
        assert!(resp.error.is_none());
        assert_eq!(resp.data.unwrap().echo, "hello");
    }
}
