//! Morpho Research OS desktop Rust core.
//!
//! Layering follows `docs/backend/AI_BACKEND_RULES.md` and
//! `docs/architecture/MODULE_BOUNDARIES.md`: the frontend reaches this core
//! only through typed Tauri commands (`commands`), and the core modules own
//! persistence, secrets, worker lifecycle, and the Markdown vault. Nothing in
//! this crate exposes secret values across any boundary.

pub mod commands;
pub mod db;
pub mod error;
pub mod ids;
pub mod ipc;
pub mod redaction;
pub mod repositories;
pub mod secrets;
pub mod versions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::core_info,
            commands::ping
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
