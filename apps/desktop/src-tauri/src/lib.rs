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
pub mod ipc;
pub mod redaction;
pub mod repositories;
pub mod secrets;
pub mod state;
pub mod vault;
pub mod versions;
pub mod worker;

use state::AppState;
use tauri::Manager;

/// Builds the managed application state: the migrated SQLite database under
/// the app-data directory, the config-file store, the keychain, the vault
/// root, and the worker supervisor (fake transport by default so dev/tests
/// stay hermetic; `worker.transport = "http"` selects the Python process).
fn build_app_state(app: &tauri::App) -> Result<AppState, Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("morpho.sqlite3");
    let mut conn = db::open_connection(&db_path)?;
    db::migrate(&mut conn, &db::embedded_migrations())?;

    let config_dir = app.path().app_config_dir()?;
    std::fs::create_dir_all(&config_dir)?;
    let config_path = config_dir.join("app.json");
    let config = secrets::FileConfigStore::new(&config_path).load()?;
    config.worker.validate()?;

    let supervisor = worker::Supervisor::new(
        commands::transport_factory_from_config(&config.worker),
        worker::RestartPolicy::default(),
        Box::new(worker::SystemClock),
        Box::new(worker::SystemSleeper),
    );

    Ok(AppState::new(
        conn,
        supervisor,
        commands::production_keychain(),
        config_path,
        data_dir.join("vault"),
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
            commands::plan_list,
            commands::plan_approve,
            commands::run_start,
            commands::run_get,
            commands::run_cancel,
            commands::sources_list,
            commands::knowledge_list,
            commands::claims_list,
            commands::relations_list,
            commands::events_list,
            commands::secrets_set_provider_key,
            commands::secrets_list_providers,
            commands::coverage_get,
            commands::vault_export_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
