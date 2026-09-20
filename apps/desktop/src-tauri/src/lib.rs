//! Morpho Research OS desktop Rust core.
//!
//! Layering follows `docs/backend/AI_BACKEND_RULES.md` and
//! `docs/architecture/MODULE_BOUNDARIES.md`: the frontend reaches this core
//! only through typed Tauri commands (`commands`), and the core modules own
//! persistence, secrets, worker lifecycle, and the Markdown vault. Nothing in
//! this crate exposes secret values across any boundary.

pub mod commands;
pub mod coverage;
pub mod db;
pub mod error;
pub mod ids;
pub mod ingestion;
pub mod ipc;
pub mod orchestrator;
pub mod projections;
pub mod recovery;
pub mod redaction;
pub mod repositories;
pub mod secrets;
pub mod state;
pub mod vault;
pub mod versions;
pub mod worker;

use state::AppState;
use std::sync::Arc;
use tauri::Manager;

/// Builds the managed application state: the migrated SQLite database under
/// the app-data directory, the config-file store, the keychain, the vault
/// root, the core-owned source-content cache, and the worker supervisor.
/// The DEFAULT transport is the real Python worker launcher (audit A4): a
/// clean config never silently succeeds against a no-op fake — a missing
/// runtime surfaces as the structured `WORKER_NOT_AVAILABLE` at run start.
/// `worker.transport = "fake"` remains the explicit hermetic demo choice
/// for dev/tests.
fn build_app_state(app: &tauri::App) -> Result<AppState, Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("morpho.sqlite3");
    let mut conn = db::open_connection(&db_path)?;
    db::migrate(&mut conn, &db::embedded_migrations())?;

    // Converge runs a previous core process left mid-flight (review E):
    // the worker died with that process, so a still-running/paused run can
    // never finish and closes as cancelled with an auditable event.
    let report = recovery::converge_interrupted_runs(&mut conn)?;
    if !report.is_empty() {
        worker::tracing_note(format!(
            "startup recovery: cancelled {} interrupted run(s), parked {} review run(s)",
            report.interrupted_runs_cancelled.len(),
            report.parked_review_runs.len()
        ));
    }

    let config_dir = app.path().app_config_dir()?;
    std::fs::create_dir_all(&config_dir)?;
    let config_path = config_dir.join("app.json");
    let config = secrets::FileConfigStore::new(&config_path).load()?;
    config.worker.validate()?;
    config.secrets.validate()?;

    let keychain = secrets::build_secret_store(&config)?;
    let supervisor = worker::Supervisor::new(
        commands::transport_factory_from_config(&config, Arc::clone(&keychain)),
        worker::RestartPolicy::default(),
        Box::new(worker::SystemClock),
        Box::new(worker::SystemSleeper),
    );

    Ok(AppState::new(
        conn,
        supervisor,
        keychain,
        config_path,
        data_dir.join("vault"),
        data_dir.join("cache"),
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let state = build_app_state(app)?;
            app.manage(state);
            // Forward worker events to windows and persist them (W2-05).
            AppState::spawn_event_pump(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::core_info,
            commands::ping,
            commands::project_list,
            commands::project_get,
            commands::project_create,
            commands::project_archive,
            commands::config_get,
            commands::config_put,
            commands::research_config_get,
            commands::research_config_put,
            commands::plan_list,
            commands::plan_approve,
            commands::plan_regenerate,
            commands::plan_update_task,
            commands::plan_reject,
            commands::run_start,
            commands::run_get,
            commands::run_cancel,
            commands::run_latest_get,
            commands::plan_latest_view,
            commands::gap_report_get,
            commands::sources_list,
            commands::knowledge_list,
            commands::claims_list,
            commands::relations_list,
            commands::evidence_list_by_claim,
            commands::graph_get,
            commands::gap_approve_proposal,
            commands::gap_dismiss_proposal,
            commands::events_list,
            commands::secrets_set_provider_key,
            commands::secrets_list_providers,
            commands::coverage_get,
            commands::vault_export_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
