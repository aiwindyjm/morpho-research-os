//! Real-process end-to-end smoke: the desktop Rust core supervising the REAL
//! Python research worker through a complete offline research run with the
//! full V0.1 loop (ADR-024): approve a plan → execute EXACTLY that plan
//! (core task ids verbatim) → persist sources/evidence/claims/knowledge/
//! relations from the worker's validated results → export the Vault →
//! re-open the database and read the same facts back.
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
//! * `MORPHO_PYTHON` is optional; plain `python` is the default. There is no
//!   separate interpreter probe in this test: the supervisor's health/version
//!   gate is the readiness check, and a misconfigured machine fails with the
//!   structured `WORKER_NOT_AVAILABLE` detail naming the spawn failure.
//! * The worker runs `apps/research-worker/src/morpho_worker`, which the
//!   serve entrypoint wires through the config boundary. The test sets
//!   `MORPHO_PROFILE=offline` explicitly: deterministic mock providers —
//!   zero network, zero credentials (see `serve.py::build_worker_config`).
//! * The spawned worker treats stdin EOF as a shutdown signal, so the test
//!   runner's stdin must stay open for the duration (run it interactively or
//!   pipe a long-lived producer into cargo).
//!
//! The flow mirrors the production wiring (`lib.rs::build_app_state` plus the
//! command adapters in `commands.rs`): a migrated SQLite database (a FILE so
//! the restart phase can re-open it), a REAL `Supervisor` over the HTTP
//! transport, the event pump's persist→project→acknowledge pipeline with
//! terminal result ingestion, and `VaultService` exporting into a temp vault
//! root. No domain rows are pre-seeded: everything below originates from the
//! real worker's validated output.

use morpho_desktop_lib::commands::{run_latest_get_impl, run_start_impl, RunStartRequest};
use morpho_desktop_lib::db;
use morpho_desktop_lib::repositories::events::Events;
use morpho_desktop_lib::repositories::plans::Plans;
use morpho_desktop_lib::repositories::projects::NewProject;
use morpho_desktop_lib::repositories::services::{PlanService, ProjectService, VaultService};
use morpho_desktop_lib::secrets::{FakeKeychain, WorkerConfig};
use morpho_desktop_lib::state::AppState;
use morpho_desktop_lib::worker::{RestartPolicy, Supervisor, SupervisorState};
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

