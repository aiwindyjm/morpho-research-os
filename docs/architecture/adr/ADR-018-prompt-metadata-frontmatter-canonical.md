# ADR-018 Prompt Metadata: Embedded TOML Frontmatter Is Canonical

## Status

Accepted (2026-09-12)

## Context

`packages/prompts/README.md` (W2-04 freeze) mandated a two-file per-prompt contract: `<stage>/<name>.md` plus a `<stage>/<name>.metadata.json` sidecar that is an instance of `packages/schemas/prompt-metadata.v1.json`, with SemVer versions and at least one `golden_cases` entry. Reality diverged:

- Only two prompts exist (`planner/plan-draft.v1.md`, `extraction/source-extraction.v1.md`); both carry **embedded TOML frontmatter** (`+++`-delimited) and there are **no sidecar files**.
- The Python engine's `PromptRegistry` (`apps/research-worker/src/morpho_worker/pipeline/prompts.py`) loads exactly the frontmatter format (files are discovered as `<stage>/<name>.v<version>.md`; `version` is parsed with `int(...)`) and ignores everything else.
- Frontmatter `version` is an **integer** matching the file name (`v1`), not the SemVer string that `prompt-metadata.v1.json` and `docs/development/VERSIONS.md` describe.
- No golden case wiring existed anywhere: the frontmatter only carried a `[notes] golden_cases = "..."` placeholder string.

## Decision

1. **One canonical metadata format: the embedded TOML frontmatter.** Each prompt is a single `<stage>/<name>.v<version>.md` file: TOML frontmatter (prompt_id, integer version, purpose, input_schema_ref, output_schema_ref, model_hint, safety_constraints, optional `[[golden_cases]]` array, free-form `[notes]`) followed by the template body. `.metadata.json` sidecars are retired from the specification — they never shipped, and mandating them would create a second metadata format the worker does not load. `packages/prompts/README.md` is rewritten to match this reality.
2. **Integer versions on disk.** The file name suffix and frontmatter `version` are the same integer; this is what the worker enforces (`int(metadata["version"])` must equal the requested version). The SemVer wording in `prompt-metadata.v1.json`'s `version` field and the VERSIONS.md prompt-version row describe the *normalized record* form; correcting those documents is a maintainer follow-up (outside this task's file scope). A later migration to SemVer strings would be its own ADR.
3. **`prompt-metadata.v1.json` stays, unchanged, as the normalized-record schema.** It is not deleted: it is the frozen contract a derived JSON form of prompt metadata must satisfy where a registry needs one (bindings and corpus remain). It is no longer the authoring format. Field mapping: `prompt_id`→`prompt_id`; file `v<N>`→`version`; area→`stage`; `purpose`→`purpose`; `input_schema_ref`→`input_schema{schema, schema_version}`; `output_schema_ref`→`output_schema{...}`; `safety_constraints`→`safety[]`; `[[golden_cases]]`→`golden_cases[]{case_id, fixture_ref}`. Frontmatter `model_hint` stays a free-text routing hint rather than the record's `capability` enum.
4. **Golden-case wiring (documentation + files only).** Convention: assertion files live under `<stage>/golden_cases/<fixture>.case.md`; prompts reference them from frontmatter via `[[golden_cases]]` entries (`case_id`, `fixture_ref` resolving to a `fixture_id` under `examples/fixtures/`, `case_file`). First instance: `packages/prompts/planner/golden_cases/quantum-entanglement.case.md`, derived from the quantum-entanglement golden fixture (7 requested dimensions, one section per dimension, every task `runtime_type: search`, plan-describes-work-not-results), referenced from `plan-draft.v1.md`. The fixture's `expected_outputs` remain an explicitly empty array — outputs are never invented (see ADR-017). No automated golden-case validator was added in this task; wiring beyond documentation (frontmatter schema validation, case-file lint, mock-pipeline regeneration) lands with the planner pipeline work.

## Alternatives

- **Adopt sidecars as mandated (rewrite prompts to add `.metadata.json` files):** creates a second source of truth the worker never reads; every future edit must keep two files in sync for no consumer.
- **Migrate `prompt-metadata.v1.json` to describe the frontmatter vocabulary:** conflates an on-disk authoring encoding with a normalized data contract; also a breaking change to a frozen schema with no runtime need.
- **Delete `prompt-metadata.v1.json`:** loses the frozen normalized-record contract and orphans its bindings/corpus for no benefit.

## Consequences

- The specification now matches what exists and what the worker loads; adding a prompt is one file plus an optional case file.
- Frontmatter is validated only by the worker's loader rules (id/version consistency, strict placeholder substitution); a future frontmatter schema-check script can be added without contract changes.
- The one golden case is review wiring, not an executable test; when the mock planner pipeline lands, its assertions attach to the fixture's `expected_outputs` and the consuming test suites enforce them.
- VERSIONS.md's prompt-version row (SemVer) and `prompt-metadata.v1.json`'s version wording need a maintainer pass to reference integer on-disk versions; tracked as follow-up, not changed here.
