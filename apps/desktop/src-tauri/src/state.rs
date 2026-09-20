//! Managed application state and the worker event pump.
//!
//! Contract role (docs/PRD.md §8): [`AppState`] is the single owner of the
//! SQLite connection, the worker supervisor, the secret store, the vault
//! root, and the core-owned source-content cache. Tauri manages one
//! instance; typed commands and the event pump share it.
//!
//! Lock discipline (review R3): the pump and the commands NEVER hold the
//! supervisor and database mutexes at the same time. Every pump phase —
//! fetch, persist+project, acknowledge, deliver — takes exactly one lock,
//! releases it, then takes the next. Commands follow the same rule.
//!
//! The pump polls the supervisor's active jobs and, per event, persists the
//! canonical event AND projects it through
//! [`crate::orchestrator::OrchestratorService`] inside ONE write transaction
//! (review R5): a failed projection rolls the event back with it, so the
//! acknowledged cursor never advances past a projection that did not land
//! and the next cycle replays from the worker. Repeated failures are
//! retried a bounded number of times, then the job parks as stalled — the
//! error is logged (stderr → app log), never swallowed.
//!
//! Terminal jobs (review R2) retire only after their validated result
//! records were fetched AND ingested into the project's domain tables. A
//! failed fetch or ingestion leaves the job active with `results_pending`
//! set; delivery retries on the pump's own schedule — it never depends on
//! the terminal event arriving again. Delivery retries are bounded; a job
//! that exhausts them parks as delivery-failed (tracked, observable, not
//! retired).
//!
//! Worker-death convergence (audit A1): when the supervisor detects the
//! worker process dying while the core stays alive, the interrupted jobs'
//! runs are closed durably by the same event+projection path — non-terminal
//! runs converge to `cancelled` (an auditable `run.cancelled` event reaches
//! the windows), undelivered terminal runs converge their delivery fact to
//! `failed`. This is convergence, NOT checkpoint resumption (PRD §7 durable
//! resume remains a pending decision); a failed convergence write is
//! retried on later cycles, never dropped.
//!
//! Persisted events are re-emitted to every window as `morpho://events` —
//! payloads are already redacted by [`crate::redaction`] when the
//! [`ResearchEvent`] is built.

use crate::error::CoreError;
use crate::ipc::ResearchEvent;
use crate::repositories::events::NewEvent;
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

/// Worker job event types that close a job's execution phase: after one of
/// these is persisted, the job's result records must be delivered before it
/// may retire.
fn is_terminal_job_event(event_type: &str) -> bool {
    matches!(
        event_type,
        "job.completed" | "job.needs_review" | "job.failed" | "job.cancelled"
    )
}

pub struct AppState {
    /// The migrated SQLite database (WAL, foreign keys on).
    pub conn: Mutex<Connection>,
    pub supervisor: Mutex<Supervisor>,
    pub keychain: Arc<dyn SecretStore>,
    /// Path of the JSON app-config file (see
    /// [`crate::secrets::FileConfigStore`]); commands load/save through it.
    pub config_path: PathBuf,
    /// Vault root; per-project vaults live under `<vault_root>/<project_id>`.
    /// User-owned Markdown only — the core never writes cache files here.
    pub vault_root: PathBuf,
    /// Core-owned directory for cached source-content payloads (review R8):
    /// `<cache_root>/source-contents/<file>`. Distinct from the vault so
    /// cache writes can never touch user Markdown.
    pub cache_root: PathBuf,
}

impl AppState {
    pub fn new(
        conn: Connection,
        supervisor: Supervisor,
        keychain: Arc<dyn SecretStore>,
        config_path: impl Into<PathBuf>,
        vault_root: impl Into<PathBuf>,
        cache_root: impl Into<PathBuf>,
    ) -> Self {
        let cache_root = cache_root.into();
        let contents = cache_root.join("source-contents");
        let _ = std::fs::create_dir_all(&contents);
        Self {
            conn: Mutex::new(conn),
            supervisor: Mutex::new(supervisor),
            keychain,
            config_path: config_path.into(),
            vault_root: vault_root.into(),
            cache_root,
        }
    }

    /// The directory ingestion writes source-content payloads into.
    pub fn content_cache_dir(&self) -> PathBuf {
        self.cache_root.join("source-contents")
    }

    /// Persists one forwarded event AND projects it inside the caller-owned
    /// single write transaction: the event log and the domain projection
    /// land together or not at all (review R5).
    fn persist_and_project(
        tx: &rusqlite::Transaction<'_>,
        event: &ResearchEvent,
    ) -> Result<(), CoreError> {
        crate::repositories::events::Events::append(
            tx,
            &NewEvent {
                run_id: event.run_id.clone(),
                task_id: event.task_id.clone(),
                event_type: event.event_type.clone(),
                payload: serde_json::to_string(&event.payload).map_err(|err| {
                    CoreError::database(format!("serialize event payload failed: {err}"))
                })?,
            },
        )?;
        crate::orchestrator::OrchestratorService::apply_event_tx(
            tx,
            &crate::orchestrator::CanonicalEvent::from(event),
        )?;
        Ok(())
    }

    /// One pump cycle: fetch new worker events for every active job,
    /// persist+project each one atomically, acknowledge it, re-emit the
    /// PERSISTED events to all windows, then deliver (drain + ingest) the
    /// results of terminal jobs and retire them only on success. Locks are
    /// taken strictly one at a time (review R3).
    pub fn pump_once(app: &tauri::AppHandle) -> usize {
        use tauri::{Emitter, Manager};

        let state = app.state::<AppState>();
        let content_dir = state.content_cache_dir();
        Self::pump_cycle(
            &state.supervisor,
            &state.conn,
            &content_dir,
            &|event: &ResearchEvent| {
                let _ = app.emit(EVENTS_EMIT_EVENT, event);
            },
        )
    }

