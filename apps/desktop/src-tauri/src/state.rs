//! Managed application state and the worker event pump.
//!
//! Contract role (docs/PRD.md §8): [`AppState`] is the single owner of the
//! SQLite connection, the worker supervisor, the secret store, and the vault
//! root. Tauri manages one instance; typed commands and the event pump share
//! it. The pump polls the supervisor's active jobs, persists every forwarded
//! event through the events repository (monotonic per-run sequence), and
//! re-emits it to every window as `morpho://events` — payloads are already
//! redacted by [`crate::redaction`] when the [`ResearchEvent`] is built.

use crate::error::CoreError;
use crate::ipc::ResearchEvent;
use crate::repositories::events::{EventRecord, NewEvent};
use crate::repositories::services::EventService;
use crate::secrets::SecretStore;
use crate::worker::Supervisor;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Tauri event name under which forwarded research events are re-emitted to
/// all windows.
pub const EVENTS_EMIT_EVENT: &str = "morpho://events";

/// How long the pump sleeps when the last cycle forwarded nothing (idle).
const PUMP_IDLE_SLEEP: std::time::Duration = std::time::Duration::from_millis(500);
/// How long the pump sleeps after a cycle that forwarded events (hot).
const PUMP_ACTIVE_SLEEP: std::time::Duration = std::time::Duration::from_millis(120);

pub struct AppState {
    /// The migrated SQLite database (WAL, foreign keys on).
    pub conn: Mutex<Connection>,
    pub supervisor: Mutex<Supervisor>,
    pub keychain: Arc<dyn SecretStore>,
    /// Path of the JSON app-config file (see
    /// [`crate::secrets::FileConfigStore`]); commands load/save through it.
    pub config_path: PathBuf,
    /// Vault root; per-project vaults live under `<vault_root>/<project_id>`.
    pub vault_root: PathBuf,
}

impl AppState {
    pub fn new(
        conn: Connection,
        supervisor: Supervisor,
        keychain: Arc<dyn SecretStore>,
        config_path: impl Into<PathBuf>,
        vault_root: impl Into<PathBuf>,
    ) -> Self {
        Self {
            conn: Mutex::new(conn),
            supervisor: Mutex::new(supervisor),
            keychain,
            config_path: config_path.into(),
            vault_root: vault_root.into(),
        }
    }

    /// Persists one forwarded event through the events repository; sequence
    /// allocation is atomic per run (`Events::append`).
    fn persist_event(
        conn: &mut Connection,
        event: &ResearchEvent,
    ) -> Result<EventRecord, CoreError> {
        EventService::append_event(
            conn,
            NewEvent {
                run_id: event.run_id.clone(),
                task_id: event.task_id.clone(),
                event_type: event.event_type.clone(),
                payload: serde_json::to_string(&event.payload).map_err(|err| {
                    CoreError::database(format!("serialize event payload failed: {err}"))
                })?,
            },
        )
    }

    /// One pump cycle: forward new worker events for every active job,
    /// persist them, and re-emit them to all windows. Errors never propagate
    /// — the pump must not take the app down; worker failures surface through
    /// the next command that touches the supervisor. Returns the number of
    /// forwarded events.
    pub fn pump_once(app: &tauri::AppHandle) -> usize {
        use tauri::{Emitter, Manager};

        let state = app.state::<AppState>();

        let mut forwarded: Vec<ResearchEvent> = Vec::new();
        {
            let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
            for job_id in supervisor.active_job_ids() {
                if let Ok(mut events) = supervisor.poll_events(&job_id) {
                    forwarded.append(&mut events);
                }
            }
        }

        if !forwarded.is_empty() {
            if let Ok(mut conn) = state.conn.lock() {
                for event in &forwarded {
                    // A persistence failure is logged through the error
                    // return (ignored here) but must not block emission: the
                    // UI still deserves the live event.
                    let _ = Self::persist_event(&mut conn, event);
                }
            }
        }
        for event in &forwarded {
            let _ = app.emit(EVENTS_EMIT_EVENT, event);
        }
        forwarded.len()
    }

