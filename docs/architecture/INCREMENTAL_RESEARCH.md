# Incremental Research

Each ResearchRun snapshots config and plan. New runs fingerprint canonical sources and normalized claims to detect new, changed, and conflicting records. Versioned Markdown uses frontmatter provenance and three-way merge awareness; AI updates create proposals when user edits are detected. Existing Obsidian vault indexing is a future adapter that parses frontmatter and wikilinks into the same normalized model.

## Status (2026-09-12): worker side implemented

The diff machinery is implemented worker-side in `apps/research-worker/src/morpho_worker/incremental.py` and wired into the orchestrator (`orchestrator.py::_record_incremental`); the canonical `run.incremental_report` event type is ratified in `event.v1.json` (ADR-015 Amendment 1).

**Classification semantics.** Sources are identified by `url_dedup_key` and fingerprinted over their content hash (canonical URL as fallback); a source is *new* when its key is absent from the baseline and *changed* when the key is known but the fingerprint differs. Claims are identified by deterministic claim id and fingerprinted over normalized content (subject, predicate, object, scope, confidence, evidence ids — accumulating evidence across runs counts as a change; lifecycle-only `status`/`review_state` changes deliberately do not). *Conflicting* preserves claim.v1.1 semantics: a current claim whose `(subject_node_id, predicate)` matches a prior claim with a different object value conflicts with that prior claim, and a claim the run itself marked `confidence=conflicting` conflicts within the run; a source whose extracted evidence backs a conflicting claim is conflicting.

**Precedence rule.** Each record lands in exactly one bucket: `conflicting > new > changed`. A contradicting claim always has a different object value and therefore a fresh deterministic id — without this precedence every conflict would silently classify as new; the same argument covers sources backing conflicting material. Records with unchanged fingerprints are counted but not itemized.

**Record shape.** `IncrementalBaseline` (per completed run: source fingerprints by dedup key, claim fingerprints and claim keys by id); `IncrementalReport` (counts for sources/claims × new/changed/conflicting/unchanged/total, itemized `SourceEntry`/`ClaimEntry` lists — conflicting claim entries carry the `prior_claim_id` they contradict, within-run conflicts carry none). The report is persisted through the injected `ResultSink` as record type `incremental-report`, announced with a `run.incremental_report` event carrying the summary counts, and summarized on the run record's `result` field.

**Baseline lifecycle.** One baseline per project, held by the orchestrator; a run compares against the baseline snapshot taken when it started, and only COMPLETED runs produce a report and become the project's next baseline (failed/cancelled/paused runs leave it untouched). A project's first run compares against an empty baseline: everything is new, nothing changed or conflicting. A run that finishes NEEDS_REVIEW is not terminal — the report lands when the user resolves the review and the run reaches COMPLETED.

## Open items

- **Rust persistence of reports is projection-only today.** The core stores the `run.incremental_report` event through the events repository (and re-emits it as `morpho://events`) but has no dedicated incremental-report store or query surface; report rows currently live only in the worker's sink until the core-side record lands.
- Report payload shape is not frozen as a contract yet (the `event.v1` payload stays permissive by design); freezing an `incremental-report` record contract is follow-up work.
- The report is in-memory state in the worker: baselines do not survive worker restarts until the Rust core owns baseline retrieval.
- Versioned Markdown three-way merge, AI proposals on user edits, and the Obsidian vault adapter remain future work as in the original design.
