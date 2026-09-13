//! Real-process end-to-end smoke: the desktop Rust core supervising the REAL
//! Python research worker through a complete offline research run and a vault
//! export.
//!
//! `#[ignore]`d because it spawns an actual `python -m morpho_worker.serve`
//! child on loopback. That needs a local Python >= 3.11 whose site-packages
//! satisfy the worker's runtime imports (pydantic) — an environment the
//! offline, hermetic CI gate deliberately does not provide. Every other test
//! in this workspace keeps using the hermetic fake worker.
//!
//! How to run (from the repository root, on the maintainer's machine):
//!
//! ```text
//! MORPHO_PYTHON=C:\path\to\python.exe \
//!   cargo test -p morpho-desktop --test real_worker_smoke -- --ignored --nocapture
//! ```
//!
//! * `MORPHO_PYTHON` is optional; plain `python` is probed first and must
//!   import `pydantic` (on Windows never use `python3`: the Store stub).
//! * The worker runs `apps/research-worker/src/morpho_worker`, which the
//!   serve entrypoint wires to deterministic mock providers — zero network,
//!   zero credentials (see `serve.py::build_job_service`). `MORPHO_PROFILE=
//!   offline` is set anyway so the child's provider routing matches the
//!   documented offline profile.
//! * The spawned worker treats stdin EOF as a shutdown signal, so the test
//!   runner's stdin must stay open for the duration (run it interactively or
//!   pipe a long-lived producer into cargo).
//!
//! The flow mirrors the production wiring (`lib.rs::build_app_state` plus the
//! command adapters in `commands.rs`): a migrated SQLite database, a REAL
//! `Supervisor` over the HTTP transport (`WorkerProcess` spawn path with the
//! env-var contract and a runtime-minted bearer token), the event pump's
//! persist-then-project pipeline, and `VaultService` exporting into a temp
//! vault root.
//!
//! Phase-1 boundary this smoke documents (ADR-019): the worker executes its
//! own DAG with worker-minted task ids, which the core orchestrator cannot
//! resolve to core tasks — task.* events are persisted but project as no-ops,
//! core tasks stay PENDING, and the core run closes through the worker's
//! `run.completed`. Source/claim events have no repository projection yet,
//! so the vault export of a fresh real run writes the per-project map note
//! only. Those facts are asserted (not assumed) below.

use morpho_desktop_lib::commands::transport_factory_from_config;
use morpho_desktop_lib::coverage;
use morpho_desktop_lib::db::migrated_memory_db;
use morpho_desktop_lib::orchestrator::{CanonicalEvent, OrchestratorService};
use morpho_desktop_lib::repositories::configs::ResearchConfigRecord;
use morpho_desktop_lib::repositories::events::{Events, NewEvent};
use morpho_desktop_lib::repositories::knowledge::KnowledgeNodes;
use morpho_desktop_lib::repositories::plans::Plans;
use morpho_desktop_lib::repositories::projects::NewProject;
use morpho_desktop_lib::repositories::runs::{NewRun, Runs};
use morpho_desktop_lib::repositories::services::{
    EventService, PlanService, ProjectService, VaultService,
};
use morpho_desktop_lib::repositories::tasks::Tasks;
use morpho_desktop_lib::repositories::with_write_tx;
use morpho_desktop_lib::secrets::{FakeKeychain, WorkerConfig};
use morpho_desktop_lib::state::AppState;
use morpho_desktop_lib::worker::{
    JobRequest, RestartPolicy, Supervisor, SupervisorState, SystemClock, SystemSleeper,
};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// How long the whole run (worker cold start included) may take.
const RUN_DEADLINE: Duration = Duration::from_secs(240);
/// Pump pacing between poll cycles (mirrors the pump's hot/idle sleeps).
const POLL_SLEEP: Duration = Duration::from_millis(150);

/// Repository root, derived from this test's manifest dir
/// (`<repo>/apps/desktop/src-tauri`).
fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("manifest dir is <repo>/apps/desktop/src-tauri")
        .to_path_buf()
}

