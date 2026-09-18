# Data Model

Project 1—N ResearchConfig; Plan 1—N Sections and Tasks; Task N—N TaskDependency; Run 1—N Tasks; Source 1—N SourceContent; Claim N—N Evidence; Evidence N—1 Source; KnowledgeNode N—N Relation; Artifact N—1 Project; Event N—1 Run; LLMUsage N—1 Task.

SQLite stores normalized runtime/index state. UUIDv7 strings, UTC timestamps, foreign keys, and indexes on project/run/state/canonical URL/endpoints are mandatory. JSON is limited to provider payload metadata, task parameters, typed node metadata, and event details. Markdown stores durable user knowledge and frontmatter; cache stores replaceable fetch/LLM data; logs store operational data.

Frozen JSON contracts for these entities live in [`packages/schemas/`](../packages/schemas/README.md); that package is the only place a contract may be defined or changed.

## Project-scoped domain identity (worker result ingestion)

Worker-minted ids (knowledge nodes, relations, claims, evidence) are deterministic per (type, canonical name) with **no project dimension**, so the core stores them under project-scoped primary keys `<project_id>:<worker_id>`; nodes additionally keep the worker node id as their per-project `slug`. Two projects may research the same concept without colliding, repository updates verify project ownership, and re-ingesting the same batch into the same project is idempotent. Sources deduplicate by `(project_id, canonical_url)` as before.

## Run delivery state

`runs.status` is the EXECUTION projection of the worker's events (ADR-019);
`runs.delivery_status` (migration 006) is the separate, durable fact of
whether the run's validated result records were committed to the domain
tables: `pending` (every fresh run), `delivered` (set inside the ingestion
transaction — the run only reads delivered once its results are), `failed`
(delivery exhausted the automatic retry budget or the worker died before
delivery; durable, observable, automatically re-armed with backoff while
the job lives, and converged explicitly at startup), `unknown` (legacy
backfill whose delivery can never be proven). A terminal execution status
never claims the results are committed.

## Source content rows

`source_contents` rows persist the worker's availability classification (`content_class`: `full-text` | `snippet` | `unavailable`, migration 005), the payload's fingerprint and fetch time, and — for non-empty payloads — a `cache_path` inside the core-owned cache directory (`<app-data>/cache/source-contents`), never inside the user's Markdown vault. Evidence locators therefore remain auditable after the worker process exits.

The cache is content-addressed with PROVABLE consistency (round-2 review P1): every payload's SHA-256 must equal its declared fingerprint (so a file's name determines its bytes and a tampered payload can never land under a committed fingerprint's name); payloads land in unique hidden temp files and are published by atomic rename; a referenced file whose bytes no longer hash to its name self-heals on the next ingest; a failed batch compensates by removing the files it created — it can never mutate committed content or leave a database row pointing at a missing file (short of a crash inside the publish window, which leaves at most an unreferenced, hash-verified file).

`evidence.retrieved_at` carries the WORKER's retrieval time (the locator's `retrieved_at`, falling back to the source's persisted fetch time; `0` means unknown) — never the ingestion clock — and `evidence.locator_detail` stores the structured locator losslessly as JSON next to the flattened display string (migration 006).
