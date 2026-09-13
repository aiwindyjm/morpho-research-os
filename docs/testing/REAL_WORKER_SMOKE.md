# Real Worker Smoke (`real_worker_smoke.rs`)

Status: **PASSING** — first real-process end-to-end verification of the
desktop Rust core supervising the actual Python research worker.

- Test: `apps/desktop/src-tauri/tests/real_worker_smoke.rs` (marked
  `#[ignore]`; it never runs in the default gate set).
- Date: 2026-09-13.
- Machine context: Windows 11 (win32 10.0.26200 x64), Git Bash, Python 3.11
  (CPython 3.11.15) with pydantic 2.13.4 importable from plain `python`.
- Worker: `apps/research-worker/src/morpho_worker` run from source (no
  installation); the serve entrypoint is hardwired to deterministic mock
  providers — zero network, zero credentials. `MORPHO_PROFILE=offline` is set
  for the child anyway so provider routing matches the documented offline
  profile.

## What the test does

1. Locates Python: `MORPHO_PYTHON` override, else plain `python` (never
   `python3` on Windows — the Store stub). The interpreter is probed with
   `import pydantic; assert sys.version_info >= (3, 11)` before anything is
   spawned, so a misconfigured machine fails with an actionable message
   instead of a readiness timeout.
2. Prepares the child environment through the only channel the spawn path
   offers — the child inherits the parent's environment (`process.rs` never
   clears it): `PYTHONPATH` gains `apps/research-worker/src`, and
   `MORPHO_PROFILE=offline` is set on the test process before the supervisor
   first spawns the worker.
3. Builds the production-shaped state: migrated in-memory SQLite, a REAL
   `Supervisor` over the HTTP transport (`WorkerProcess` spawn with the
   env-var contract; the bearer token is minted by the supervisor at spawn
   time — no credential literal exists anywhere), fake keychain, temp config
   and vault roots.
4. Drives the command flow via the public services (the same code the
   command adapters call): project + research config create → scripted plan
   regenerate → plan approve → run create + `research_run` job submit with
   `approve_plan: true`.
5. Runs the event pump loop (mirror of `AppState::pump_once` minus the
   window emission): poll the supervisor's SSE stream, persist every event
   through the events repository, project through the orchestrator.
6. Polls `GET /jobs/{id}` until the worker reports a terminal status and the
   terminal `job.completed` event is drained into the persisted log
   (deadline 240 s; observed run time well under a second warm).
7. Exports the project into the temp vault root and walks the tree.

## What it asserts

- Worker side: job status `COMPLETED`, `error: null`,
  `tasks_completed == tasks_total > 0`.
- Core side: run record `completed` with `finished_at` stamped; all 8 core
  plan tasks claimed for the run; persisted events have strictly monotonic
  per-run sequences (1..=30 observed) and contain the full lifecycle
  vocabulary (`plan.drafted`, `plan.approved`, `run.started`,
  `task.started`, `task.completed`, `run.completed`,
  `run.incremental_report`, `job.completed`); events carry the core run id;
  coverage reports one dimension per configured dimension (2).
- Vault export: `written == 1`, `maps == 1`, `conflicts == 0`; every exported
  file is contained under the temp vault root (canonicalized prefix check),
  lives under `<project_id>/<known folder>/`, and its filename is a
  whitelisted slug (`[a-z0-9-]+\.md`). Exactly one note exists:
  `Maps/real-worker-smoke-map.md` with frontmatter `type: "Map"`.

## Actual output (2026-09-13)

```text
[smoke] python: python
[smoke] project: 01a09926-3d8c-73ab-9cc6-875426be202f
[smoke] plan 01a09926-3d8c-73ab-8757ba22b960 approved with 8 tasks
[smoke] worker spawned, job 01a09926-3f44-70f0-979a-0c32f95a21eb accepted after 0.4s
[smoke] job COMPLETED: 12/12 worker tasks, run 01a09926-3f48-7634-bff3d8b9d3ec5e5e, 30 events forwarded, 0.5s
[smoke] persisted 30 events (sequences 1..=30), knowledge nodes projected: 0
[smoke] coverage overall 0.000 across 2 dimensions
[smoke] vault export: written=1 unchanged=0 maps=1 sources=0 claims=0 root=<temp>\vault\<project_id>
[smoke] vault note: <temp>\vault\<project_id>\Maps\real-worker-smoke-map.md
[smoke] PASS
```

## How to re-run

From the repository root (stdin must stay open — see caveats):

```text
sleep 300 | cargo test -p morpho-desktop --test real_worker_smoke -- --ignored --nocapture
```

Set `MORPHO_PYTHON=C:\path\to\python.exe` when plain `python` does not
resolve to an interpreter with the worker's runtime deps.

## Caveats (read before the manual desktop verification)

- **Stdin EOF shuts the worker down.** The worker treats stdin EOF as the
  supervisor's shutdown signal (`serve.py`). The Rust spawn path inherits
  the parent's stdin instead of piping it, so the test runner's stdin must
  stay open (`sleep 300 | cargo test ...` above). In the packaged desktop
  app the inherited handle is typically invalid, which makes the worker's
  stdin watcher fail benignly — but this deserves an explicit check during
  the manual desktop verification.
- **Cold starts can exceed the 15 s readiness timeout.** The first spawn on
  this machine took ~20 s (interpreter + pydantic imports on a cold file
  cache); warm spawns take ~0.5 s. The supervisor's bounded restarts
  (default policy: 3 attempts with backoff) absorb this: the failed attempt
  warms the cache and the retry connects quickly. Worth remembering when
  reading `WORKER_NOT_AVAILABLE` on a freshly booted machine.
- **Phase-1 projection boundary (ADR-019), asserted not assumed.** The
  worker executes its own DAG with worker-minted task ids, so `task.*`
  events persist but project as no-ops: the 8 core tasks stay `PENDING`
  and the core run closes through the worker's `run.completed`. There is
  no repository projection for `source.*`/`claim.*` events yet
  (`knowledge nodes projected: 0`), so a fresh real run's vault export
  contains only the per-project map note. When those projections land,
  this smoke is the place to tighten `written == 1`.
- **`run_get` cannot attach the core-side task rollup for real runs**:
  the worker envelope's `job.run_id` is the worker's run id, which never
  matches the core run id. The smoke reads core-side state directly from
  the repositories instead.
- The smoke duplicates the private wire-builder (`research_config_wire`)
  and the pump body because command adapters and `*_impl` helpers are
  private to the crate; it calls the same public services they call.
