# Offline Fixtures and Golden Results

Fixtures under `examples/fixtures/` are the shared, deterministic inputs and golden outputs for offline tests in Rust, Python, and TypeScript. They never contain real provider responses, API keys, personal research content, or private conversations.

## Envelope

Every fixture is a single JSON file under `examples/fixtures/`, in one of two variants of the unified envelope schema [`packages/schemas/fixture-envelope.v1.json`](../../packages/schemas/fixture-envelope.v1.json) (ADR-017):

```text
examples/fixtures/
├── README.md                        # this specification
├── minimal/                         # synthetic contract-level fixtures (contract variant)
│   └── research-config-basic.fixture.json
├── quantum-entanglement/            # golden research datasets (dataset variant)
├── brain-computer-interface/
└── large-language-model/
```

A file uses exactly ONE variant; `scripts/validate-fixture.py` rejects files that mix variant markers.

### Contract variant (`*.fixture.json`, W0-05)

| Field | Meaning |
|---|---|
| `schema_version` | Envelope version (`1.0`). Variant marker. |
| `fixture_id` | Globally unique `<dataset>.<case>` kebab-case ID. |
| `description` | What the fixture exercises, in one sentence. |
| `contract.schema` / `contract.schema_version` | The canonical contract in `packages/schemas/` that `input` (and `expected`, when present) must satisfy. Loaders resolve `<schema>.v<major>.json`. |
| `prompt` | Required when the golden output comes from a prompt pipeline: `prompt_id` + `prompt_version`. The version is part of cache keys and golden case selection. |
| `provenance.kind` | `synthetic` (default), `public-domain`, or `licensed-excerpt` (must carry license notes). |
| `input` / `expected` | Deterministic instances. `expected` is omitted for input-only fixtures. |
| `stability.stable_fields` | Fields compared byte-for-byte. |
| `stability.volatile_fields` | Fields normalized before comparison. |

### Dataset variant (`<dataset>/fixture.json`, TEST-01)

| Field | Meaning |
|---|---|
| `fixture_envelope_version` | Envelope version (`1.0`). Variant marker. |
| `fixture_id` | Kebab-case ID equal to the directory name. |
| `kind` | Input schema base name, e.g. `research-config`. |
| `input.schema` / `input.payload` | Canonical schema `$id` from `packages/schemas` and the payload that must satisfy it. |
| `expected_outputs` | Array of golden `{name, schema, payload}` outputs. An explicitly empty array means outputs are pending, not absent. |
| `provenance.origin` + `provenance.synthetic` | `synthetic` / `curated-public` / `user-contributed` plus the no-real-data boolean. |
| `stability.deterministic` / `stability.ignored_fields` | Volatility markers for golden comparisons. |

## Determinism and normalization rules

1. Fixtures contain no wall-clock values and no generated IDs unless the field is declared volatile. Volatile fields are dropped or replaced with a placeholder before any golden comparison; timestamps use fixed RFC 3339 literals.
2. `null` means absent: normalizers drop `null` values before validation (matches the package conventions in `packages/schemas/README.md`).
3. Ordering is part of the data: arrays that reach golden comparison are in their canonical order; unordered comparisons must sort by a documented key first.
4. A fixture whose `contract.schema_version` major does not match an available schema file fails fast; fixtures are never auto-migrated.

## Golden result review rules

- Updating a golden `expected` block requires regenerating it offline from the documented pipeline (mock providers only) and a commit message that states why the expectation changed.
- Narrowing a fixture (removing cases) is a contract-level change and must reference the schema or prompt version that motivated it.
- CI validates every fixture against the envelope and its referenced contract (`scripts/validate-fixture.py --all`); byte-level golden equality checks run inside the consuming test suites, not in CI docs jobs.

## Loader ownership

The envelope specification is unified by ADR-017 under [`packages/schemas/fixture-envelope.v1.json`](../../packages/schemas/fixture-envelope.v1.json). Cross-language loaders (`tests/fixtures-support/loaders/`, TypeScript/Python/Rust) enforce the dataset-variant rules of that schema for the golden fixtures; they must not invent a second envelope or extra implicit fields.

## Golden research datasets (TEST-01, workgroup-e)

The three golden research datasets named in `docs/PRD.md` and `docs/testing/MOCKS.md` exist as `examples/fixtures/{quantum-entanglement,brain-computer-interface,large-language-model}/fixture.json`. They were delivered by TEST-01 against an earlier envelope variant (`fixture_envelope_version`/`kind`/`input.schema`+`input.payload`/`expected_outputs`, previously duplicated at `tests/fixtures-support/schema/fixture-envelope.v1.json`). ADR-017 unified the envelope: the dataset variant is now a recognized variant of the one canonical schema, the duplicate schema file was deleted, and the fixtures themselves are unchanged.

`scripts/validate-fixture.py --all` validates every fixture under `examples/fixtures/` — both the contract-variant corpus (`minimal/`) and the dataset-variant golden fixtures — against the unified envelope and their referenced contracts, including deep payload validation. The reference loaders under `tests/fixtures-support/loaders/` continue to validate the golden fixtures offline with identical rules (run via `tests/fixtures-support/run-fixture-checks.ps1`, wired into `.github/workflows/contracts.yml`).

The golden datasets' `expected_outputs` are still pending — they are explicitly empty arrays (`"expected_outputs": []`), meaning "pending, not absent": the blocking contracts (W2-01 plan/task, W2-06 knowledge schemas) are frozen on main via the workgroup-a merge, so attaching golden outputs is unblocked contract-wise. Outputs must be regenerated offline from the documented pipeline (mock providers only); they are never invented by hand. Migrating the golden datasets onto the contract variant is a possible future consolidation; this merge does not rewrite the golden fixtures.
