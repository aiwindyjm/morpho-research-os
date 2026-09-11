# Desktop Rust Core

Tauri 2 shell and the local core of Morpho Research OS. The frontend reaches
this crate only through typed Tauri commands; everything local — SQLite,
files, keychain references, worker lifecycle, the Markdown vault — is owned
here and never exposed directly (see `docs/architecture/MODULE_BOUNDARIES.md`).

## Module map

| Path | Responsibility |
|---|---|
| `src/error.rs` | Unified error model: stable codes (`docs/api/ERRORS.md`), safe user message, redacted developer detail, `retryable`, UUIDv7 correlation id |
| `src/ipc.rs` | `{schema_version, request_id, data, error}` envelope and the `research.event.v1` event envelope with payload redaction |
| `src/commands.rs` | Thin `#[tauri::command]` adapters (`core_info`, `ping`); no business logic |
| `src/versions.rs` | Version constants (IPC schema, event envelope, draft worker protocol) — single place to reconcile with workgroup A's frozen contracts |
| `src/redaction.rs` | Secret redaction helpers for details, logs, and event payloads |
| `src/db.rs` + `migrations/` | SQLite connection defaults (WAL, foreign keys, busy timeout) and the numbered, transaction-per-migration runner |
| `src/repositories/` | Parameterized SQL behind repository structs; `with_write_tx` is the only write-transaction entry point; services compose repositories |
| `src/secrets.rs` | `SecretRef` + `SecretStore` port, `FakeKeychain`, provider/app config that can hold references only |
| `src/worker/` | Worker supervisor (health/version gate, bounded backoff restarts, cancellation, event forwarding with dedup) over the `WorkerTransport` port; `fake.rs` is the deterministic test double |
| `src/vault.rs` | Obsidian-compatible note rendering, atomic writes, and user-modification protection returning merge proposals |
| `tests/` | File-level migration and vault+SQLite integration tests |

## Build and test

```bash
cd apps/desktop/src-tauri
cargo fmt --check
cargo check --all-targets
cargo test
```

Tests run fully offline: they use an in-memory or temp-directory SQLite
database, a fake keychain, a fake worker, and synthetic fixtures. No network,
provider, or API key is involved.

The app entry (`cargo tauri dev` / `build`) still points `frontendDist` at a
dev-server URL; wiring the real frontend bundle happens with workgroup B's
UI-01 output and the W2-05 IPC integration.

## Draft-contract status (pending workgroup A freezes)

This skeleton implements the drafts currently in `docs/`; nothing here is a
second contract:

- IPC envelope and `research.event.v1` field names follow `docs/API.md` and
  are reconciled when W2-05 freezes the typed IPC contract.
- Worker endpoints, version info, and event shapes follow `docs/API.md` and
  the constants in `src/versions.rs`; they are finalized by W2-02, after
  which a real HTTP transport replaces the trait-based fakes.
- `001_initial.sql` implements the table list fixed in
  `packages/schemas/MIGRATIONS.md`; column details derive from
  `docs/DATA_MODEL.md` and `docs/PRD.md`. Schema changes are new numbered
  files only.
- Keychain failures currently map onto `PROVIDER_AUTH_FAILED` because the
  error catalog has no keychain-specific code; see the group C handoff for
  the contract proposal.

## Invariants kept

- No secret value crosses any boundary: only `SecretRef` references are
  stored, logged, exported, or sent to the UI.
- All SQL is static with bound parameters; no string-composed SQL.
- Writes happen inside explicit transactions; failures roll back completely.
- The vault only replaces files whose bytes still match the last
  core-generated content; user-modified files produce merge proposals and are
  never silently overwritten.
- `gen/schemas/` (generated ACL schemas) is ignored; database files are
  covered by the root `.gitignore` (`*.sqlite3`, `*.db`).