    /// Runs the pump until the process exits. The thread is intentionally
    /// daemon-like: the desktop process outlives it on shutdown.
    pub fn spawn_event_pump(app: tauri::AppHandle) {
        std::thread::spawn(move || loop {
            let forwarded = Self::pump_once(&app);
            std::thread::sleep(if forwarded == 0 {
                PUMP_IDLE_SLEEP
            } else {
                PUMP_ACTIVE_SLEEP
            });
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::ipc::ResearchEvent;
    use crate::repositories::configs::{NewResearchConfig, ResearchConfigs};
    use crate::repositories::plans::{NewPlan, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::runs::{NewRun, Runs};
    use crate::repositories::with_write_tx;
    use crate::secrets::FakeKeychain;
    use crate::worker::fake::{FakeClock, FakeSleeper, FakeWorkerScript};
    use crate::worker::{RestartPolicy, Supervisor};
    use serde_json::json;

    /// Builds a test state around an in-memory database and a fake worker.
    fn test_state() -> AppState {
        let conn = migrated_memory_db().unwrap();
        let (factory, _handle) = FakeWorkerScript::healthy().factory();
        let supervisor = Supervisor::new(
            factory,
            RestartPolicy::default(),
            Box::new(FakeClock::default()),
            Box::new(FakeSleeper::default()),
        );
        let dir = tempfile::tempdir().unwrap();
        let root = dir.keep(); // outlive the guard deliberately for the vault root
        AppState::new(
            conn,
            supervisor,
            Arc::new(FakeKeychain::new()),
            root.join("config").join("app.json"),
            root.join("vault"),
        )
    }

    /// Seeds one run so events have a foreign-key target; returns the run id.
    fn seed_run(conn: &mut Connection) -> String {
        let project_id = with_write_tx(conn, |tx| {
            Projects::insert(
                tx,
                &NewProject {
                    name: "P".into(),
                    description: String::new(),
                },
            )
            .map(|record| record.id)
        })
        .unwrap();
        let config_id = with_write_tx(conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: project_id.clone(),
                    domain: "d".into(),
                    topic: "t".into(),
                    ..Default::default()
                },
            )
            .map(|record| record.id)
        })
        .unwrap();
        let plan_id = with_write_tx(conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.clone(),
                        research_config_id: config_id,
                        title: "T".into(),
                    },
                    sections: vec![],
                    tasks: vec![],
                },
            )
            .map(|created| created.plan.id)
        })
        .unwrap();
        with_write_tx(conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id,
                    plan_id,
                    started_at: None,
                },
            )
            .map(|record| record.id)
        })
        .unwrap()
    }

    #[test]
    fn forwarded_events_persist_with_monotonic_sequences() {
        let mut conn = migrated_memory_db().unwrap();
        let run_id = seed_run(&mut conn);

        let first = ResearchEvent::new(
            run_id.clone(),
            // task_id stays empty: events.task_id is a foreign key onto
            // tasks, and this run has none.
            None,
            1,
            1_700_000_000_000,
            "task.started",
            json!({"api_key": String::from("k").repeat(12), "step": 1}),
        );
        let second = ResearchEvent::new(
            run_id.clone(),
            None,
            2,
            1_700_000_000_500,
            "run.completed",
            json!({"status": "ok"}),
        );

        let stored_first = AppState::persist_event(&mut conn, &first).unwrap();
        let stored_second = AppState::persist_event(&mut conn, &second).unwrap();
        assert_eq!(stored_first.sequence, 1, "per-run sequence starts at 1");
        assert_eq!(stored_second.sequence, 2);
        // The persisted payload is the redacted one.
        assert!(stored_first.payload.contains(crate::redaction::REDACTED));

        assert_eq!(
            crate::repositories::events::Events::latest_sequence(&conn, &run_id).unwrap(),
            2
        );
    }

    #[test]
    fn events_without_a_run_are_rejected_by_the_foreign_key() {
        let mut conn = migrated_memory_db().unwrap();
        let ghost = ResearchEvent::new("no-such-run", None, 1, 1, "task.started", json!({}));
        let err = AppState::persist_event(&mut conn, &ghost).unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::DatabaseError);
        assert!(err.developer_detail.contains("FOREIGN KEY"), "{err:?}");
    }

    #[test]
    fn state_holds_supervisor_and_keychain_for_commands() {
        let state = test_state();
        assert!(state.supervisor.lock().unwrap().active_job_ids().is_empty());
        assert!(state.config_path.to_string_lossy().contains("config"));
        assert!(state.vault_root.to_string_lossy().contains("vault"));
    }
}
