# Local Compute Guide

How to run the research engine's model calls on your own machine: picking a
local model, installing Ollama, choosing a routing profile, running the
`run_research` CLI, and optionally switching search from the bundled mock to a
self-hosted SearXNG instance. Everything here is configuration on top of the
worker's provider contracts — no code changes and no new dependencies.

The engine is the Python worker in `apps/research-worker`. Its contracts and
boundaries are unchanged by anything in this guide: configuration carries key
*references* only, LLM output still flows through the parse → validate →
normalize gate, and offline mode never touches the network.

## Hardware → model tier

Suggested starting points for the local Ollama model (the `ollama-local`
provider entry):

| Hardware | Suggested model | Note |
|---|---|---|
| GPU ≤ 8 GB VRAM | `qwen3:4b` | Fits alongside a desktop session |
| GPU 8–12 GB VRAM | `qwen3:8b` | Tested on a RTX 3080 10 GB |
| GPU 12–24 GB VRAM | `qwen3:14b` | Higher extraction quality |
| CPU-only, 32 GB+ RAM | `qwen2.5:7b` (q4) | Slow but usable for overnight runs |

Model ids are **configuration, not domain enums**. The defaults above ship in
`default_worker_config()` (`qwen3:8b`, with a `qwen2.5:7b` entry named
`ollama-local-fallback` that is defined but not routed by default); any other
model works by overriding the provider entry, e.g.
`MORPHO_PROVIDER_OLLAMA_LOCAL_MODEL=<model-id>`. Domain code never sees model
names.

## Installing Ollama

```bash
winget install Ollama.Ollama    # or download the installer from ollama.com/download
ollama pull qwen3:8b
```

Proxy note, kept short and factual: `ollama pull` downloads through the
Ollama background *service*, not through your shell. If the machine needs a
proxy for downloads, set `HTTP_PROXY`/`HTTPS_PROXY` on that service (or pull
the models while connected to a network that does not need a proxy). Pull
once; inference afterwards is fully local.

## Routing profiles

Profiles are configuration sugar over the role → provider routing table (see
`docs/ai/MODEL_ROUTING.md`). They never add providers or change contracts.

| Profile | planner / validation | extraction / summarization / classification | embedding | search |
|---|---|---|---|---|
| `default` | `glm` (`glm-4.6`, cloud, key via `env:GLM_API_KEY`) | `ollama-local` (`qwen3:8b` at `http://127.0.0.1:11434/v1`, no credential) | mock | mock |
| `local` | `ollama-local` (`qwen3:8b`) | `ollama-local` | mock | mock |
| `offline` | deterministic mock (scripted fixtures) | deterministic mock | mock | mock (bundled fixture results) |

Selection and precedence:

- Environment: `MORPHO_PROFILE=default|local|offline`. The profile preset is
  applied first; an explicit `MORPHO_ROLE_<ROLE>` variable always wins on top.
- CLI: `--profile default|local|offline`. The CLI's *default* is `offline`
  (conservative: zero network, zero credentials); a non-default `--profile`
  also overrides any `MORPHO_PROFILE` already set in the environment.
- `MORPHO_WORKER_OFFLINE=1` is the standalone switch equivalent to the
  `offline` profile's mock mode.
- An unknown profile name is a configuration error (CLI exit code 2).

`local` trades planning quality for independence: an 8B planner is weaker
than the cloud GLM default. This is acceptable for V0.1; model routing is
revisited in V0.3 (see `ROADMAP.md` and `docs/ai/MODEL_ROUTING.md`).

## Running the CLI

`apps/research-worker/run_research.py` turns one question into plan →
approval gate → DAG run → JSON results.

**Offline demo** — deterministic mocks, zero network, zero credentials
(verified command; finishes in seconds and prints a run summary):

```bash
python apps/research-worker/run_research.py --profile offline --approve \
  --config-json '{"domain":"physics","topic":"quantum entanglement","purpose":"learning","depth":3,"dimensions":["concepts","history"],"languages":["en"],"source_types":["paper","web_page"]}' \
  --out-dir out/demo
```

**Local run** — all LLM roles on the local Ollama model, no cloud key
needed (requires Ollama running and the model pulled):

