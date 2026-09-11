# Fixtures

Deterministic offline test fixtures for Morpho Research OS. Fixtures are the only test input allowed to cross language boundaries: Rust, Python, and TypeScript tests read the same `fixture_id` and schema version from these files. No network, no API keys, no real provider responses, no personal data.

## Layout

```text
examples/fixtures/
  README.md                  <- this file: envelope contract and fixture registry
  <fixture-id>/fixture.json  <- one envelope per fixture, self-contained
```

The envelope format is defined by [`fixture-envelope.v1.json`](../../tests/fixtures-support/schema/fixture-envelope.v1.json) under `tests/fixtures-support/schema/`. Reference loaders with identical validation rules live in `tests/fixtures-support/loaders/` (TypeScript, Python, Rust). Run all of them with `tests/fixtures-support/run-fixture-checks.ps1`; CI runs them in `.github/workflows/contracts.yml`.

## Envelope rules

| Field | Rule |
|---|---|
| `fixture_envelope_version` | Always `1.0`. Bump only for breaking envelope changes. |
| `fixture_id` | kebab-case, unique in the repository, equals the directory name. |
| `kind` | What the input payload is. Must equal the input schema `$id` last path segment with the `.json` extension and `.vN` version suffix removed, e.g. `research-config` for `research-config.v1.json`. |
| `input.schema` | A canonical `$id` from `packages/schemas/`. Inline second copies of schemas are forbidden. |
| `input.payload` | Must satisfy the referenced schema. Loaders perform a shallow required/const check; deep validation belongs to the schema toolchain. |
| `expected_outputs` | Golden results. Entries are added only after the corresponding output schema is frozen in `packages/schemas/`. |
| `provenance` | `origin` (`synthetic`, `curated-public`, `user-contributed`) plus the mandatory `synthetic` flag. |
| `stability` | Declares volatile fields (`created_at`, generated IDs) that comparisons must normalize. |

Determinism policy: committed fixtures never contain wall-clock timestamps, random IDs, or provider-specific responses. If a pipeline legitimately produces such fields, mark them in `stability.ignored_fields` and compare the rest.

Golden result update policy: changing an `expected_outputs` payload is a reviewed change. The commit message must reference the task or issue that justifies the new golden behavior; silently relaxing an expectation is treated as a failing test.

## Kind registry

| kind | input schema | status |
|---|---|---|
| `research-config` | `https://morpho.dev/schemas/research-config.v1.json` | registered |

New kinds are registered here together with their frozen schema. A fixture whose `kind` has no registered schema must not be merged.

## Registered fixtures

| fixture_id | kind | input validated | expected outputs |
|---|---|---|---|
| `quantum-entanglement` | `research-config` | yes (offline) | pending — waiting for frozen plan/task schemas (W2-01) and knowledge schemas (W2-06) |
| `brain-computer-interface` | `research-config` | yes (offline) | pending — same |
| `large-language-model` | `research-config` | yes (offline) | pending — same |

These are the three golden fixtures named in `docs/PRD.md` and `docs/testing/MOCKS.md`. The input side is fully offline-verifiable today. Golden plan, entity, claim, and Markdown snapshots will be attached through `expected_outputs` as soon as the output schemas are frozen; until then this table is the public record that the output side is not yet covered and must not be claimed as done.

## Adding a fixture

1. Create `examples/fixtures/<fixture-id>/fixture.json` following the envelope schema.
2. Register the `kind` above if it is new.
3. Add the fixture to this table with its real validation status.
4. Run `tests/fixtures-support/run-fixture-checks.ps1` and keep every loader green.