    /// The pump's testable core: one fetch → persist+project → acknowledge →
    /// emit → deliver cycle over the supervised jobs. `emit` receives exactly
    /// the persisted events.
    pub fn pump_cycle(
        supervisor_lock: &Mutex<Supervisor>,
        conn_lock: &Mutex<Connection>,
        content_dir: &std::path::Path,
        emit: &dyn Fn(&ResearchEvent),
    ) -> usize {
        // Phase A — fetch (supervisor lock only): stalled jobs are skipped;
        // their cursor stays at the last acknowledged sequence. Delivery
        // cool-downs advance here so a paused (delivery-failed) job re-arms
        // automatically with backoff (round-2 review P1).
        let mut fetched: Vec<(String, String, Vec<ResearchEvent>)> = Vec::new();
        {
            let mut supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
            supervisor.tick_delivery_cooldowns();
            for job_id in supervisor.active_job_ids() {
                if supervisor.projection_stalled(&job_id) {
                    continue;
                }
                let Ok(events) = supervisor.poll_events(&job_id) else {
                    continue;
                };
                let Some(run_id) = supervisor.run_of_job(&job_id) else {
                    continue;
                };
                fetched.push((job_id, run_id, events));
            }
        }

        // Phase B — persist + project (database lock only): each event lands
        // its log row and its projection in ONE transaction. A failure stops
        // consuming that job's batch; the cursor stays at the last
        // acknowledged sequence and the next cycle replays.
        let mut acknowledgements: Vec<(String, u64)> = Vec::new();
        let mut projection_failures: Vec<(String, CoreError)> = Vec::new();
        let mut terminal_jobs: Vec<String> = Vec::new();
        if !fetched.is_empty() {
            if let Ok(mut conn) = conn_lock.lock() {
                for (job_id, _run_id, events) in &fetched {
                    let mut acknowledged: u64 = 0;
                    let mut failed: Option<CoreError> = None;
                    for event in events {
                        let outcome = crate::repositories::with_write_tx(&mut conn, |tx| {
                            Self::persist_and_project(tx, event)
                        });
                        match outcome {
                            Ok(()) => {
                                acknowledged = acknowledged.max(event.sequence);
                                if is_terminal_job_event(&event.event_type) {
                                    terminal_jobs.push(job_id.clone());
                                }
                            }
                            Err(err) => {
                                failed = Some(err);
                                break;
                            }
                        }
                    }
                    if let Some(err) = failed {
                        projection_failures.push((job_id.clone(), err));
                    }
                    acknowledgements.push((job_id.clone(), acknowledged));
                }
            }
        }

        // Phase C — acknowledge, account projection failures, and mark
        // terminal jobs for delivery (supervisor lock only).
        {
            let mut supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
            for (job_id, through) in &acknowledgements {
                if *through > 0 {
                    supervisor.acknowledge_events(job_id, *through);
                    supervisor.note_projection_success(job_id);
                }
            }
            for (job_id, err) in &projection_failures {
                tracing_note(format!(
                    "persist+project failed for job {job_id}: {err} (cursor unchanged; will \
                     replay)"
                ));
                if !supervisor.note_projection_failure(job_id) {
                    tracing_note(format!(
                        "job {job_id} parked after repeated projection failures — the event \
                         stays unacknowledged; investigate the run's event log"
                    ));
                }
            }
            for job_id in &terminal_jobs {
                supervisor.mark_results_pending(job_id);
            }
        }

        // Emission follows persistence: only acknowledged events reach
        // windows (audit F5).
        let mut emitted = 0_usize;
        for (job_id, _run_id, events) in &fetched {
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

        // Phase D — deliver results (review R2): fetch (supervisor lock),
        // ingest (database lock), retire (supervisor lock) — one lock at a
        // time, and ONLY after a successful fetch AND ingestion. Failures
        // keep the job active with results_pending; the next cycle retries
        // delivery without needing a new terminal event.
        let mut delivery_jobs: Vec<(String, String)> = Vec::new();
        {
            let supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
            for job_id in supervisor.jobs_with_pending_results() {
                if let Some(run_id) = supervisor.run_of_job(&job_id) {
                    delivery_jobs.push((job_id, run_id));
                }
            }
        }
        for (job_id, run_id) in delivery_jobs {
            let results = {
                let mut supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
                supervisor.fetch_job_results(&job_id)
            };
            let results = match results {
                Ok(results) => results,
                Err(err) => {
                    tracing_note(format!(
                        "result fetch failed for job {job_id} (attempt recorded): {err}"
                    ));
                    let exhausted = {
                        let mut supervisor =
                            supervisor_lock.lock().expect("supervisor mutex poisoned");
                        !supervisor.note_delivery_failure(&job_id)
                    };
                    if exhausted {
                        Self::persist_delivery_failure(conn_lock, &job_id, &run_id);
                        tracing_note(format!(
                            "job {job_id} paused: result delivery failed past the automatic \
                             budget; the run's delivery_status is now persistently 'failed' and \
                             delivery re-arms with backoff"
                        ));
                    }
                    continue;
                }
            };
            let ingested = {
                let mut conn = conn_lock.lock().expect("database mutex poisoned");
                Self::ingest_job_results(&mut conn, &job_id, &run_id, &results, content_dir)
            };
            match ingested {
                Ok(stats) => {
                    tracing_note(format!(
                        "ingested worker results for job {job_id}: {} source(s), {} node(s), {} \
                         claim(s), {} evidence",
                        stats.sources, stats.nodes, stats.claims, stats.evidence
                    ));
                    let mut supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
                    supervisor.retire_job(&job_id);
                    drop(supervisor);
                    // Commit notification (audit A2): execution terminal ≠
                    // domain results committed. The terminal run event was
                    // emitted possibly cycles ago (before this delivery
                    // succeeded); re-emit the PERSISTED terminal run event so
                    // open views learn the moment the results actually landed.
                    // No new event type is invented — the persisted log row is
                    // the fact; the UI stream is the notification.
                    if let Some(event) = Self::terminal_run_event(conn_lock, &run_id) {
                        emit(&event);
                        emitted += 1;
                    }
                }
                Err(err) => {
                    tracing_note(format!(
                        "result ingestion failed for job {job_id} (attempt recorded): {err}"
                    ));
                    let exhausted = {
                        let mut supervisor =
                            supervisor_lock.lock().expect("supervisor mutex poisoned");
                        !supervisor.note_delivery_failure(&job_id)
                    };
                    if exhausted {
                        Self::persist_delivery_failure(conn_lock, &job_id, &run_id);
                        tracing_note(format!(
                            "job {job_id} paused: result ingestion failed past the automatic \
                             budget; the run's delivery_status is now persistently 'failed' and \
                             delivery re-arms with backoff"
                        ));
                    }
                }
            }
        }

        // Phase E — converge runs whose worker job was interrupted (audit
        // A1): the supervisor detected the worker process dying while the
        // core stayed alive (during this cycle's polls/delivery or an
        // earlier one). Each pending interruption closes its run durably —
        // non-terminal runs cancel with an auditable event (emitted to
        // windows), terminal runs keep their execution fact and flip a
        // pending delivery to durable `failed`. A convergence that fails to
        // PERSIST stays pending and retries next cycle — never dropped
        // while the run still looks running. Locks stay one at a time.
        let pending_interruptions: Vec<(String, String)> = {
            let supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
            supervisor.pending_interruptions()
        };
        for (job_id, run_id) in pending_interruptions {
            let outcome = {
                let Ok(mut conn) = conn_lock.lock() else {
                    break;
                };
                crate::recovery::converge_worker_lost_run(
                    &mut conn,
                    &run_id,
                    "the worker process died mid-execution; the run cannot continue",
                )
            };
            match outcome {
                Ok(crate::recovery::WorkerLostOutcome::Cancelled(event)) => {
                    {
                        let mut supervisor =
                            supervisor_lock.lock().expect("supervisor mutex poisoned");
                        supervisor.confirm_interruption_converged(&job_id);
                    }
                    // Only persisted events reach windows (audit F5).
                    emit(&event);
                    emitted += 1;
                }
                Ok(_) => {
                    let mut supervisor = supervisor_lock.lock().expect("supervisor mutex poisoned");
                    supervisor.confirm_interruption_converged(&job_id);
                }
                Err(err) => {
                    tracing_note(format!(
                        "converging run {run_id} after worker death (job {job_id}) failed: {err} \
                         (stays pending; the next cycle retries)"
                    ));
                }
            }
        }

        emitted
    }

    /// Persists the durable delivery-failure fact (round-2 review P1): the
    /// run's `delivery_status` flips to `failed` — observable in every read
    /// model, and converged explicitly (never silently completed) if the
    /// process exits before a re-armed delivery succeeds. Locks the database
    /// alone.
    fn persist_delivery_failure(conn_lock: &Mutex<Connection>, job_id: &str, run_id: &str) {
        let result = {
            let mut conn = match conn_lock.lock() {
                Ok(conn) => conn,
                Err(_) => return,
            };
            crate::repositories::with_write_tx(&mut conn, |tx| {
                crate::repositories::runs::Runs::set_delivery_status(tx, run_id, "failed")
            })
        };
        if let Err(err) = result {
            tracing_note(format!(
                "persisting delivery_status=failed for run {run_id} (job {job_id}) failed: {err}"
            ));
        }
    }

    /// Resolves the run's project and ingests one drained results envelope
    /// under the run/job/project binding rules (review R6).
    fn ingest_job_results(
        conn: &mut Connection,
        job_id: &str,
        run_id: &str,
        results: &serde_json::Value,
        content_dir: &std::path::Path,
    ) -> Result<crate::ingestion::IngestStats, CoreError> {
        let project_id = crate::repositories::runs::Runs::get(conn, run_id)?
            .map(|run| run.project_id)
            .ok_or_else(|| {
                CoreError::database(format!("run '{run_id}' not found for result ingestion"))
            })?;
        crate::ingestion::ResultIngestion::ingest(
            conn,
            &crate::ingestion::IngestTarget {
                project_id: &project_id,
                job_id,
                run_id,
            },
            results,
            content_dir,
        )
    }

    /// The run's most recent PERSISTED terminal run event
    /// (`run.completed`/`run.failed`/`run.cancelled`), rebuilt as the
    /// notification envelope for post-commit re-emission (audit A2). None
    /// when the worker's stream carried no terminal run event. Locks the
    /// database alone.
    fn terminal_run_event(conn_lock: &Mutex<Connection>, run_id: &str) -> Option<ResearchEvent> {
        let conn = conn_lock.lock().expect("database mutex poisoned");
        let row = conn
            .query_row(
                "SELECT sequence, event_type, payload FROM events
                 WHERE run_id = ?1
                   AND event_type IN ('run.completed', 'run.failed', 'run.cancelled')
                 ORDER BY sequence DESC LIMIT 1",
                rusqlite::params![run_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .ok()?;
        let payload = serde_json::from_str(&row.2).unwrap_or(serde_json::json!({}));
        Some(ResearchEvent::new(
            run_id.to_string(),
            None,
            row.0.max(0) as u64,
            crate::ids::now_unix_ms() as u64,
            row.1,
            payload,
        ))
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
            root.join("cache"),
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

    /// The pump's atomic persist+project unit, callable directly.
    fn persist(
        conn: &mut Connection,
        event: &ResearchEvent,
    ) -> Result<crate::repositories::events::EventRecord, CoreError> {
        crate::repositories::with_write_tx(conn, |tx| {
            let record = crate::repositories::events::Events::append(
                tx,
                &crate::repositories::events::NewEvent {
                    run_id: event.run_id.clone(),
                    task_id: event.task_id.clone(),
                    event_type: event.event_type.clone(),
                    payload: serde_json::to_string(&event.payload).map_err(|err| {
                        CoreError::database(format!("serialize event payload failed: {err}"))
                    })?,
                },
            )?;
            crate::orchestrator::OrchestratorService::apply_event_tx(
                tx,
                &crate::orchestrator::CanonicalEvent::from(event),
            )?;
            Ok(record)
        })
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
            "source.fetched",
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

        // Persist + project is one atomic unit (review R5); non-projecting
        // event types exercise the log path on their own.
        let stored_first = persist(&mut conn, &first).unwrap();
        let stored_second = persist(&mut conn, &second).unwrap();
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
        let err = persist(&mut conn, &ghost).unwrap_err();
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
            persist(conn, event).unwrap();
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
        with_write_tx(&mut conn, |tx| {
            crate::repositories::runs::Runs::set_worker_job(tx, &run_id, "job-1").map(|_| ())
        })
        .unwrap();
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
        let cache = tempfile::tempdir().unwrap();
        let emitted_count =
            AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|event| {
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

        let cache = tempfile::tempdir().unwrap();
        let count = AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        // Nothing persisted → nothing acknowledged, nothing emitted.
        assert_eq!(count, 0);
        assert_eq!(
            supervisor_lock.lock().unwrap().acknowledged_cursor("job-1"),
            0,
            "the cursor stays put until the events commit"
        );

        // The next cycle re-fetches both events (replay from the worker);
        // they fail again the same way — never skipped, never dropped.
        let replay = AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
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

    // ------------------------------------------------------------------
    // Delivery, projection failure, and race semantics (review R2/R5)
    // ------------------------------------------------------------------

    /// Adds one PENDING task to the run's plan so `run.started` can claim
    /// it; returns the task id.
    fn add_pending_task(conn: &mut Connection, run_id: &str) -> String {
        let plan_id = plan_of_run(conn, run_id);
        let task_id = format!("task-{run_id}");
        with_write_tx(conn, |tx| {
            tx.execute(
                "INSERT INTO tasks (id, plan_id, run_id, title, task_type, status,
                                    idempotency_key, retry_count, max_retries,
                                    created_at, updated_at)
                 VALUES (?2, ?1, NULL, 'search', 'search', 'PENDING',
                         ?3, 0, 3, 1, 1)",
                rusqlite::params![plan_id, task_id, format!("key-{run_id}")],
            )
            .map_err(CoreError::from)
        })
        .unwrap();
        task_id
    }

    /// Builds a pump fixture: seeded run + one claimable task + a supervisor
    /// over `script`, with the run already bound to `job-1`. Returns
    /// `(conn, supervisor, run_id, task_id)`.
    fn pump_fixture(
        script: crate::worker::fake::FakeWorkerScript,
    ) -> (Mutex<Connection>, Mutex<Supervisor>, String, String) {
        let mut conn = migrated_memory_db().unwrap();
        let run_id = seed_run(&mut conn);
        let task_id = add_pending_task(&mut conn, &run_id);
        with_write_tx(&mut conn, |tx| {
            crate::repositories::runs::Runs::set_worker_job(tx, &run_id, "job-1").map(|_| ())
        })
        .unwrap();
        let (factory, _handle) = script.factory();
        let mut supervisor = Supervisor::new(
            factory,
            crate::worker::RestartPolicy::default(),
            Box::new(crate::worker::fake::FakeClock::default()),
            Box::new(crate::worker::fake::FakeSleeper::default()),
        );
        supervisor
            .submit_job(&crate::worker::JobRequest {
                job_id: "job-1".into(),
                run_id: run_id.clone(),
                task_id: None,
                kind: "research_run".into(),
                params: json!({}),
                approve_plan: true,
                plan: None,
            })
            .unwrap();
        (Mutex::new(conn), Mutex::new(supervisor), run_id, task_id)
    }

    fn terminal_script() -> crate::worker::fake::FakeWorkerScript {
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
        script
    }

    /// One source record for the delivery tests.
    fn source_results(job: &str) -> serde_json::Value {
        json!({
            "schema_version": "1",
            "job_id": job,
            "records": [
                {"kind": "source", "record": {
                    "source_id": "ws-1", "url": "https://a.test/x",
                    "canonical_url": "a.test/x", "url_dedup_key": "a.test/x",
                    "title": "A", "source_type": "paper", "found_via": "mock",
                    "published_at": null, "retrieved_at": "", "snippet": "",
                    "quality": null, "metadata": {}
                }},
            ],
        })
    }

    /// Review R2 regression: when the domain ingestion fails (here: an
    /// injected SQL write failure on sources), the terminal job must STAY
    /// recoverable — it is not retired — and the next pump cycle retries
    /// the delivery (no new terminal event required) without duplicating
    /// facts once it succeeds.
    #[test]
    fn a_terminal_job_stays_recoverable_when_domain_ingestion_fails() {
        let mut script = terminal_script();
        script.job_results = Some(source_results("job-1"));
        let (conn_lock, supervisor_lock, run_id, _task_id) = pump_fixture(script);
        {
            let conn = conn_lock.lock().unwrap();
            conn.execute_batch(
                "CREATE TRIGGER review_fail_source BEFORE INSERT ON sources BEGIN SELECT \
                 RAISE(ABORT, 'review injected write failure'); END;",
            )
            .unwrap();
        }
        let cache = tempfile::tempdir().unwrap();
        // First cycle: events persist, the terminal lands, the delivery
        // fails on the trigger — the job must NOT retire.
        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(
                supervisor.active_job_ids().contains(&"job-1".to_string()),
                "ingestion failed but the only retryable job was retired"
            );
            assert!(supervisor.delivery_attempts("job-1") >= 1);
            assert!(!supervisor.delivery_failed("job-1"));
        }
        let project_id = {
            let conn = conn_lock.lock().unwrap();
            let project_id: String = conn
                .query_row(
                    "SELECT project_id FROM runs WHERE id = ?1",
                    rusqlite::params![run_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(
                crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                    .unwrap()
                    .is_empty(),
                "the failed delivery wrote nothing"
            );
            project_id
        };

        // The failure heals; the next cycle redelivers on its own schedule.
        {
            let conn = conn_lock.lock().unwrap();
            conn.execute_batch("DROP TRIGGER review_fail_source;")
                .unwrap();
        }
        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(
                !supervisor.active_job_ids().contains(&"job-1".to_string()),
                "the healed delivery retired the job"
            );
        }
        {
            let conn = conn_lock.lock().unwrap();
            let sources =
                crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                    .unwrap();
            assert_eq!(sources.len(), 1, "the retried delivery landed the source");
            assert_eq!(
                crate::repositories::events::Events::latest_sequence(&conn, &run_id).unwrap(),
                2
            );
        }
        // A further cycle is a no-op (no double delivery, no new facts).
        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        {
            let conn = conn_lock.lock().unwrap();
            assert_eq!(
                crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                    .unwrap()
                    .len(),
                1
            );
        }
    }

    /// Review R2: delivery retries never depend on the terminal event
    /// arriving again — a fetch failure on the first attempt is retried by
    /// the pump's own schedule.
    #[test]
    fn delivery_retries_do_not_wait_for_a_new_terminal_event() {
        let mut script = terminal_script();
        script.job_results = Some(source_results("job-1"));
        script.fetch_results_failures = 1;
        let (conn_lock, supervisor_lock, run_id, _task_id) = pump_fixture(script);
        let cache = tempfile::tempdir().unwrap();

        // Cycle 1: terminal persisted, fetch fails once.
        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(supervisor.active_job_ids().contains(&"job-1".to_string()));
            assert_eq!(supervisor.delivery_attempts("job-1"), 1);
        }

        // Cycle 2: no new events exist — the delivery retry is what runs.
        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(
                !supervisor.active_job_ids().contains(&"job-1".to_string()),
                "the retried fetch + ingestion retired the job"
            );
        }
        let conn = conn_lock.lock().unwrap();
        let project_id: String = conn
            .query_row(
                "SELECT project_id FROM runs WHERE id = ?1",
                rusqlite::params![run_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
    }

    /// Review R5 regression: a projection failure (task.started for a task
    /// that does not exist) is NEVER acknowledged — the cursor stays at the
    /// last good sequence — and after the bounded attempts the job parks
    /// instead of hot-looping.
    #[test]
    fn failed_task_projection_never_advances_the_cursor() {
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
                payload: json!({"task_id": "unresolvable-task"}),
            },
        ];
        let (conn_lock, supervisor_lock, run_id, _task_id) = pump_fixture(script);
        let cache = tempfile::tempdir().unwrap();

        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert_eq!(
                supervisor.acknowledged_cursor("job-1"),
                1,
                "the failed projection rolled its event back with it; only run.started \
                 committed"
            );
        }
        {
            let conn = conn_lock.lock().unwrap();
            let events =
                crate::repositories::events::Events::list_after(&conn, &run_id, 0, 10).unwrap();
            assert_eq!(events.len(), 1);
            assert_eq!(events[0].event_type, "run.started");
        }

        // Bounded retries: the job parks after MAX_PROJECTION_ATTEMPTS
        // failed cycles without advancing.
        for _ in 0..crate::worker::MAX_PROJECTION_ATTEMPTS {
            AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        }
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(
                supervisor.projection_stalled("job-1"),
                "the job parked after the bounded projection attempts"
            );
            assert_eq!(supervisor.acknowledged_cursor("job-1"), 1);
            assert!(
                supervisor.active_job_ids().contains(&"job-1".to_string()),
                "a parked job stays tracked and observable, never retired"
            );
        }
    }

    /// Duplicate terminal events deliver exactly once (idempotent
    /// ingestion; the delivery loop is per-job, not per-event).
    #[test]
    fn duplicate_terminal_events_deliver_once() {
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
                payload: json!({}),
            },
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 3,
                event_type: "job.completed".into(),
                payload: json!({}),
            },
        ];
        script.job_results = Some(source_results("job-1"));
        let (conn_lock, supervisor_lock, run_id, _task_id) = pump_fixture(script);
        let cache = tempfile::tempdir().unwrap();

        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(
                supervisor.active_job_ids().is_empty(),
                "delivered + retired once"
            );
        }
        let conn = conn_lock.lock().unwrap();
        let project_id: String = conn
            .query_row(
                "SELECT project_id FROM runs WHERE id = ?1",
                rusqlite::params![run_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1,
            "duplicate terminal events must not duplicate facts"
        );
    }

    /// The cancel/completion race: a task completing AFTER the run-level
    /// cancellation closed it is an illegal projection — it never corrupts
    /// the cancelled state, never advances past the failure, and the job
    /// stays recoverable (its terminal job event has not been consumed).
    #[test]
    fn cancel_and_complete_race_converges_without_corruption() {
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
                event_type: "run.cancelled".into(),
                payload: json!({}),
            },
            // The late completion of the already-CANCELLED task.
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 3,
                event_type: "task.completed".into(),
                payload: json!({}),
            },
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 4,
                event_type: "job.cancelled".into(),
                payload: json!({}),
            },
        ];
        script.job_results = Some(json!({
            "schema_version": "1", "job_id": "job-1", "records": []
        }));
        let (conn_lock, supervisor_lock, run_id, task_id) = pump_fixture(script);
        let cache = tempfile::tempdir().unwrap();

        AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        {
            let conn = conn_lock.lock().unwrap();
            let run = crate::repositories::runs::Runs::get(&conn, &run_id)
                .unwrap()
                .unwrap();
            assert_eq!(run.status, "cancelled");
            let task = crate::repositories::tasks::Tasks::get(&conn, &task_id)
                .unwrap()
                .unwrap();
            assert_eq!(
                task.status, "CANCELLED",
                "the late completion never overwrote the cancellation"
            );
        }
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert_eq!(
                supervisor.acknowledged_cursor("job-1"),
                2,
                "the illegal post-cancellation event is not acknowledged"
            );
            // The job stays recoverable: its terminal job event (sequence 4)
            // has not been consumed, so the delivery has not run.
            assert!(supervisor.active_job_ids().contains(&"job-1".to_string()));
        }
    }

    // ------------------------------------------------------------------
    // Durable delivery state (round-2 review P1)
    // ------------------------------------------------------------------

    /// The REAL worker order — run.completed lands before job.completed, so
    /// the execution projection closes the run first; the read model must
    /// still expose the undelivered fact, and exhausting the automatic
    /// budget must leave a durable, recoverable state that heals once the
    /// failure cause does (cool-down re-arm).
    #[test]
    fn exhausted_delivery_recovers_and_never_claims_full_completion() {
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
                event_type: "run.completed".into(),
                payload: json!({}),
            },
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 3,
                event_type: "job.completed".into(),
                payload: json!({}),
            },
        ];
        script.job_results = Some(source_results("job-1"));
        let (conn_lock, supervisor_lock, run_id, _task_id) = pump_fixture(script);
        let project_id: String = {
            let conn = conn_lock.lock().unwrap();
            conn.query_row(
                "SELECT project_id FROM runs WHERE id = ?1",
                rusqlite::params![run_id],
                |row| row.get(0),
            )
            .unwrap()
        };
        {
            let conn = conn_lock.lock().unwrap();
            conn.execute_batch(
                "CREATE TRIGGER review_fail_source BEFORE INSERT ON sources BEGIN SELECT \
                 RAISE(ABORT, 'injected'); END;",
            )
            .unwrap();
        }
        let cache = tempfile::tempdir().unwrap();

        // Exhaust the automatic budget.
        for _ in 0..crate::worker::MAX_DELIVERY_ATTEMPTS {
            AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        }
        {
            let conn = conn_lock.lock().unwrap();
            let run = crate::repositories::runs::Runs::get(&conn, &run_id)
                .unwrap()
                .unwrap();
            assert_eq!(
                run.status, "completed",
                "execution truth: the worker finished"
            );
            assert_eq!(
                run.delivery_status, "failed",
                "the read model exposes the durable delivery failure — never full completion"
            );
            assert!(
                crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                    .unwrap()
                    .is_empty()
            );
            conn.execute_batch("DROP TRIGGER review_fail_source;")
                .unwrap();
        }
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(supervisor.delivery_failed("job-1"));
        }

        // The failure healed: the cool-down re-arm picks the delivery back
        // up automatically — recovery is not gated on a new terminal event
        // or a restart.
        let mut delivered = false;
        for _ in 0..(crate::worker::DELIVERY_REARM_CYCLES + 4) {
            AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
            let conn = conn_lock.lock().unwrap();
            if !crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                .unwrap()
                .is_empty()
            {
                delivered = true;
                break;
            }
        }
        assert!(
            delivered,
            "a healed delivery must recover after the cool-down re-arm"
        );
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(
                !supervisor.active_job_ids().contains(&"job-1".to_string()),
                "the recovered delivery retired the job"
            );
        }
        let conn = conn_lock.lock().unwrap();
        let run = crate::repositories::runs::Runs::get(&conn, &run_id)
            .unwrap()
            .unwrap();
        assert_eq!(run.delivery_status, "delivered");
    }

    // ------------------------------------------------------------------
    // Worker-death convergence while the core stays alive (audit A1)
    // ------------------------------------------------------------------

    /// Builds the audit-A1 fixture: one approved scripted plan, one run bound
    /// to a fake-worker job, and an AppState wiring the supervisor to the
    /// database — the "core alive, worker dies" scenario harness.
    fn death_fixture(
        script: crate::worker::fake::FakeWorkerScript,
    ) -> (
        AppState,
        crate::worker::fake::FakeHandle,
        tempfile::TempDir,
        String,
        String,
    ) {
        let mut conn = migrated_memory_db().unwrap();
        let (project, _) =
            crate::repositories::services::ProjectService::create_project_with_config(
                &mut conn,
                crate::repositories::projects::NewProject {
                    name: "A1".into(),
                    description: String::new(),
                },
                crate::repositories::configs::NewResearchConfig {
                    domain: "physics".into(),
                    topic: "entanglement".into(),
                    dimensions: vec!["concepts".into()],
                    ..Default::default()
                },
            )
            .unwrap();
        let plan =
            crate::repositories::services::PlanService::regenerate_plan(&mut conn, &project.id)
                .unwrap();
        with_write_tx(&mut conn, |tx| {
            crate::repositories::plans::Plans::update_status(tx, &plan.id, "approved")
        })
        .unwrap();
        let run = with_write_tx(&mut conn, |tx| {
            crate::repositories::runs::Runs::insert(
                tx,
                &crate::repositories::runs::NewRun {
                    id: None,
                    project_id: project.id.clone(),
                    plan_id: plan.id.clone(),
                    started_at: None,
                },
            )
        })
        .unwrap();
        with_write_tx(&mut conn, |tx| {
            crate::repositories::runs::Runs::set_worker_job(tx, &run.id, "job-a1")
        })
        .unwrap();
        let (factory, handle) = script.factory();
        let mut supervisor = Supervisor::new(
            factory,
            crate::worker::RestartPolicy::default(),
            Box::new(crate::worker::fake::FakeClock::default()),
            Box::new(crate::worker::fake::FakeSleeper::default()),
        );
        supervisor
            .submit_job(&crate::worker::JobRequest {
                job_id: "job-a1".into(),
                run_id: run.id.clone(),
                task_id: None,
                kind: "research_run".into(),
                params: json!({}),
                approve_plan: true,
                plan: None,
            })
            .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            conn,
            supervisor,
            Arc::new(crate::secrets::FakeKeychain::new()),
            dir.path().join("app.json"),
            dir.path().join("vault"),
            dir.path().join("cache"),
        );
        (state, handle, dir, project.id, run.id)
    }

    /// Script variant: `run.started` only (the run is mid-execution).
    fn running_script() -> crate::worker::fake::FakeWorkerScript {
        let mut script = crate::worker::fake::FakeWorkerScript::healthy();
        script.events = vec![crate::worker::WorkerEvent {
            job_id: "job-a1".into(),
            sequence: 1,
            event_type: "run.started".into(),
            payload: json!({}),
        }];
        script
    }

    fn pump(state: &AppState) -> usize {
        AppState::pump_cycle(
            &state.supervisor,
            &state.conn,
            &state.content_cache_dir(),
            &|_| {},
        )
    }

    /// Audit A1 (converted probe): the core stays alive while the worker
    /// process dies mid-run. The supervisor loses the job from its active
    /// set — the run must NOT stay a ghost `running` row: it converges to
    /// `cancelled` with an auditable event, the delivery fact closes as
    /// failed, and windows are notified of the persisted convergence.
    #[test]
    fn worker_death_mid_run_converges_the_running_run() {
        let (state, handle, _dir, _project, run_id) = death_fixture(running_script());
        pump(&state);
        {
            let conn = state.conn.lock().unwrap();
            assert_eq!(
                crate::repositories::runs::Runs::get(&conn, &run_id)
                    .unwrap()
                    .unwrap()
                    .status,
                "running",
                "fixture premise: the run is mid-execution"
            );
        }

        handle.kill();
        let emitted = std::cell::RefCell::new(Vec::new());
        for _ in 0..3 {
            AppState::pump_cycle(
                &state.supervisor,
                &state.conn,
                &state.content_cache_dir(),
                &|event: &ResearchEvent| emitted.borrow_mut().push(event.event_type.clone()),
            );
        }

        {
            let supervisor = state.supervisor.lock().unwrap();
            assert!(
                supervisor.active_job_ids().is_empty(),
                "confirm the lost-tracking premise"
            );
            assert!(supervisor
                .interrupted_jobs()
                .contains(&"job-a1".to_string()));
        }
        let conn = state.conn.lock().unwrap();
        let run = crate::repositories::runs::Runs::get(&conn, &run_id)
            .unwrap()
            .unwrap();
        assert_ne!(
            run.status, "running",
            "the crashed worker's run must not stay a ghost running row"
        );
        assert_eq!(run.status, "cancelled");
        assert_eq!(run.delivery_status, "failed");
        let events = crate::repositories::events::Events::list_after(&conn, &run_id, 0, 10)
            .unwrap()
            .into_iter()
            .map(|event| event.event_type)
            .collect::<Vec<_>>();
        assert!(
            events.contains(&"run.cancelled".to_string()),
            "the convergence is auditable: {events:?}"
        );
        assert!(
            emitted.borrow().contains(&"run.cancelled".to_string()),
            "windows are notified of the persisted convergence: {:?}",
            emitted.borrow()
        );
    }

    /// Death before the first event: the run was created (status `running`
    /// at insert) but nothing executed. It still converges — no ghost.
    #[test]
    fn worker_death_before_any_event_converges_the_run() {
        let (state, handle, _dir, _project, run_id) =
            death_fixture(crate::worker::fake::FakeWorkerScript::healthy());
        handle.kill();
        for _ in 0..3 {
            pump(&state);
        }
        let conn = state.conn.lock().unwrap();
        let run = crate::repositories::runs::Runs::get(&conn, &run_id)
            .unwrap()
            .unwrap();
        assert_eq!(run.status, "cancelled");
        assert!(run.finished_at.is_some());
    }

    /// Death while the terminal events were persisted but the results were
    /// not yet delivered: the EXECUTION fact (completed) survives, the
    /// undeliverable results close as durable `delivery_status='failed'` —
    /// never a fabricated delivery, never a ghost running row.
    #[test]
    fn worker_death_with_results_pending_converges_delivery_honestly() {
        let mut script = running_script();
        script.events.extend([
            crate::worker::WorkerEvent {
                job_id: "job-a1".into(),
                sequence: 2,
                event_type: "run.completed".into(),
                payload: json!({}),
            },
            crate::worker::WorkerEvent {
                job_id: "job-a1".into(),
                sequence: 3,
                event_type: "job.completed".into(),
                payload: json!({}),
            },
        ]);
        // The first fetch fails so delivery stays pending across the crash.
        script.fetch_results_failures = 1;
        let (state, handle, _dir, _project, run_id) = death_fixture(script);
        pump(&state);
        {
            let conn = state.conn.lock().unwrap();
            let run = crate::repositories::runs::Runs::get(&conn, &run_id)
                .unwrap()
                .unwrap();
            assert_eq!(run.status, "completed", "fixture premise: worker finished");
            assert_eq!(run.delivery_status, "pending");
        }

        handle.kill();
        for _ in 0..3 {
            pump(&state);
        }
        let conn = state.conn.lock().unwrap();
        let run = crate::repositories::runs::Runs::get(&conn, &run_id)
            .unwrap()
            .unwrap();
        assert_eq!(run.status, "completed", "the execution fact is untouched");
        assert_eq!(
            run.delivery_status, "failed",
            "the undeliverable results close as a durable failure"
        );
    }

    /// Two projects' jobs die with the same worker: each run converges to
    /// its own project — no cross-attribution, none left behind.
    #[test]
    fn worker_death_converges_every_projects_run_independently() {
        let (state, handle, _dir, project_a, run_a) = death_fixture(running_script());
        // A second project + run + job on the same (doomed) worker.
        let (run_b, project_b) = {
            let mut conn = state.conn.lock().unwrap();
            let (project, _) =
                crate::repositories::services::ProjectService::create_project_with_config(
                    &mut conn,
                    crate::repositories::projects::NewProject {
                        name: "A1-b".into(),
                        description: String::new(),
                    },
                    crate::repositories::configs::NewResearchConfig {
                        domain: "physics".into(),
                        topic: "entanglement".into(),
                        dimensions: vec!["concepts".into()],
                        ..Default::default()
                    },
                )
                .unwrap();
            let plan =
                crate::repositories::services::PlanService::regenerate_plan(&mut conn, &project.id)
                    .unwrap();
            with_write_tx(&mut conn, |tx| {
                crate::repositories::plans::Plans::update_status(tx, &plan.id, "approved")
                    .map(|_| ())
            })
            .unwrap();
            let run = with_write_tx(&mut conn, |tx| {
                crate::repositories::runs::Runs::insert(
                    tx,
                    &crate::repositories::runs::NewRun {
                        id: None,
                        project_id: project.id.clone(),
                        plan_id: plan.id.clone(),
                        started_at: None,
                    },
                )
            })
            .unwrap();
            with_write_tx(&mut conn, |tx| {
                crate::repositories::runs::Runs::set_worker_job(tx, &run.id, "job-a1-b").map(|_| ())
            })
            .unwrap();
            (run.id, project.id)
        };
        {
            let mut supervisor = state.supervisor.lock().unwrap();
            supervisor
                .submit_job(&crate::worker::JobRequest {
                    job_id: "job-a1-b".into(),
                    run_id: run_b.clone(),
                    task_id: None,
                    kind: "research_run".into(),
                    params: json!({}),
                    approve_plan: true,
                    plan: None,
                })
                .unwrap();
        }

        handle.kill();
        for _ in 0..3 {
            pump(&state);
        }
        let conn = state.conn.lock().unwrap();
        for (run_id, project_id) in [(&run_a, &project_a), (&run_b, &project_b)] {
            let run = crate::repositories::runs::Runs::get(&conn, run_id)
                .unwrap()
                .unwrap();
            assert_eq!(run.status, "cancelled");
            assert_eq!(run.project_id, *project_id, "attribution survives");
        }
    }

    /// A convergence whose persistence itself fails is RETRIED on the next
    /// cycle — never dropped while the run still looks running.
    #[test]
    fn convergence_persistence_failure_is_retried_not_dropped() {
        let (state, handle, _dir, _project, run_id) = death_fixture(running_script());
        pump(&state);
        handle.kill();
        {
            let conn = state.conn.lock().unwrap();
            conn.execute_batch(
                "CREATE TRIGGER a1_fail_convergence BEFORE UPDATE ON runs BEGIN SELECT \
                 RAISE(ABORT, 'injected convergence failure'); END;",
            )
            .unwrap();
        }
        pump(&state);
        {
            let conn = state.conn.lock().unwrap();
            assert_eq!(
                crate::repositories::runs::Runs::get(&conn, &run_id)
                    .unwrap()
                    .unwrap()
                    .status,
                "running",
                "the blocked write left the run unconverged — and observable"
            );
        }
        {
            let conn = state.conn.lock().unwrap();
            conn.execute_batch("DROP TRIGGER a1_fail_convergence;")
                .unwrap();
        }
        pump(&state);
        let conn = state.conn.lock().unwrap();
        assert_eq!(
            crate::repositories::runs::Runs::get(&conn, &run_id)
                .unwrap()
                .unwrap()
                .status,
            "cancelled",
            "the healed persistence converges on the retry"
        );
    }

    /// Convergence is idempotent: repeated detection emits exactly ONE
    /// run.cancelled event, and the interruption is not re-processed forever.
    #[test]
    fn worker_death_convergence_is_idempotent() {
        let (state, handle, _dir, _project, run_id) = death_fixture(running_script());
        pump(&state);
        handle.kill();
        for _ in 0..10 {
            pump(&state);
        }
        let conn = state.conn.lock().unwrap();
        let cancellations = crate::repositories::events::Events::list_after(&conn, &run_id, 0, 50)
            .unwrap()
            .into_iter()
            .filter(|event| event.event_type == "run.cancelled")
            .count();
        assert_eq!(cancellations, 1, "exactly one convergence event");
        let supervisor = state.supervisor.lock().unwrap();
        assert!(
            supervisor.pending_interruptions().is_empty(),
            "the converged interruption is not re-processed forever"
        );
    }

    /// Even when the worker cannot restart at all (budget exhausted), the
    /// interrupted runs still converge — recovery does not depend on a
    /// healthy worker.
    #[test]
    fn worker_death_with_restart_budget_exhausted_still_converges() {
        let mut script = running_script();
        // The initial start succeeds; every restart after the crash fails.
        script.max_successful_spawns = 1;
        let (state, handle, _dir, _project, run_id) = death_fixture(script);
        pump(&state);
        handle.kill();
        for _ in 0..6 {
            pump(&state);
        }
        let conn = state.conn.lock().unwrap();
        assert_eq!(
            crate::repositories::runs::Runs::get(&conn, &run_id)
                .unwrap()
                .unwrap()
                .status,
            "cancelled"
        );
    }

    /// Audit A2 (converted probe): a delivery retry that SUCCEEDS commits
    /// the domain data — observers must be notified AFTER the commit. The
    /// notification re-emits the PERSISTED terminal run event (existing
    /// vocabulary, existing log row — no invented event types); before this
    /// fix the successful retry cycle emitted nothing and open views stayed
    /// stale until an unrelated refresh.
    #[test]
    fn delivery_retry_success_notifies_after_the_domain_commit() {
        let mut script = running_script();
        script.events.extend([
            crate::worker::WorkerEvent {
                job_id: "job-a1".into(),
                sequence: 2,
                event_type: "run.completed".into(),
                payload: json!({}),
            },
            crate::worker::WorkerEvent {
                job_id: "job-a1".into(),
                sequence: 3,
                event_type: "job.completed".into(),
                payload: json!({}),
            },
        ]);
        script.fetch_results_failures = 1;
        script.job_results = Some(json!({
            "schema_version": "1", "job_id": "job-a1", "records": [
                {"kind": "source", "record": {
                    "source_id": "ws-1", "url": "https://a2.test/a",
                    "canonical_url": "a2.test/a", "source_type": "paper"}},
            ],
        }));
        let (state, _handle, _dir, project_id, run_id) = death_fixture(script);

        // Cycle 1: terminal events persist; the results fetch fails once —
        // nothing delivered, nothing notified as delivered.
        pump(&state);
        {
            let conn = state.conn.lock().unwrap();
            assert!(
                crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                    .unwrap()
                    .is_empty()
            );
            assert_eq!(
                crate::repositories::runs::Runs::get(&conn, &run_id)
                    .unwrap()
                    .unwrap()
                    .delivery_status,
                "pending",
                "before the commit the pending state is never presented as delivered"
            );
        }

        // Cycle 2: no new worker events exist — the retry delivers AND the
        // cycle notifies (emission count > 0) with the persisted terminal
        // run event.
        let emitted = std::cell::RefCell::new(Vec::new());
        let notifications = AppState::pump_cycle(
            &state.supervisor,
            &state.conn,
            &state.content_cache_dir(),
            &|event: &ResearchEvent| emitted.borrow_mut().push(event.event_type.clone()),
        );
        {
            let conn = state.conn.lock().unwrap();
            assert_eq!(
                crate::repositories::sources::Sources::list_for_project(&conn, &project_id)
                    .unwrap()
                    .len(),
                1,
                "the retried delivery landed the source"
            );
            assert_eq!(
                crate::repositories::runs::Runs::get(&conn, &run_id)
                    .unwrap()
                    .unwrap()
                    .delivery_status,
                "delivered"
            );
        }
        assert!(
            notifications > 0,
            "a successful retry that commits domain data must notify observers"
        );
        assert!(
            emitted.borrow().contains(&"run.completed".to_string()),
            "the notification is the persisted terminal run event: {:?}",
            emitted.borrow()
        );
    }

    /// A permanently invalid results envelope (validation failure) parks the
    /// delivery durably: the run keeps its durable `failed` delivery state
    /// across re-arm cycles instead of pretending completion.
    #[test]
    fn an_invalid_results_envelope_parks_delivery_durably() {
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
                event_type: "run.completed".into(),
                payload: json!({}),
            },
            crate::worker::WorkerEvent {
                job_id: "job-1".into(),
                sequence: 3,
                event_type: "job.completed".into(),
                payload: json!({}),
            },
        ];
        script.job_results = Some(json!({
            "schema_version": "999", "job_id": "job-1", "records": []
        }));
        let (conn_lock, supervisor_lock, run_id, _project_id) = pump_fixture(script);
        let cache = tempfile::tempdir().unwrap();

        for _ in 0..(crate::worker::MAX_DELIVERY_ATTEMPTS + 1) {
            AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        }
        {
            let supervisor = supervisor_lock.lock().unwrap();
            assert!(supervisor.delivery_failed("job-1"));
        }
        let conn = conn_lock.lock().unwrap();
        let run = crate::repositories::runs::Runs::get(&conn, &run_id)
            .unwrap()
            .unwrap();
        assert_eq!(run.status, "completed");
        assert_eq!(
            run.delivery_status, "failed",
            "the durable state records the validation failure"
        );
        // Even after a re-arm window the envelope is still invalid: the
        // state stays failed (bounded retry cadence, honest status).
        drop(conn);
        for _ in
            0..(crate::worker::DELIVERY_REARM_CYCLES + crate::worker::MAX_DELIVERY_ATTEMPTS + 2)
        {
            AppState::pump_cycle(&supervisor_lock, &conn_lock, cache.path(), &|_| {});
        }
        let conn = conn_lock.lock().unwrap();
        let run = crate::repositories::runs::Runs::get(&conn, &run_id)
            .unwrap()
            .unwrap();
        assert_eq!(run.delivery_status, "failed");
    }
}