/// The Python interpreter the worker config launches: `MORPHO_PYTHON` if
/// set, else plain `python` (never a Store stub name). Readiness is the
/// supervisor's health/version gate.
fn worker_python() -> String {
    std::env::var("MORPHO_PYTHON").unwrap_or_else(|_| "python".into())
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

/// The production pump semantics without the window emission: fetch,
/// persist (persist-before-acknowledge), project, drain+ingest on terminal,
/// retire.
fn pump(state: &AppState) -> usize {
    AppState::pump_cycle(&state.supervisor, &state.conn, &|_| {})
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

    prepare_worker_environment(&worker_src);
    println!("[smoke] worker src: {}", worker_src.display());

    // App config: the HTTP transport launches the real worker process. The
    // session bearer token is minted by the supervisor at spawn time; no
    // credential literal exists anywhere in this test.
    let worker = WorkerConfig {
        transport: "http".into(),
        python_executable: worker_python(),
        module_args: vec!["-m".into(), "morpho_worker.serve".into()],
    };
    worker.validate().expect("worker config validates");

    // A FILE-backed database so the restart phase can re-open the same facts.
    let home = tempfile::tempdir().expect("temp home");
    let db_path = home.path().join("smoke.sqlite3");
    let build_state = |db: rusqlite::Connection| -> AppState {
        let supervisor = Supervisor::new(
            morpho_desktop_lib::commands::transport_factory_from_config(&worker),
            RestartPolicy::default(),
            Box::new(morpho_desktop_lib::worker::SystemClock),
            Box::new(morpho_desktop_lib::worker::SystemSleeper),
        );
        AppState::new(
            db,
            supervisor,
            Arc::new(FakeKeychain::new()),
            home.path().join("config").join("app.json"),
            home.path().join("vault"),
        )
    };

    let mut conn = db::open_connection(&db_path).expect("open smoke database");
    db::migrate(&mut conn, &db::embedded_migrations()).expect("migrate smoke database");
    let state = build_state(conn);

    // --- Project + config (mirrors project.create) ------------------------
    let project = {
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
        .0
    };
    println!("[smoke] project: {}", project.id);

    // --- Plan + approval (mirrors plan.regenerate / plan.approve) ---------
    let plan = {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        let plan = PlanService::regenerate_plan(&mut conn, &project.id)
            .expect("regenerate the scripted plan draft");
        morpho_desktop_lib::repositories::with_write_tx(&mut conn, |tx| {
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
        "[smoke] plan {} approved with {plan_task_count} tasks (dependency edges included)",
        plan.id
    );

    // --- Run start through the REAL command path (ADR-024) ---------------
    let started_at = Instant::now();
    let started = run_start_impl(
        &state,
        RunStartRequest {
            plan_id: plan.id.clone(),
            approve_plan: true,
        },
    )
    .expect("run_start through the real command path");
    assert_eq!(
        state.supervisor.lock().unwrap().state(),
        SupervisorState::Ready,
        "the real worker process is supervised and healthy"
    );
    println!(
        "[smoke] worker spawned, job {} accepted for run {} after {:.1}s",
        started.job_id,
        started.run_id,
        started_at.elapsed().as_secs_f32()
    );

    // --- Approval-gate spot check (the gate itself is unit-tested) -------
    {
        let err = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: "no-such-plan".into(),
                approve_plan: true,
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"), "{err:?}");
    }

    // --- Pump + terminal poll --------------------------------------------
    let deadline = Instant::now() + RUN_DEADLINE;
    let final_job: Value;
    let mut total_persisted = 0_usize;
    loop {
        assert!(
            Instant::now() < deadline,
            "worker job did not reach a terminal state within {}s",
            RUN_DEADLINE.as_secs()
        );
        total_persisted += pump(&state);
        let envelope = job_status_envelope(&state, &started.job_id);
        let job = envelope["job"].clone();
        let retired = {
            let supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
            !supervisor.active_job_ids().contains(&started.job_id)
        };
        if is_terminal(&job) && retired {
            final_job = job;
            break;
        }
        std::thread::sleep(POLL_SLEEP);
    }
    pump(&state); // final drain (no-ops after the terminal event)

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
    assert_eq!(
        total, plan_task_count as u64,
        "exactly the approved tasks ran"
    );
    assert_eq!(completed, total, "every worker task completed: {counts}");
    println!(
        "[smoke] job COMPLETED: {completed}/{total} tasks, {total_persisted} events persisted, {:.1}s total",
        started_at.elapsed().as_secs_f32()
    );

    // --- Core-side projections (the ADR-019/024 payoff) -------------------
    let (run_record, run_tasks, events, domain, report) = {
        let conn = state.conn.lock().expect("database mutex poisoned");
        let run_record = morpho_desktop_lib::repositories::runs::Runs::get(&conn, &started.run_id)
            .expect("core run")
            .expect("run exists");
        let run_tasks =
            morpho_desktop_lib::repositories::tasks::Tasks::list_for_run(&conn, &started.run_id)
                .expect("tasks claimed for the run");
        let events =
            Events::list_after(&conn, &started.run_id, 0, 1_000).expect("persisted events");
        let domain = (
            morpho_desktop_lib::repositories::sources::Sources::list_for_project(
                &conn,
                &project.id,
            )
            .expect("sources"),
            morpho_desktop_lib::repositories::knowledge::KnowledgeNodes::list_for_project(
                &conn,
                &project.id,
            )
            .expect("knowledge nodes"),
            morpho_desktop_lib::repositories::claims::Claims::list_for_project(&conn, &project.id)
                .expect("claims"),
            morpho_desktop_lib::repositories::evidence::Evidence::list_for_project(
                &conn,
                &project.id,
            )
            .expect("evidence"),
            morpho_desktop_lib::repositories::relations::Relations::list_for_project(
                &conn,
                &project.id,
            )
            .expect("relations"),
        );
        let report =
            morpho_desktop_lib::coverage::compute(&conn, &project.id).expect("coverage report");
        (run_record, run_tasks, events, domain, report)
    };
    let (sources, nodes, claims, evidence, relations) = &domain;

    // The executed plan was the approved plan: every core task advanced to
    // COMPLETED through the worker's own events (core task ids verbatim).
    assert_eq!(
        run_record.status, "completed",
        "the core run closed through the projected rollup"
    );
    assert!(run_record.finished_at.is_some());
    assert_eq!(run_tasks.len(), plan_task_count);
    assert!(
        run_tasks.iter().all(|task| task.status == "COMPLETED"),
        "the approved core tasks themselves advanced — {:?}",
        run_tasks
            .iter()
            .map(|t| (&t.title, &t.status))
            .collect::<Vec<_>>()
    );

    // Events: monotonic per-run sequences with the full lifecycle.
    let sequences: Vec<i64> = events.iter().map(|event| event.sequence).collect();
    for (index, sequence) in sequences.iter().enumerate() {
        assert_eq!(*sequence, index as i64 + 1, "monotonic from 1");
    }
    for required in [
        "run.started",
        "task.started",
        "task.completed",
        "run.completed",
        "job.completed",
    ] {
        assert!(
            events.iter().any(|event| event.event_type == required),
            "event log must contain '{required}'"
        );
    }
    assert!(
        events.iter().all(|event| event.run_id == started.run_id),
        "persisted events carry the core run id (FK target)"
    );

    // Domain records: the traceability chain from an EMPTY database.
    assert!(
        sources.len() >= 2,
        "sources ingested from the worker's validated results: {sources:?}"
    );
    assert!(
        sources
            .iter()
            .any(|s| s.quality_score.is_some() && s.status == "evaluated"),
        "at least one evaluated source carries its quality score"
    );
    assert!(
        nodes.len() >= 2,
        "knowledge nodes ingested: {}",
        nodes.len()
    );
    assert!(claims.len() >= 2, "claims ingested: {}", claims.len());
    assert!(!evidence.is_empty(), "evidence ingested with claim links");
    assert!(
        !relations.is_empty(),
        "relations ingested (node FKs resolve verbatim)"
    );
    // Every evidence row links to a claim and a source through the join.
    {
        let conn = state.conn.lock().expect("database mutex poisoned");
        let linked: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM claim_evidence ce \
                 JOIN claims c ON c.id = ce.claim_id \
                 JOIN evidence e ON e.id = ce.evidence_id \
                 WHERE c.project_id = ?1",
                rusqlite::params![project.id],
                |row| row.get(0),
            )
            .expect("claim_evidence join");
        assert_eq!(
            linked as usize,
            evidence.len(),
            "every evidence row is linked to its claim"
        );
    }
    println!(
        "[smoke] domain: {} sources, {} nodes, {} claims, {} evidence, {} relations; coverage overall {:.3}",
        sources.len(),
        nodes.len(),
        claims.len(),
        evidence.len(),
        relations.len(),
        report.overall
    );
    assert!(
        report.overall > 0.0,
        "coverage is non-zero once domain records exist"
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
    assert!(export.sources >= 1, "source notes exported");
    assert!(export.claims >= 1, "claim notes exported");
    assert!(export.written >= 3, "map + sources + claims written");
    // Idempotent re-export: nothing new, nothing conflicting.
    let reexport = {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        VaultService::export_project(&mut conn, &project.id, &state.vault_root).unwrap()
    };
    assert_eq!(reexport.written, 0, "the second export writes nothing new");
    assert_eq!(reexport.unchanged, export.written);

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
    println!("[smoke] vault notes: {} files", files.len());

    // --- Restart readback: a fresh core over the SAME database -----------
    state
        .supervisor
        .lock()
        .expect("supervisor mutex poisoned")
        .shutdown()
        .expect("worker shutdown (simulated app restart)");
    {
        let reopened = db::open_connection(&db_path).expect("re-open the smoke database");
        let reopened_state = build_state(reopened);
        let view = run_latest_get_impl(&reopened_state, &project.id)
            .expect("run_latest_get after restart");
        assert_eq!(view["run"]["id"], json!(started.run_id));
        assert_eq!(view["run"]["status"], json!("completed"));
        assert_eq!(view["run"]["worker_job_id"], json!(started.job_id));
        assert_eq!(
            view["task_rollup"]["tasks"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|t| t["status"] == json!("COMPLETED"))
                .count(),
            plan_task_count,
            "the persisted rollup reads back every completed task"
        );
        let config_snapshot = &view["config_snapshot"];
        assert_eq!(
            config_snapshot["topic"],
            json!("quantum entanglement"),
            "the frozen config snapshot travels with the run"
        );
        let graph = {
            let conn = reopened_state.conn.lock().expect("database mutex poisoned");
            morpho_desktop_lib::projections::graph(&conn, &project.id)
                .expect("graph projection after restart")
        };
        assert_eq!(
            graph.nodes.len(),
            nodes.len(),
            "the graph reads the same nodes after restart"
        );
    }
    println!("[smoke] restart readback: run, rollup, config snapshot, graph all consistent");

    println!("[smoke] PASS");
}
