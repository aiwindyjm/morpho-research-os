# Fixture Loader Support

Cross-language loaders for the [fixture envelope](../../examples/fixtures/README.md). All three implementations apply identical validation rules and produce the same canonical summary line for the golden fixtures.

```text
fixtures-invalid/                 <- deliberately broken cases every loader must reject
loaders/fixture-envelope.ts       <- TypeScript reference implementation (pure library)
loaders/summarize.ts              <- Node entry point (run from repository root)
loaders/fixture_envelope.py       <- Python reference implementation + CLI
loaders/rust-loader/              <- Rust crate (library + summarize bin)
run-fixture-checks.ps1            <- runs all three suites and compares summaries
```

The envelope JSON Schema is canonical and lives at
[`packages/schemas/fixture-envelope.v1.json`](../../packages/schemas/fixture-envelope.v1.json)
(unified across both envelope variants by ADR-017). The former
`schema/fixture-envelope.v1.json` copy here was removed so the contract has one
authoritative source; these loaders enforce the dataset-variant rules of the
unified schema.

## Rules of engagement

- A validation rule change must land in all three loaders **and** in `fixtures-invalid/` as a failing case in the same change.
- Loaders only do shallow payload validation (`required` + `const` of the referenced canonical schema). Deep JSON Schema validation belongs to the schema toolchain, never to the fixtures.
- Loaders must stay dependency-light: Node/Python use their standard libraries, Rust uses `serde_json` only. All must run offline.
- Loaders read fixtures and `packages/schemas`; they never write anything and never touch the network.

## Commands (from the repository root)

```text
powershell -ExecutionPolicy Bypass -File tests/fixtures-support/run-fixture-checks.ps1
node --test tests/fixtures-support/loaders/fixture-envelope.test.ts
python tests/fixtures-support/loaders/test_fixture_envelope.py
cargo test --manifest-path tests/fixtures-support/loaders/rust-loader/Cargo.toml
```

CI runs these commands in `.github/workflows/contracts.yml`.

## Known limitations

- The canonical summary covers `fixture_id` and input schema only; golden `expected_outputs` comparison arrives with the frozen output schemas (W2-01/W2-06).
- Python writes `\r\n` line endings on Windows, so the runner compares trimmed lines, not raw bytes. JSON payload content must still be byte-identical.
