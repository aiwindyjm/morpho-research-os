# Prompt Assets and Metadata Specification

Versioned prompt assets live here. The **metadata specification is frozen by W2-04 (scope A)**; prompt content is owned by the Python engine scope (D). This directory must not contain business code, secrets, or private conversations.

## Layout

```text
packages/prompts/
├── README.md                  # this specification
├── planner/<name>.md          # prompt template per stage directory
├── planner/<name>.metadata.json
├── search/ extraction/ entity/ relation/ validation/ writing/ synthesis/
```

Stages map one-to-one to `docs/ai/PROMPT_ARCHITECTURE.md`: `planner`, `search`, `extraction`, `entity`, `relation`, `validation`, `writing`, `synthesis`.

## Per-prompt contract

Each prompt is exactly two files sharing a stem:

| File | Content |
|---|---|
| `<stage>/<name>.md` | The prompt template. Pure text with explicit input placeholders; no code, no keys, no personal data. |
| `<stage>/<name>.metadata.json` | An instance of the frozen [`packages/schemas/prompt-metadata.v1.json`](../schemas/prompt-metadata.v1.json): `prompt_id` (`<stage>.<name>`), SemVer `version`, `stage`, `purpose`, `input_schema`/`output_schema` contract references, optional `model_hint.capability`, `safety` constraints, and at least one `golden_cases` entry referencing a `fixture_id` in `examples/fixtures/`. |

## Rules

1. **Version discipline.** Any change to the template or its declared schemas bumps the metadata `version` (SemVer: content edits are at least a patch; input/output schema reference changes are at least a minor). Old golden expectations that no longer hold must be regenerated in the same change.
2. **Prompt version participates in cache keys** (`docs/ai/CACHE_AND_COST.md`): the cache namespace `llm` keys on normalized input, provider/model, schema version, and the prompt version declared here. A bumped version invalidates old entries by construction.
3. **Pipeline is non-negotiable:** `LLM → parse → validate → normalize → persist`. The `output_schema` reference names the contract the parsed output must satisfy; failures surface as `LLM_INVALID_JSON` with stable errors (see `docs/api/ERRORS.md`). No prompt may instruct or allow free-text direct persistence.
4. **Model routing stays a hint.** `model_hint.capability` (`strong`/`medium`/`cheap`) feeds routing policy only; vendor and model names remain provider configuration (`docs/api/PROVIDERS.md`).
5. **Golden cases are offline.** `fixture_ref` must resolve to an envelope fixture under `examples/fixtures/` with `prompt` metadata matching this prompt's id and version; golden regeneration uses mock providers only.
6. **Adding a prompt** = new directory entry plus metadata instance validated against the frozen schema; it never touches domain code or introduces a second metadata format.
