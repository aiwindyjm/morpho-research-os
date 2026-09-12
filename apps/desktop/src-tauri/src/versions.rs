//! Version constants shared across IPC, events, and the worker protocol.
//!
//! The IPC schema and event envelope follow the drafts in `docs/API.md`; the
//! worker protocol version follows the frozen contract in
//! `docs/api/WORKER_PROTOCOL.md` (v1.0). Changing any of these is a contract
//! change and must be reconciled with the frozen schemas, not done silently.

/// Version tag of the typed Tauri command request/response envelope
/// (`{schema_version, request_id, data, error}` in `docs/API.md`).
pub const IPC_SCHEMA_VERSION: &str = "1.0";

/// Envelope tag for research events forwarded to the frontend
/// (`research.event.v1` in `docs/API.md`).
pub const EVENT_ENVELOPE: &str = "research.event.v1";

/// Worker protocol version this core speaks. Equals the major.minor of the
/// frozen `worker-*.v1.json` schemas (`docs/api/WORKER_PROTOCOL.md`); the
/// Python worker reports the same range through `GET /version`
/// (`accepted_protocol_versions`, currently `["1"]`).
pub const WORKER_PROTOCOL_VERSION: &str = "1.0";

/// Minimum worker protocol version this core accepts. Within major 1 the
/// protocol is additive-only, so any frozen 1.x worker is acceptable.
pub const WORKER_PROTOCOL_MIN: &str = "1.0";

/// The app name reported through IPC.
pub const APP_NAME: &str = "Morpho Research OS";

/// Crate/app version. The single authoritative version source is the root
/// `VERSION` file (W0-03); this constant mirrors it until W0-03 defines the
/// build-time wiring.
pub const APP_VERSION: &str = "0.0.1";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_are_non_empty_and_stable() {
        assert_eq!(IPC_SCHEMA_VERSION, "1.0");
        assert_eq!(EVENT_ENVELOPE, "research.event.v1");
        assert_eq!(WORKER_PROTOCOL_VERSION, "1.0");
        assert_eq!(WORKER_PROTOCOL_MIN, "1.0");
        assert_eq!(APP_NAME, "Morpho Research OS");
        assert_eq!(APP_VERSION, "0.0.1");
    }
}