```bash
python apps/research-worker/run_research.py --profile local \
  --config-file research-config.json --out-dir out/local --approve
```

`--config-file` points at a JSON document in the user-editable
`ResearchConfig` form the CLI accepts: `domain`, `topic`, `purpose` (enum),
`depth` (1–5), `dimensions` (at least one), `languages`, `source_types`, and
an optional `time_range` with string bounds; the inline JSON in the demo
command is a complete example. Note that the canonical
`packages/schemas/research-config.v1.json` describes the *persisted record*
the Rust core will store (with `config_id`/`project_id`); the CLI's
validation model rejects those record-only fields, so feed it the plain
config form, not the persisted record. `--config-file` and `--config-json`
are mutually exclusive and exactly one is required.

### Approval gate semantics

- **Without `--approve`** the plan is drafted and persisted as `plan.json`
  only; the run never starts. This mirrors the product's review invariant —
  the CLI cannot bypass the plan store's approval gate. Exit code 0.
- **With `--approve`** the plan is approved (reviewer note
  `approved by run_research CLI`), the DAG runs to a terminal status, and the
  result files below are written into `--out-dir`.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success — completed run, `NEEDS_REVIEW` terminal status, or plan left pending review |
| 1 | Failed run — terminal status `FAILED`/`CANCELLED`, or no terminal status within the 600 s wall-clock timeout |
| 2 | Configuration/input error — missing or conflicting config options, unreadable `--config-file`, invalid `ResearchConfig` JSON, unknown profile, or provider misconfiguration at startup |

`Ctrl-C` (`KeyboardInterrupt`) propagates to the caller; the orchestrator is
shut down by the CLI's `finally` block either way.

### Output files

The CLI writes only this fixed whitelist of filenames into `--out-dir`
(the directory is created with parents):

`plan.json`, `run.json` (run + task statuses), `sources.json`,
`knowledge_nodes.json`, `relations.json`, `claims.json`,
`validation_report.json`, `usage_totals.json`

Other flags: `--max-workers` (DAG concurrency, default 2) and
`--search-provider` (below).

## Optional real search (SearXNG)

Search stays on the deterministic mock by default. Real search is
config-gated: it is only constructed when you explicitly select a configured
`kind=search` provider; an unknown id or wrong kind raises a structured
`PROVIDER_UNAVAILABLE` error instead of silently pretending.

1. Run a SearXNG instance with the **JSON format enabled** — the quick way is
   `docker run -d --name searxng -p 8888:8080 searxng/searxng`. The default
   image needs `json` added to `search.formats` in its `settings.yml` (volume
   it in or edit inside the container), because the adapter calls
   `GET {base_url}/search?...&format=json` and instances reject that format
   unless enabled.
2. Register it as a provider and select it (environment names map to the
   provider id by lower-casing and turning underscores into hyphens:
   `SEARXNG_LOCAL` → `searxng-local`):

```bash
export MORPHO_PROVIDER_SEARXNG_LOCAL_KIND=search
export MORPHO_PROVIDER_SEARXNG_LOCAL_BASE_URL=http://127.0.0.1:8888
python apps/research-worker/run_research.py --profile local \
  --config-file research-config.json --out-dir out/local --approve \
  --search-provider searxng-local
```

Adapter behavior worth knowing: `https://` endpoints are allowed to any
host, plain `http://` only to loopback, redirects are never followed, and no
credential is needed for the JSON API. Timeouts, connection errors, HTTP 429
and 5xx map to retryable `SEARCH_FAILED`; other 4xx and unreadable payloads
map to non-retryable `SEARCH_FAILED`. Results are deduplicated by
canonicalized URL and capped at the request's `max_results`. In the
`offline` profile `--search-provider` is ignored with a warning (mock always
wins there).

## Verification quick-checks

```bash
curl http://127.0.0.1:11434/v1/models     # Ollama up + which models are pulled
cd apps/research-worker && python -m pytest tests   # worker suite (193 tests)
```

Then run the offline demo command above once: exit code 0, a `COMPLETED`
run line, and the eight whitelisted JSON files in `--out-dir` confirm the
whole loop end to end.
