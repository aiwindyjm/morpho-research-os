# ADR-017 Unify the Fixture Envelope Into One Canonical Contract

## Status

Accepted (2026-09-12)

## Context

Two different schemas shared the name `fixture-envelope.v1.json`:

- **`packages/schemas/fixture-envelope.v1.json`** (W0-05, "contract variant"): `schema_version` + `contract{schema, schema_version}` + `prompt` + `input`/`expected` payload instances + `stability{stable_fields, volatile_fields}` + `provenance{kind}`. Consumed by `examples/fixtures/minimal/*.fixture.json` and `scripts/validate-fixture.py`.
- **`tests/fixtures-support/schema/fixture-envelope.v1.json`** (TEST-01, "dataset variant"): `fixture_envelope_version` + `kind` + `input{schema, payload}` + `expected_outputs[{name, schema, payload}]` + `provenance{origin, synthetic}` + `stability{deterministic, ignored_fields}`. Consumed by the three golden fixtures (`examples/fixtures/{quantum-entanglement,brain-computer-interface,large-language-model}/fixture.json`), the tri-language reference loaders, and `scripts/check-contracts.ps1`.

Two contracts under one name violates the single-source rule (`packages/schemas/README.md` rule 1: a contract exists only when its `.json` file exists there). The W0-05 gate (`validate-fixture.py --all`) only discovered `*.fixture.json` files, so the golden fixtures were never validated by that gate — they were covered only by the contracts.yml loader checks.

## Decision

One canonical schema: **extend `packages/schemas/fixture-envelope.v1.json` to accept both variants** and delete the `tests/fixtures-support/schema/` copy. The golden fixtures are NOT migrated.

1. **Unified schema shape.** The canonical schema declares the union of both variants' properties, `additionalProperties: false` at every level it can, and requires the intersection of the variants' required fields (`fixture_id`, `input`, `provenance`). Sub-blocks that appear in only one variant keep their strict inner shape when present (`contract` requires `schema`+`schema_version`; `prompt` requires `prompt_id`+`prompt_version`; `expected_outputs` entries require `name`+`schema`+`payload`; `stable_fields` keeps `minItems: 1`). Union blocks (`provenance`, `stability`) list both vocabularies with variant-specific keys optional.
2. **Variant strictness lives in the offline validators.** The v1 validation vocabulary (README rule 5: no `oneOf`/`if`/`then`) cannot express "one of two shapes" in-schema without giving up tri-language parity. So `scripts/validate-fixture.py` (and, unchanged, `check-contracts.ps1` + the loaders) dispatch on the variant marker and enforce the variant-specific required fields. `validate-fixture.py` now: discovers both `*.fixture.json` and `<dataset>/fixture.json` under `examples/fixtures/`; rejects files with **both** markers (mixed variants) or **neither**; for the dataset variant resolves `input.schema`/`expected_outputs[].schema` as canonical `$id`s from `packages/schemas` and deep-validates the payloads; for the contract variant keeps the existing `<name>.v<major>.json` resolution for `input`/`expected`.
3. **Why extend rather than migrate the fixtures.** Migrating the golden fixtures to the contract variant would rewrite frozen test assets that three CI loader implementations validate byte-for-byte in spirit, force a `kind`-less re-shape of their payloads behind `input{schema,payload}`, and break the documented TEST-01 ownership of those files — churn with no contract benefit. Migrating the contract variant to the dataset variant would break the W0-05-frozen gate and the `prompt`-block semantics that `prompt-metadata.v1.json` golden cases reference. Accepting both variants under one `$id` fixes the single-source violation at minimal blast radius.
4. **Golden `expected_outputs` stay explicitly empty.** The three golden fixtures carry `"expected_outputs": []`, documented as "pending, not absent". Outputs are never invented; they will be attached by offline regeneration from the mock pipeline once golden output generation lands (TEST follow-up). The unified schema's `expected_outputs` description states this.
5. **Registry hygiene.** Zod/Pydantic/Serde `FixtureEnvelope` mirrors are updated to the unified superset and proven by the shared corpus (new dataset-variant valid case plus invalid cases for entry shape and marker enum). The tri-language loaders keep their dataset-variant validation rules — they are now described as enforcing "the dataset-variant rules of the unified schema", and their doc references point at the canonical file. `check-contracts.ps1` needed no changes and keeps passing.

## Alternatives

- **Migrate all fixtures to one variant:** rejected (see decision 3) — rewrites frozen golden assets and/or the W0-05 gate for zero semantic gain.
- **Keep two schemas, rename one:** leaves two envelope contracts alive and keeps `validate-fixture.py --all` unable to speak about the golden fixtures.
- **Express the two variants in-schema with `oneOf`/`if-then`:** violates the v1 validation vocabulary that guarantees Zod/Pydantic/Serde accept-reject parity (README rule 5).

## Consequences

- One canonical `$id` for the fixture envelope; the duplicate schema file is gone; `tests/fixtures-support/schema/` no longer holds contracts.
- `scripts/validate-fixture.py --all` now validates every fixture under `examples/fixtures/` (contract corpus + three golden datasets) against the unified envelope and their referenced contracts, closing the CI coverage gap from the W0-05 gate's perspective.
- Future consolidation (migrating the golden datasets onto the contract variant, or minting a strict single-shape `fixture-envelope.v2.json` with `oneOf` once the vocabulary allows it) remains open and would be its own ADR.
- A future envelope change must update: the unified schema, the three `FixtureEnvelope` bindings, `validate-fixture.py`, `check-contracts.ps1`, and the three reference loaders together.
