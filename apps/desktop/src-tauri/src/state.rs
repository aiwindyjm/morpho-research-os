//! Managed application state and the worker event pump.
//!
//! Contract role (docs/PRD.md §8): [`AppState`] is the single owner of the
//! SQLite connection, the worker supervisor, the secret store, and the vault
//! root. Tauri manages one instance; typed commands and the event pump share
//! it. The pump polls the supervisor's active jobs, persists every forwarded
//! event through the events repository (monotonic per-run sequence), projects
//! it through [`crate::orchestrator::OrchestratorService`] (task status,
//! checkpoints, dependency gating, run rollup), and re-emits it to every
//! window as `morpho://events` — payloads are already redacted by
//! [`crate::redaction`] when the [`ResearchEvent`] is built.

use crate::error::CoreError;
use crate::ipc::ResearchEvent;
use crate::repositories::events::{EventRecord, NewEvent};
use crate::repositories::services::EventService;
use crate::secrets::SecretStore;
use crate::worker::tracing_note;
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

    /// One pump cycle: fetch new worker events for every active job,
    /// persist each one, project it, acknowledge it, and re-emit the
    /// PERSISTED events to all windows. Consumption is acknowledged only
    /// after the events repository commits (audit F5): a transient database
    /// failure leaves the cursor untouched, so the next cycle re-fetches
    /// from the worker's replay instead of silently skipping events, and
    /// unpersisted events are never emitted (SQLite is authoritative,
    /// PRD §7). Projection failures are ignored per ADR-019 (the log, not
    /// the projection, is the source of truth).
    ///
    /// When a terminal job event (`job.completed` / `job.needs_review` /
    /// `job.failed` / `job.cancelled`) has been persisted, the job's
    /// validated result records are drained once (`GET /jobs/{id}/results`,
    /// ADR-024), ingested into the project's domain tables, and the job is
    /// retired from the active set. Cancellation keeps a job pollable until
    /// exactly this point.
    pub fn pump_once(app: &tauri::AppHandle) -> usize {
        use tauri::{Emitter, Manager};

        let state = app.state::<AppState>();
        Self::pump_cycle(&state.supervisor, &state.conn, &|event: &ResearchEvent| {
            let _ = app.emit(EVENTS_EMIT_EVENT, event);
        })
    }

    /// The pump's testable core: one persist→project→acknowledge cycle over
    /// the supervised jobs, plus the terminal drain/ingest/retire step.
    /// `emit` receives exactly the persisted events.
    pub fn pump_cycle(
        supervisor_lock: &Mutex<Supervisor>,
        conn_lock: &Mutex<Connection>,
        emit: &dyn Fn(&ResearchEvent),
    ) -> usize {
        let mut fetched: Vec<(String, Vec<ResearchEvent>)> = Vec::new();
        {
            let mut supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
            for job_id in supervisor.active_job_ids() {
                if let Ok(events) = supervisor.poll_events(&job_id) {
                    fetched.push((job_id, events));
                }
            }
        }
        if fetched.is_empty() {
            return 0;
        }

        let mut emitted = 0_usize;
        let mut terminal_jobs: Vec<String> = Vec::new();
        if let Ok(mut conn) = conn_lock.lock() {
            for (job_id, events) in &fetched {
                let mut acknowledged: u64 = 0;
                for event in events {
                    // Persist the canonical event first; only a committed
                    // event is acknowledged, projected, and emitted.
                    match Self::persist_event(&mut conn, event) {
                        Ok(_) => {
                            let _ = crate::orchestrator::OrchestratorService::apply_event(
                                &mut conn,
                                &crate::orchestrator::CanonicalEvent::from(event),
                            );
                            acknowledged = acknowledged.max(event.sequence);
                            if matches!(
                                event.event_type.as_str(),
                                "job.completed"
                                    | "job.needs_review"
                                    | "job.failed"
                                    | "job.cancelled"
                            ) {
                                terminal_jobs.push(job_id.clone());
                            }
                        }
                        Err(err) => {
                            // Stop consuming this batch at the failure: the
                            // cursor stays at the last acknowledged sequence
                            // and the next cycle replays from the worker.
                            tracing_note(format!(
                                "event persistence failed for job {job_id} at sequence {}: \
                                 {err} (will replay)",
                                event.sequence
                            ));
                            break;
                        }
                    }
                }
                if acknowledged > 0 {
                    supervisor_lock
                        .lock()
                        .expect("supervisor mutex poisoned")
                        .acknowledge_events(job_id, acknowledged);
                }
            }
        }

        // Drain + ingest results for terminal jobs, then retire them.
        let mut drained: Vec<(String, serde_json::Value)> = Vec::new();
        for job_id in &terminal_jobs {
            let mut supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
            let Some(run_id) = supervisor.run_of_job(job_id) else {
                continue;
            };
            let results = supervisor.fetch_job_results(job_id);
            supervisor.retire_job(job_id);
            match results {
                Ok(results) => drained.push((run_id, results)),
                Err(err) => tracing_note(format!(
                    "result drain failed for job {job_id}: {err} (events remain persisted)"
                )),
            }
        }
        for (run_id, results) in drained {
            if let Ok(mut conn) = conn_lock.lock() {
                let project_id = crate::repositories::runs::Runs::get(&conn, &run_id)
                    .ok()
                    .flatten()
                    .map(|run| run.project_id);
                if let Some(project_id) = project_id {
                    if let Err(err) =
                        crate::ingestion::ResultIngestion::ingest(&mut conn, &project_id, &results)
                    {
                        tracing_note(format!("result ingestion failed for run {run_id}: {err}"));
                    }
                }
            }
        }

        // Emission follows persistence: only acknowledged events reach
        // windows (audit F5).
        for (job_id, events) in &fetched {
            let acknowledged = {
                let supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
                supervisor.acknowledged_cursor(job_id)
            };
            for event in events {
                if event.sequence <= acknowledged {
                    emit(event);
                    emitted += 1;
                }
            }
        }
        emitted
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
                        rationale: String::new(),
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

    /// Mirrors the pump's persist-then-project pipeline (pump_once) for one
    /// task lifecycle: the canonical events land in the log, and the
    /// orchestrator projects them onto persisted task/run state.
    #[test]
    fn pump_path_persists_events_then_projects_task_state() {
        let mut conn = migrated_memory_db().unwrap();
        let run_id = seed_run(&mut conn);
        // One PENDING task in the plan this run executes (run.started claims
        // it through `Tasks::claim_for_run`).
        let plan_id = plan_of_run(&conn, &run_id);
        let task_id = "task-pump-1".to_string();
        with_write_tx(&mut conn, |tx| {
            tx.execute(
                "INSERT INTO tasks (id, plan_id, run_id, title, task_type, status,
                                    idempotency_key, retry_count, max_retries,
                                    created_at, updated_at)
                 VALUES (?2, ?1, NULL, 'search', 'search', 'PENDING',
                         'pump-1', 0, 3, 1, 1)",
                rusqlite::params![plan_id, task_id],
            )
            .map_err(CoreError::from)
        })
        .unwrap();

        let pipeline = |conn: &mut Connection, event: &ResearchEvent| {
            AppState::persist_event(conn, event).unwrap();
            crate::orchestrator::OrchestratorService::apply_event(
                conn,
                &crate::orchestrator::CanonicalEvent::from(event),
            )
            .unwrap();
        };

        pipeline(
            &mut conn,
            &ResearchEvent::new(&run_id, None, 1, 1, "run.started", json!({})),
        );
        pipeline(
            &mut conn,
            &ResearchEvent::new(
                &run_id,
                Some(task_id.clone()),
                2,
                2,
                "task.started",
                json!({}),
            ),
        );
        pipeline(
            &mut conn,
            &ResearchEvent::new(
                &run_id,
                Some(task_id.clone()),
                3,
                3,
                "task.completed",
                json!({"result_ref": "vault://out/a.md"}),
            ),
        );

        let task = crate::repositories::tasks::Tasks::get(&conn, &task_id)
            .unwrap()
            .unwrap();
        assert_eq!(task.status, "COMPLETED");
        assert_eq!(task.result_ref.as_deref(), Some("vault://out/a.md"));
        assert_eq!(task.run_id.as_deref(), Some(run_id.as_str()));
        let run = crate::repositories::runs::Runs::get(&conn, &run_id)
            .unwrap()
            .unwrap();
        assert_eq!(run.status, "completed");
        assert_eq!(
            crate::repositories::events::Events::latest_sequence(&conn, &run_id).unwrap(),
            3
        );
    }

    fn plan_of_run(conn: &Connection, run_id: &str) -> String {
        conn.query_row(
            "SELECT plan_id FROM runs WHERE id = ?1",
            rusqlite::params![run_id],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn state_holds_supervisor_and_keychain_for_commands() {
        let state = test_state();
        assert!(state.supervisor.lock().unwrap().active_job_ids().is_empty());
        assert!(state.config_path.to_string_lossy().contains("config"));
        assert!(state.vault_root.to_string_lossy().contains("vault"));
    }

    /// A full pump cycle over the fake worker: task events persist and
    /// project, the terminal job event triggers the results drain (ADR-024),
    /// domain records land in SQLite, and the job retires.
    #[test]
    fn pump_cycle_persists_projects_drains_and_retires_on_terminal() {
        use crate::worker::JobRequest;
        use serde_json::json;

        let mut conn = migrated_memory_db().unwrap();
        let run_id = seed_run(&mut conn);
        let project_id: String = conn
            .query_row(
                "SELECT project_id FROM runs WHERE id = ?1",
                rusqlite::params![run_id],
                |row| row.get(0),
            )
            .unwrap();
        let conn_lock = Mutex::new(conn);

        // Script: run lifecycle + terminal job event + one source record in
        // the results payload.
        let mut script = crate::worker::fake::FakeWorkerScript::healthy();
        script.events = vec![
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 1,
                event_type: "run.started".into(),
                payload: json!({}),
            },
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 2,
                event_type: "job.completed".into(),
                payload: json!({"status": "COMPLETED"}),
            },
        ];
        script.job_results = Some(json!({
            "schema_version": "1",
            "job_id": "job-1",
            "records": [
                {"kind": "source", "record": {
                    "source_id": "ws-1", "url": "https://a.test/x",
                    "canonical_url": "a.test/x", "url_dedup_key": "a.test/x",
                    "title": "A", "source_type": "paper", "found_via": "mock",
                    "published_at": null, "retrieved_at": "", "snippet": "",
                    "quality": null, "metadata": {}
                }},
            ],
        }));
        let (factory, _handle) = script.factory();
        let supervisor = Supervisor::new(
            factory,
            crate::worker::RestartPolicy::default(),
            Box::new(crate::worker::fake::FakeClock::default()),
            Box::new(crate::worker::fake::FakeSleeper::default()),
        );
        let supervisor_lock = Mutex::new(supervisor);

        {
            let mut supervisor = supervisor_lock.lock().unwrap();
            supervisor
                .submit_job(&JobRequest {
                    job_id: "job-1".into(),
                    run_id: run_id.clone(),
                    task_id: None,
                    kind: "research_run".into(),
                    params: json!({}),
                    approve_plan: true,
                    plan: None,
                })
                .unwrap();
        }

        let emitted = std::cell::RefCell::new(Vec::<String>::new());
        let emitted_count = AppState::pump_cycle(&supervisor_lock, &conn_lock, &|event| {
            emitted.borrow_mut().push(event.event_type.clone());
        });

        // Both events persisted (and emitted); the job retired after the
        // terminal drain.
        assert_eq!(emitted_count, 2);
        assert_eq!(emitted.into_inner(), vec!["run.started", "job.completed"]);
        assert!(supervisor_lock.lock().unwrap().active_job_ids().is_empty());
        {
            let conn = conn_lock.lock().unwrap();
            assert_eq!(
                crate::repositories::events::Events::latest_sequence(&conn, &run_id).unwrap(),
                2
            );
            // run.started claimed the plan; the run record advanced.
            let run = crate::repositories::runs::Runs::get(&conn, &run_id)
                .unwrap()
                .unwrap();
            assert_eq!(run.status, "running");
            // The drained source record landed in the project.
            let sources =
                crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                    .unwrap();
            assert_eq!(sources.len(), 1);
            assert_eq!(sources[0].canonical_url, "a.test/x");
        }
    }

    /// Persistence failure semantics (audit F5): when the events repository
    /// rejects an event (here: a task_id that violates the foreign key),
    /// the cursor stays at the last acknowledged sequence and the next
    /// cycle replays the failed event instead of skipping it.
    #[test]
    fn pump_cycle_replays_events_that_failed_to_persist() {
        use crate::worker::JobRequest;
        use serde_json::json;

        let mut conn = migrated_memory_db().unwrap();
        let run_id = seed_run(&mut conn);
        let conn_lock = Mutex::new(conn);

        let mut script = crate::worker::fake::FakeWorkerScript::healthy();
        script.events = vec![
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 1,
                event_type: "run.started".into(),
                payload: json!({}),
            },
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 2,
                event_type: "task.started".into(),
                payload: json!({"step": 1}),
            },
        ];
        let (factory, _handle) = script.factory();
        let supervisor_lock = Mutex::new(Supervisor::new(
            factory,
            crate::worker::RestartPolicy::default(),
            Box::new(crate::worker::fake::FakeClock::default()),
            Box::new(crate::worker::fake::FakeSleeper::default()),
        ));
        {
            let mut supervisor = supervisor_lock.lock().unwrap();
            supervisor
                .submit_job(&JobRequest {
                    job_id: "job-1".into(),
                    run_id: run_id.clone(),
                    // A task id with no core tasks row: every event of this
                    // job fails the events.task_id foreign key, simulating a
                    // persistence failure for the whole batch.
                    task_id: Some("ghost-task".into()),
                    kind: "research_run".into(),
                    params: json!({}),
                    approve_plan: true,
                    plan: None,
                })
                .unwrap();
        }

        let count = AppState::pump_cycle(&supervisor_lock, &conn_lock, &|_| {});
        // Nothing persisted → nothing acknowledged, nothing emitted.
        assert_eq!(count, 0);
        assert_eq!(
            supervisor_lock.lock().unwrap().acknowledged_cursor("job-1"),
            0,
            "the cursor stays put until the events commit"
        );

        // The next cycle re-fetches both events (replay from the worker);
        // they fail again the same way — never skipped, never dropped.
        let replay = AppState::pump_cycle(&supervisor_lock, &conn_lock, &|_| {});
        assert_eq!(replay, 0, "the failed events are still not emitted");
        {
            let conn = conn_lock.lock().unwrap();
            assert_eq!(
                crate::repositories::events::Events::latest_sequence(&conn, &run_id).unwrap(),
                0,
                "no partial rows appeared"
            );
        }
    }
}
