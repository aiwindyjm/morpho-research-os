# Offline Fixtures and Golden Results

Fixtures under `examples/fixtures/` are the shared, deterministic inputs and golden outputs for offline tests in Rust, Python, and TypeScript. They never contain real provider responses, API keys, personal research content, or private conversations.

## Envelope

Every fixture is a single JSON file named `<case>.fixture.json` inside a dataset directory:

```text
examples/fixtures/
├── README.md                        # this specification
├── minimal/                         # synthetic contract-level fixtures
│   └── research-config-basic.fixture.json
├── quantum-entanglement/            # golden research datasets (added by TEST/E scope)
├── brain-computer-interface/
└── large-language-model/
```

Each file follows the frozen envelope schema [`packages/schemas/fixture-envelope.v1.json`](../../packages/schemas/fixture-envelope.v1.json):

| Field | Meaning |
|---|---|
| `schema_version` | Envelope version (`1.0`). |
| `fixture_id` | Globally unique `<dataset>.<case>` kebab-case ID. |
| `description` | What the fixture exercises, in one sentence. |
| `contract.schema` / `contract.schema_version` | The canonical contract in `packages/schemas/` that `input` (and `expected`, when present) must satisfy. Loaders resolve `<schema>.v<major>.json`. |
| `prompt` | Required when the golden output comes from a prompt pipeline: `prompt_id` + `prompt_version`. The version is part of cache keys and golden case selection. |
| `provenance.kind` | `synthetic` (default), `public-domain`, or `licensed-excerpt` (must carry license notes). |
| `input` / `expected` | Deterministic instances. `expected` is omitted for input-only fixtures. |
| `stability.stable_fields` | Fields compared byte-for-byte. |
| `stability.volatile_fields` | Fields normalized before comparison. |

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

The envelope specification is frozen by W0-05 (scope A). Cross-language loaders (`tests/` support in Rust, Python, TypeScript) are implemented by TEST-01 (scope E) strictly against this specification and the envelope schema; they must not invent a second envelope or extra implicit fields.
