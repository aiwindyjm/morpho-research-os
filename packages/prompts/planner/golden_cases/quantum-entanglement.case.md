# Golden Case: planner.plan-draft / quantum-entanglement

- `prompt_id`: planner.plan-draft
- `prompt_version`: 1
- `fixture_ref`: `quantum-entanglement` — [`examples/fixtures/quantum-entanglement/fixture.json`](../../../../examples/fixtures/quantum-entanglement/fixture.json) (dataset-variant envelope, `kind: research-config`)
- `status`: skeleton assertions only. The fixture's `expected_outputs` are an explicitly empty array (pending, not absent); byte-level golden expectations attach when the mock planner pipeline lands.

## Input

The fixture's `input.payload` is rendered into the template variables:

| Variable | Value |
|---|---|
| `domain` | physics |
| `topic` | quantum entanglement |
| `purpose` | research |
| `depth` | 4 |
| `dimensions` | concepts, history, theory, experiments, papers, recent developments, future trends |
| `languages` | en |
| `source_types` | paper, preprint, encyclopedia, textbook |

## Expected output skeleton

The model response is parsed, validated against `morpho.worker.planner-output.v1`, and normalized before persistence. This case asserts the section skeleton:

1. The response is a single JSON object with a top-level `sections` array and an optional `notes` string — no other top-level keys.
2. There is exactly one section per requested dimension (7 sections); each `dimension` value matches the fixture's `dimensions` entries verbatim. Extra sections appear only when essential for the topic, never as duplicates of a requested dimension.
3. Every section carries non-empty `dimension`, `title`, and `objective` fields and a non-empty `tasks` array.
4. Every task carries non-empty `title` and `objective` fields and `runtime_type` exactly `search`.
5. No section contains factual results, sources, or conclusions: a plan describes work to do, not results.
6. The rendered prompt requires explicit human approval before execution; nothing in the output may trigger execution on its own.

## Review rules

Golden regeneration uses mock providers only; expected outputs are never hand-invented. Updating these assertions requires bumping the prompt `version` in `plan-draft.v1.md` in the same change (see `packages/prompts/README.md`).
