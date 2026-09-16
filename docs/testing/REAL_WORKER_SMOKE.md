# Real Worker Smoke (`real_worker_smoke.rs`)

Status: **PASSING** — real-process end-to-end verification of the desktop
Rust core supervising the actual Python research worker through the full
V0.1 research loop (ADR-024).

- Test: `apps/desktop/src-tauri/tests/real_worker_smoke.rs` (marked
  `#[ignore]`; it never runs in the default gate set).
- Dates: 2026-09-13 (first smoke, phase-1 boundary documented below);
  2026-09-16 (full-loop version, run twice against the final code).
- Machine context: Windows 11 (win32 10.0.26200 x64), Git Bash, Python 3.11
  (CPython 3.11.15) with pydantic importable from plain `python`.
- Worker: `apps/research-worker/src/morpho_worker` run from source (no
  installation); the serve entrypoint routes through the worker's config
  boundary and the test sets `MORPHO_PROFILE=offline` explicitly —
  deterministic mock providers, zero network, zero credentials.

## What the test does

1. Resolves the interpreter: `MORPHO_PYTHON` override, else plain `python`
   (never `python3` on Windows — the Store stub). There is no separate
   probe: the supervisor's health/version gate is the readiness check, and a
   misconfigured machine fails with the structured `WORKER_NOT_AVAILABLE`
   detail.
2. Prepares the child environment through the only channel the spawn path
   offers — the child inherits the parent's environment (`process.rs` never
   clears it): `PYTHONPATH` gains `apps/research-worker/src`, and
   `MORPHO_PROFILE=offline` is set on the test process before the supervisor
   first spawns the worker.
3. Builds the production-shaped state: a migrated FILE-backed SQLite database
   (so the restart phase can re-open the same facts), a REAL `Supervisor`
   over the HTTP transport (the bearer token is minted by the supervisor at
   spawn time — no credential literal exists anywhere), fake keychain, temp
   config and vault roots.
4. Drives the REAL command path: project + research config create → scripted
   plan regenerate (with dependency edges) → plan approve → `run_start`
   (approval gate + the approved-plan payload, ADR-024) → the event pump's
   production `pump_cycle` (persist-before-acknowledge, projection, terminal
   result drain + ingestion, job retirement).
5. Polls `GET /jobs/{id}` until the worker reports a terminal status AND the
   pump has retired the job (results drained) — deadline 240 s; observed
   well under a second warm.
6. Exports the project into the temp vault root twice (idempotence) and
   walks the tree.
7. Re-opens the same SQLite file in a fresh `AppState` (simulated restart)
   and reads the run, rollup, frozen config snapshot, and graph back.

## What it asserts

- Worker side: job status `COMPLETED`, `error: null`,
  `tasks_completed == tasks_total == 8` — exactly the approved plan's task
  count, no more, no less.
- Core side: run record `completed` with `finished_at` stamped; **every one
  of the 8 approved core tasks advanced to `COMPLETED` through the worker's
  own events (core task ids verbatim — the ADR-019 phase-1 boundary is
  closed)**; persisted events have strictly monotonic per-run sequences
  (1..=20 observed) and contain the lifecycle vocabulary (`run.started`,
  `task.started`, `task.completed`, `run.completed`, `job.completed`);
  events carry the core run id.
- Domain records (ingested from `GET /jobs/{id}/results`, from an EMPTY
  database — nothing pre-seeded): ≥2 sources (at least one `evaluated` with
  a quality score), ≥2 knowledge nodes, ≥2 claims, ≥1 evidence row, ≥1
  relation (node foreign keys resolve verbatim), and every evidence row
  linked to its claim through `claim_evidence`; coverage overall > 0
  (0.650 observed).
- Vault export: `written ≥ 3` (map + sources + claims), `maps == 1`,
  `conflicts == 0`; the second export writes nothing new
  (`written == 0`, `unchanged == written-before`); every exported file is
  contained under the temp vault root (canonicalized prefix check), lives
  under `<project_id>/<known folder>/`, and its filename is a whitelisted
  slug (`[a-z0-9-]+\.md`).
- Restart readback: `run_latest_get` returns the same run id, `completed`
  status, the persisted `worker_job_id`, all 8 completed tasks in the
  rollup, and the frozen config snapshot (topic preserved); the graph
  projection returns the same node count.

## Actual output (2026-09-16, final code)

```text
[smoke] worker src: ...\apps\research-worker\src
[smoke] project: 01a0aaa3-daad-74b8-82bf-77a862ebe2bb
[smoke] plan 01a0aaa3-daae-72a5-97f0-d99743e39106 approved with 8 tasks (dependency edges included)
[smoke] worker spawned, job 01a0aaa3-dc62-77fb-83a2-c6f7065bd5ed accepted for run 01a0aaa3-dab0-7011-9bc1-1af9714124e1 after 0.4s
[smoke] job COMPLETED: 8/8 tasks, 20 events persisted, 0.5s total
[smoke] domain: 2 sources, 4 nodes, 4 claims, 4 evidence, 3 relations; coverage overall 0.650
[smoke] vault export: written=11 unchanged=0 maps=1 sources=2 claims=4 root=<temp>\vault\<project_id>
[smoke] vault notes: 11 files
[smoke] restart readback: run, rollup, config snapshot, graph all consistent
[smoke] PASS
```

(2026-09-13 baseline, kept for the record — the phase-1 boundary it
documented is now closed: the worker executed 12 worker-minted tasks while
the 8 core tasks stayed `PENDING`, knowledge nodes 0, coverage 0.000, vault
`written=1` map note only.)

## How to re-run

From the repository root (stdin must stay open — see caveats):

```text
sleep 300 | cargo test -p morpho-desktop --test real_worker_smoke -- --ignored --nocapture
```

Set `MORPHO_PYTHON=C:\path\to\python.exe` when plain `python` does not
resolve to an interpreter with the worker's runtime deps.

## Caveats (read before the manual desktop verification)

- **Offline profile only.** The assertions pin deterministic mock-provider
  output. Real-provider runs (GLM/Ollama/SearXNG through
  `serve.py::build_worker_config`) are a separate manual acceptance item
  and are NOT covered here.
- **Stdin EOF shuts the worker down.** The worker treats stdin EOF as the
  supervisor's shutdown signal (`serve.py`). The Rust spawn path inherits
  the parent's stdin instead of piping it, so the test runner's stdin must
  stay open (`sleep 300 | cargo test ...` above). In the packaged desktop
  app the inherited handle is typically invalid, which makes the worker's
  stdin watcher fail benignly — but this deserves an explicit check during
  the manual desktop verification.
- **Cold starts can exceed the 15 s readiness timeout.** The first spawn on
  a cold file cache can take ~20 s (interpreter + pydantic imports); warm
  spawns take ~0.5 s. The supervisor's bounded restarts absorb this: the
  failed attempt warms the cache and the retry connects quickly. Worth
  remembering when reading `WORKER_NOT_AVAILABLE` on a freshly booted
  machine.
- **ADR-024 is Proposed.** The `plan` job-envelope member, the
  `GET /jobs/{id}/results` endpoint, migration 004, and the three
  restart-read commands land behind a Proposed ADR pending maintainer
  ratification; nothing shipped in a release depends on them until
  accepted.
- The smoke drives the real command implementations
  (`run_start_impl`/`run_latest_get_impl`, public for exactly this test)
  and the production `pump_cycle`; the only duplicated logic is the
  environment preparation, documented above.
