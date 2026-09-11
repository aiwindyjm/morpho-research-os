# Shared Schemas Package

`packages/schemas` is the canonical, versioned contract source for every cross-process payload in Morpho Research OS: domain records, worker protocol messages, provider contracts, prompt metadata, and fixture envelopes. All other layers (TypeScript/Zod, Python/Pydantic, Rust/Serde) consume or bind to these files; they must never define a second copy of a contract.

## Layout

```text
packages/schemas/
├── README.md            # this file: conventions + schema index
├── MIGRATIONS.md        # SQLite migration plan (runtime state, not JSON contracts)
├── <name>.v<major>.json # canonical JSON Schema files (flat, one file per contract major)
├── fixtures/cases/      # cross-language validation corpus
│   └── <name>/valid-*.json | invalid-*.json
├── ts/                  # Zod binding package (@morpho/schemas)
├── py/                  # Pydantic binding package (morpho-schemas)
└── rust/                # Serde binding crate (morpho-schemas)
```

## Canonical source rules

1. **JSON Schema draft 2020-12 is canonical.** A contract exists only when its `.json` file exists here. Bindings in `ts/`, `py/`, and `rust/` are maintained in lockstep and proven equivalent by the shared fixture corpus — never by copying semantics from a binding back into a schema.
2. **Naming and identity.** One file per contract major version: `<name>.v<major>.json` (kebab-case names, e.g. `research-config.v1.json`). `$id` must be `https://morpho.dev/schemas/<name>.v<major>.json` and unique across the package.
3. **`schema_version` is a required enum of released minors.** Every schema requires a top-level `schema_version` string enum listing every released minor of that major, starting as `["1.0"]`. The value records the contract minor the *writer* targeted; readers must accept every minor listed. Additive changes append the new minor to the enum and keep the file name's major; the file name keeps the major.
4. **Compatibility.** Within a major: only additive changes (new optional properties, new enum values must be avoided unless all consumers are updated in the same change, relaxed constraints). Breaking changes require a new `<name>.v<major+1>.json` file, an ADR under `docs/architecture/adr/`, and a migration/read-policy note in `docs/development/VERSIONS.md`. Old majors remain readable during transition; writers always target the newest major.
5. **Validation vocabulary (v1 restriction).** Schemas use only `type`, `required`, `properties`, `enum`, `const`, `items`, `minimum`, `maximum`, `minItems`, `maxItems`, `additionalProperties: false` where a record is closed, and `description`. No regex `pattern`, no `format` assertions, no `$ref`/`$defs` in v1. Rationale: Zod, Pydantic, and Serde must accept/reject the same instances, and v1 keeps that parity mechanical. Timestamps are RFC 3339 UTC strings and IDs are UUIDv7 strings **by convention** (documented in `docs/DATA_MODEL.md`), not by format assertion.
6. **Nulls.** Optional means "absent", not `null`. Bindings use optional/`Option` fields. Normalizers must drop `null` values before validation (fixture and golden pipelines normalize `null` → omitted).
7. **Open vs. closed records.** Domain records are open (unknown properties allowed, so bindings can ignore additive fields from a newer minor). Envelope/protocol messages that Rust and the worker both dispatch on are closed with `additionalProperties: false` to catch typos early.

## Cross-language consistency

`fixtures/cases/<name>/` holds the validation corpus: `valid-*.json` instances must be accepted and `invalid-*.json` instances must be rejected — by the canonical JSON Schema and by all three bindings. Every schema in the index below must have at least one valid and one invalid case; CI fails otherwise. Invalid cases may only violate constraints in the v1 vocabulary above so that all stacks reject them for the same reason.

Run the contract tests (from the repository root):

| Stack | Command |
|---|---|
| JSON Schema (canonical) + Zod | `pnpm --filter @morpho/schemas test` |
| JSON Schema (canonical) + Pydantic | `uv run --package morpho-schemas pytest` |
| Serde | `cargo test -p morpho-schemas` |

## Breaking-change checklist

1. New `<name>.v<major+1>.json` with updated `$id` and `schema_version` const.
2. Bindings updated; old major binding kept read-only where still consumed.
3. New corpus cases for the new major; old major cases remain.
4. ADR describing why the break is needed and the transition plan.
5. `docs/development/VERSIONS.md` matrix updated.

## Schema index

| Contract | File | Version | Frozen by | Purpose |
|---|---|---|---|---|
| ResearchConfig | `research-config.v1.json` | 1.0 | W2-01 | Structured research configuration record for a project. |
| Project | `project.v1.json` | 1.0 | W2-01 | Isolated research project root record. |
| ResearchPlan | `research-plan.v1.json` | 1.0 | W2-01 | Reviewable plan; never executes before user approval. |
| ResearchSection | `research-section.v1.json` | 1.0 | W2-01 | Plan section grouping tasks by dimension. |
| ResearchTask | `research-task.v1.json` | 1.0 | W2-01 | Durable task with status machine, idempotency key, and checkpoint. |
| TaskDependency | `task-dependency.v1.json` | 1.0 | W2-01 | DAG edge with wait condition. |
| ResearchRun | `research-run.v1.json` | 1.0 | W2-01 | One execution of an approved plan with config/plan snapshots. |
| FixtureEnvelope | `fixture-envelope.v1.json` | 1.0 | W0-05 | Envelope for offline fixtures and golden results (`examples/fixtures/README.md`). |
