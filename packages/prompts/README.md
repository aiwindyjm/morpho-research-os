# Prompt Assets and Metadata Specification

Versioned prompt assets live here. The metadata specification was frozen by W2-04 (scope A) and is reconciled with the format the Python engine actually loads by ADR-018: **the canonical metadata encoding is the TOML frontmatter embedded in each prompt file**. This directory must not contain business code, secrets, or private conversations.

## Layout

```text
packages/prompts/
├── README.md                            # this specification
├── planner/plan-draft.v1.md             # prompt: TOML frontmatter + template body
├── planner/golden_cases/                # golden case assertion files (per stage)
│   └── quantum-entanglement.case.md
├── extraction/source-extraction.v1.md
├── search/ entity/ relation/ validation/ writing/ synthesis/   # created with their first prompt
```

Stages map one-to-one to `docs/ai/PROMPT_ARCHITECTURE.md`: `planner`, `search`, `extraction`, `entity`, `relation`, `validation`, `writing`, `synthesis`.

## Per-prompt contract

Each prompt is exactly one Markdown file `<stage>/<name>.v<version>.md`: a `+++`-delimited TOML frontmatter block followed by the template body with `{{variable}}` placeholders (strict substitution — a missing variable is an error, never a silently incomplete prompt). The worker's `PromptRegistry` (`apps/research-worker/src/morpho_worker/pipeline/prompts.py`) loads exactly this format. **There are no `.metadata.json` sidecars**; that earlier W2-04 draft encoding never shipped and is retired by ADR-018.

| Frontmatter key | Content |
|---|---|
| `prompt_id` | `<stage>.<name>`, matching the file stem without the `.v<version>` suffix. |
| `version` | Integer equal to the `v<version>` in the file name and to the version callers request. Bump on any change to the template or declared schema refs. |
| `purpose` | One-sentence statement of what the prompt produces. |
| `input_schema_ref` | Contract the rendered input satisfies: a canonical `$id` (`https://morpho.dev/schemas/<name>.v<major>.json`) or a declared worker stage-schema id. |
| `output_schema_ref` | Contract the parsed LLM output must satisfy before normalization. |
| `model_hint` | Routing hint only (capability tier); never a vendor or model name (`docs/api/PROVIDERS.md`). |
| `safety_constraints` | Multi-line string of constraints the template enforces. |
| `[[golden_cases]]` | Optional array of golden case references: `case_id`, `fixture_ref` (a `fixture_id` under `examples/fixtures/`), `case_file` (assertion file under this stage's `golden_cases/`). |
| `[notes]` | Free-form maintainer notes. |

## Golden cases

1. A golden case binds a prompt version to an offline fixture input and a set of **expected-output skeleton assertions**. Case files are Markdown, named `<fixture>.case.md`, and live under `<stage>/golden_cases/`.
2. `fixture_ref` must resolve to an envelope fixture under `examples/fixtures/` (see `examples/fixtures/README.md`); golden regeneration uses mock providers only. Expected outputs are never invented by hand — a fixture's `expected_outputs` array stays explicitly empty until the mock pipeline can regenerate it offline.
3. Byte-level golden comparison runs inside the consuming test suites, not in CI docs jobs. These case files are wiring and review material: they state what the assertions will check when golden generation lands.

## Rules

1. **Version discipline.** Any change to the template body or its declared schema refs bumps the integer `version` in the file name and frontmatter in the same change. Golden expectations that no longer hold must be regenerated (mock providers only) in the same change.
2. **Prompt version participates in cache keys** (`docs/ai/CACHE_AND_COST.md`): the cache namespace `llm` keys on normalized input, provider/model, schema version, and this prompt version. A bumped version invalidates old entries by construction.
3. **Pipeline is non-negotiable:** `LLM → parse → validate → normalize → persist`. The `output_schema_ref` names the contract the parsed output must satisfy; failures surface as `LLM_INVALID_JSON` with stable errors (see `docs/api/ERRORS.md`). No prompt may instruct or allow free-text direct persistence.
4. **Model routing stays a hint.** `model_hint` feeds routing policy only; vendor and model names remain provider configuration.
5. **Golden cases are offline.** Case files and fixtures never contain real provider responses, secrets, or private conversations.
6. **Adding a prompt** = one new `.v<version>.md` file with valid frontmatter; it never touches domain code and never introduces a second metadata format.
7. **Normalized metadata records.** Where a JSON form of prompt metadata is needed (registries, exports), the record must satisfy the frozen [`packages/schemas/prompt-metadata.v1.json`](../schemas/prompt-metadata.v1.json). The embedded frontmatter is the on-disk source of truth; the JSON record is derived, not authoring format. Field mapping is documented in ADR-018.