/// The Python interpreter used to launch the worker: `MORPHO_PYTHON` if set,
/// else plain `python`. Verified importable with the worker's runtime deps
/// before anything is spawned so a misconfigured machine fails with an
/// actionable message instead of a readiness timeout.
fn locate_python() -> String {
    let python = std::env::var("MORPHO_PYTHON").unwrap_or_else(|_| "python".into());
    let mut probe = std::process::Command::new(&python);
    probe.args([
        "-c",
        "import sys, pydantic; assert sys.version_info >= (3, 11), sys.version",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        probe.creation_flags(CREATE_NO_WINDOW);
    }
    match probe.output() {
        Ok(output) if output.status.success() => python,
        _ => panic!(
            "the real-worker smoke needs a Python >= 3.11 that can `import pydantic` \
             (tried '{python}'); set MORPHO_PYTHON to a suitable interpreter"
        ),
    }
}

/// Prepares the child environment through the only channel the spawn path
/// offers: the child inherits the parent's environment (`process.rs` never
/// clears it), so PYTHONPATH/MORPHO_PROFILE are set on this process before
/// the supervisor first spawns the worker. This test binary contains exactly
/// one test, so the process-global mutation is contained.
fn prepare_worker_environment(worker_src: &Path) {
    let existing = std::env::var_os("PYTHONPATH");
    let pythonpath = std::env::join_paths(
        std::iter::once(worker_src.as_os_str().to_os_string()).chain(existing),
    )
    .expect("building PYTHONPATH");
    std::env::set_var("PYTHONPATH", pythonpath);
    std::env::set_var("MORPHO_PROFILE", "offline");
}

/// Mirrors `commands::research_config_wire` (private to the crate): the exact
/// payload shape the worker's strict pydantic `ResearchConfig` accepts.
fn research_config_wire(record: &ResearchConfigRecord) -> Value {
    let time_range = match (record.time_range_from, record.time_range_to) {
        (None, None) => Value::Null,
        (from, to) => json!({
            "from": from.map(morpho_desktop_lib::vault::format_rfc3339_utc),
            "to": to.map(morpho_desktop_lib::vault::format_rfc3339_utc),
        }),
    };
    json!({
        "schema_version": "1.0",
        "project_id": record.project_id,
        "domain": record.domain,
        "topic": record.topic,
        "purpose": record.purpose,
        "audience": record.audience,
        "depth": record.depth,
        "dimensions": record.dimensions,
        "time_range": time_range,
        "geographic_scope": record.geographic_scope,
        "languages": record.languages,
        "source_types": record.source_types,
        "source_domains": record.source_domains,
        "update_frequency": record.update_frequency,
    })
}

/// Mirrors `AppState::pump_once` minus the window emission: persist the
/// canonical (already redacted) event, then project it through the
/// orchestrator; projection errors are ignored exactly like the pump's.
fn pump_events(state: &AppState) -> usize {
    let mut forwarded = Vec::new();
    {
        let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
        for job_id in supervisor.active_job_ids() {
            if let Ok(mut events) = supervisor.poll_events(&job_id) {
                forwarded.append(&mut events);
            }
        }
    }
    if forwarded.is_empty() {
        return 0;
    }
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    for event in &forwarded {
        let payload = serde_json::to_string(&event.payload).expect("serialize event payload");
        let persisted = EventService::append_event(
            &mut conn,
            NewEvent {
                run_id: event.run_id.clone(),
                task_id: event.task_id.clone(),
                event_type: event.event_type.clone(),
                payload,
            },
        )
        .is_ok();
        if persisted {
            let _ = OrchestratorService::apply_event(&mut conn, &CanonicalEvent::from(event));
        }
    }
    forwarded.len()
}

fn job_status_envelope(state: &AppState, job_id: &str) -> Value {
    let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
    supervisor.job_status(job_id).expect("worker job status")
}

fn is_terminal(job: &Value) -> bool {
    matches!(
        job["status"].as_str(),
        Some("COMPLETED" | "NEEDS_REVIEW" | "FAILED" | "CANCELLED")
    )
}

/// Recursively collects files under `root` (the walk the containment guard
/// below asserts against).
fn collect_files(root: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(root).expect("read vault directory") {
        let path = entry.expect("vault directory entry").path();
        if path.is_dir() {
            collect_files(&path, out);
        } else {
            out.push(path);
        }
    }
}

/// Whitelisted note filenames: lowercase slug + `.md` only.
fn filename_is_whitelisted(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".md") else {
        return false;
    };
    !stem.is_empty()
        && stem
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

#[test]
#[ignore = "spawns the real Python research worker (needs a local python >= 3.11 with pydantic); CI stays hermetic — run manually, see the module docs"]
fn real_python_worker_offline_smoke() {
    let worker_src = repo_root().join("apps").join("research-worker").join("src");
    assert!(
        worker_src.join("morpho_worker").join("serve.py").is_file(),
        "worker package not found under {}",
        worker_src.display()
    );

    let python = locate_python();
    prepare_worker_environment(&worker_src);
    println!("[smoke] python: {python}");
    println!("[smoke] worker src: {}", worker_src.display());

    // App config: the HTTP transport launches the real worker process. The
    // session bearer token is minted by the supervisor at spawn time; no
    // credential literal exists anywhere in this test.
    let worker = WorkerConfig {
        transport: "http".into(),
        python_executable: python,
        module_args: vec!["-m".into(), "morpho_worker.serve".into()],
    };
    worker.validate().expect("worker config validates");

    let supervisor = Supervisor::new(
        transport_factory_from_config(&worker),
        RestartPolicy::default(),
        Box::new(SystemClock),
        Box::new(SystemSleeper),
    );
    let home = tempfile::tempdir().expect("temp home");
    let state = AppState::new(
        migrated_memory_db().expect("migrated in-memory database"),
        supervisor,
        Arc::new(FakeKeychain::new()),
        home.path().join("config").join("app.json"),
        home.path().join("vault"),
    );

    // Project + first research configuration (mirrors project.create).
    let (project, config) = {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        ProjectService::create_project_with_config(
            &mut conn,
            NewProject {
                name: "Real Worker Smoke".into(),
                description: "real-process smoke of the offline worker pipeline".into(),
            },
            morpho_desktop_lib::repositories::configs::NewResearchConfig {
                domain: "physics".into(),
                topic: "quantum entanglement".into(),
                purpose: "learning".into(),
                audience: String::new(),
                depth: 3,
                dimensions: vec!["concepts".into(), "history".into()],
                time_range_from: None,
                time_range_to: None,
                geographic_scope: String::new(),
                languages: vec!["en".into()],
                source_types: vec!["paper".into(), "web_page".into()],
                source_domains: Vec::new(),
                update_frequency: "manual".into(),
                ..Default::default()
            },
        )
        .expect("create project with research config")
    };
    println!("[smoke] project: {}", project.id);

    // Scripted plan (plan.regenerate) + approval (plan.approve).
    let plan = {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        let plan = PlanService::regenerate_plan(&mut conn, &project.id)
            .expect("regenerate the scripted plan draft");
        with_write_tx(&mut conn, |tx| {
            Plans::update_status(tx, &plan.id, "approved")
        })
        .expect("approve the plan");
        plan
    };
    let plan_task_count = {
        let conn = state.conn.lock().expect("database mutex poisoned");
        Plans::tasks_for_plan(&conn, &plan.id)
            .expect("list plan tasks")
            .len()
    };
    assert_eq!(
        plan_task_count, 8,
        "2 dimensions x 3 tasks + validation + synthesis"
    );
    println!(
        "[smoke] plan {} approved with {plan_task_count} tasks",
        plan.id
    );

    // Run start (run.start): create the core run, then submit the
    // research_run job with the approval decision. This is the first call
    // that touches the supervisor, so the worker process spawns here.
    let run = {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        with_write_tx(&mut conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id: project.id.clone(),
                    plan_id: plan.id.clone(),
                    started_at: None,
                },
            )
        })
        .expect("insert the core run")
    };
    let started = Instant::now();
    let ack = {
        let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
        supervisor
            .submit_job(&JobRequest {
                job_id: morpho_desktop_lib::ids::new_id(),
                run_id: run.id.clone(),
                task_id: None,
                kind: "research_run".into(),
                params: research_config_wire(&config),
                approve_plan: true,
            })
            .expect("submit the research_run job to the real worker")
    };
    assert!(ack.accepted, "worker acknowledged the job");
    assert!(!ack.job_id.is_empty(), "the worker mints the job id");
    assert_eq!(
        state.supervisor.lock().unwrap().state(),
        SupervisorState::Ready,
        "the real worker process is supervised and healthy"
    );
    println!(
        "[smoke] worker spawned, job {} accepted after {:.1}s",
        ack.job_id,
        started.elapsed().as_secs_f32()
    );

    // Event pump + terminal poll (run.get). The loop ends once the worker
    // reports a terminal job status AND the terminal job.completed event has
    // been drained into the persisted log.
    let deadline = Instant::now() + RUN_DEADLINE;
    let final_job: Value;
    let mut total_forwarded = 0_usize;
    loop {
        assert!(
            Instant::now() < deadline,
            "worker job did not reach a terminal state within {}s",
            RUN_DEADLINE.as_secs()
        );
        total_forwarded += pump_events(&state);
        let envelope = job_status_envelope(&state, &ack.job_id);
        let job = envelope["job"].clone();
        let drained = {
            let conn = state.conn.lock().expect("database mutex poisoned");
            Events::list_after(&conn, &run.id, 0, 1_000)
                .expect("list persisted events")
                .iter()
                .any(|event| event.event_type == "job.completed")
        };
        if is_terminal(&job) && drained {
            // Nothing follows the terminal job.completed event.
            final_job = job;
            break;
        }
        std::thread::sleep(POLL_SLEEP);
    }
    pump_events(&state); // final drain (no-ops after job.completed)

    // --- Worker-side outcome ---------------------------------------------
    assert_eq!(
        final_job["status"],
        json!("COMPLETED"),
        "offline pipeline must complete: {final_job}"
    );
    assert!(final_job["error"].is_null(), "no job error: {final_job}");
    let counts = &final_job["counts"];
    let total = counts["tasks_total"].as_u64().expect("tasks_total");
    let completed = counts["tasks_completed"].as_u64().expect("tasks_completed");
    assert!(total > 0, "worker executed a non-empty DAG");
    assert_eq!(completed, total, "every worker task completed: {counts}");
    let worker_run_id = final_job["run_id"]
        .as_str()
        .expect("worker run id")
        .to_string();
    println!(
        "[smoke] job COMPLETED: {completed}/{total} worker tasks, run {worker_run_id}, {} events forwarded, {:.1}s",
        total_forwarded,
        started.elapsed().as_secs_f32()
    );

    // --- Core-side projections -------------------------------------------
    let (run_record, run_tasks, events, knowledge_count, report) = {
        let conn = state.conn.lock().expect("database mutex poisoned");
        let run_record = Runs::get(&conn, &run.id)
            .expect("core run")
            .expect("run exists");
        let run_tasks = Tasks::list_for_run(&conn, &run.id).expect("tasks claimed for the run");
        let events = Events::list_after(&conn, &run.id, 0, 1_000).expect("persisted events");
        let knowledge_count = KnowledgeNodes::list_for_project(&conn, &project.id)
            .expect("knowledge nodes")
            .len();
        let report = coverage::compute(&conn, &project.id).expect("coverage report");
        (run_record, run_tasks, events, knowledge_count, report)
    };
    assert_eq!(
        run_record.status, "completed",
        "the worker's run.completed closed the core run"
    );
    assert!(
        run_record.finished_at.is_some(),
        "terminal run status stamps finished_at"
    );
    assert_eq!(
        run_tasks.len(),
        plan_task_count,
        "run.started claimed the whole core plan for the run"
    );
    assert!(
        run_tasks.iter().all(|task| task.status == "PENDING"),
        "phase-1 boundary: worker-minted task ids cannot advance core tasks (ADR-019)"
    );

    // Events: persisted with monotonic per-run sequences and the full
    // lifecycle vocabulary of the offline pipeline.
    let sequences: Vec<i64> = events.iter().map(|event| event.sequence).collect();
    for (index, sequence) in sequences.iter().enumerate() {
        assert_eq!(
            *sequence,
            index as i64 + 1,
            "per-run sequences are monotonic from 1"
        );
    }
    assert!(events.len() >= 20, "a full DAG run leaves a rich event log");
    for required in [
        "plan.drafted",
        "plan.approved",
        "run.started",
        "task.started",
        "task.completed",
        "run.completed",
        "run.incremental_report",
        "job.completed",
    ] {
        assert!(
            events.iter().any(|event| event.event_type == required),
            "event log must contain '{required}'"
        );
    }
    assert!(
        events.iter().all(|event| event.run_id == run.id),
        "persisted events carry the core run id (FK target)"
    );
    println!(
        "[smoke] persisted {} events (sequences 1..={}), knowledge nodes projected: {}",
        events.len(),
        sequences.len(),
        knowledge_count
    );
    assert!(
        !report.dimensions.is_empty(),
        "coverage reports one dimension per configured dimension"
    );
    assert_eq!(report.dimensions.len(), 2);
    println!(
        "[smoke] coverage overall {:.3} across {} dimensions",
        report.overall,
        report.dimensions.len()
    );

    // --- Vault export (vault.export_project) ------------------------------
    let export = {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        VaultService::export_project(&mut conn, &project.id, &state.vault_root)
            .expect("export the project into the vault")
    };
    println!(
        "[smoke] vault export: written={} unchanged={} maps={} sources={} claims={} root={}",
        export.written,
        export.unchanged,
        export.maps,
        export.sources,
        export.claims,
        export.vault_root
    );
    assert_eq!(export.conflicts, 0, "a fresh export cannot conflict");
    assert_eq!(export.maps, 1, "one per-project map note");
    assert_eq!(
        export.written, 1,
        "phase-1 boundary: no source/claim/knowledge projection yet, so only the map note is written"
    );

    // Containment guard + filename whitelist: every exported file lives
    // under the temp vault root inside the project directory, in a known
    // folder, with a slug .md name.
    let vault_root = state
        .vault_root
        .canonicalize()
        .expect("canonical vault root");
    let mut files = Vec::new();
    collect_files(&vault_root, &mut files);
    assert!(!files.is_empty(), "the export wrote files");
    let allowed_folders = [
        "Maps",
        "Concepts",
        "People",
        "Organizations",
        "Companies",
        "Papers",
        "Books",
        "Experiments",
        "Events",
        "Technologies",
        "Applications",
        "Policies",
        "Controversies",
        "Sources",
        "Claims",
    ];
    for file in &files {
        let canonical = file.canonicalize().expect("canonical exported file");
        assert!(
            canonical.starts_with(&vault_root),
            "export escaped the temp vault root: {}",
            canonical.display()
        );
        let relative = canonical
            .strip_prefix(&vault_root)
            .expect("file under the vault root");
        let mut components = relative.components();
        let project_dir = components.next().expect("project directory").as_os_str();
        assert_eq!(
            project_dir,
            std::ffi::OsStr::new(&project.id),
            "files live under the per-project directory"
        );
        let folder = components.next().expect("typed folder").as_os_str();
        let folder = folder.to_str().expect("folder name is UTF-8");
        assert!(
            allowed_folders.contains(&folder),
            "unexpected vault folder '{folder}'"
        );
        let name = components.next().expect("note file").as_os_str();
        let name = name.to_str().expect("file name is UTF-8");
        assert!(components.next().is_none(), "notes sit directly in folders");
        assert!(
            filename_is_whitelisted(name),
            "note filename '{name}' is not a whitelisted slug.md"
        );
    }
    assert_eq!(files.len(), 1, "exactly the map note exists");
    let map_note = vault_root
        .join(&project.id)
        .join("Maps")
        .join("real-worker-smoke-map.md");
    let map_body = std::fs::read_to_string(&map_note)
        .unwrap_or_else(|_| panic!("map note at {}", map_note.display()));
    assert!(
        map_body.starts_with("---\n"),
        "note is frontmatter markdown"
    );
    assert!(
        map_body.contains("type: \"Map\""),
        "map note frontmatter declares its type: {map_body}"
    );
    assert!(map_body.contains(&project.id));
    println!("[smoke] vault note: {}", map_note.display());

    // Clean shutdown through the protocol (kills the supervised child).
    state
        .supervisor
        .lock()
        .expect("supervisor mutex poisoned")
        .shutdown()
        .expect("supervisor shutdown");
    println!("[smoke] PASS");
}
