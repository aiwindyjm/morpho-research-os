# Version and Compatibility Policy

Every version in Morpho Research OS has exactly one authoritative source. Nothing may invent a parallel version stream. This file is the normative policy referenced by `docs/development/RELEASE_STRATEGY.md` and `docs/development/RELEASE.md`.

## Version sources

| Version | Authoritative source | Format | Reported/read by |
|---|---|---|---|
| App version | Root `VERSION` file (`version: <semver>`) | SemVer `MAJOR.MINOR.PATCH` | Release notes, README status, release automation; stamped into `package.json`, `Cargo.toml`, and worker `pyproject.toml` during release preparation (REL tasks). No runtime code mutates it. |
| Schema versions | `schema_version` const inside each `packages/schemas/<name>.v<major>.json` | `"<major>.<minor>"` | All Zod/Pydantic/Serde bindings, fixtures, Vault frontmatter where applicable. |
| Prompt version | `version` field of each prompt's metadata in `packages/prompts/` | SemVer | Cache keys, golden case selection, regression suites (`docs/ai/PROMPT_ARCHITECTURE.md`). |
| Worker version | Version of the `apps/research-worker` package (stamped from `VERSION` at release prep) | SemVer | `GET /version` responses; diagnostics. |
| Worker protocol version | `protocol_version` const frozen with the worker protocol schemas in `packages/schemas/` (`worker-*.v<major>.json`) | `"<major>.<minor>"` | `GET /health` and `GET /version`; Rust supervisor compatibility check at startup. |
| Vault schema version | `schema_version` in note frontmatter, frozen by the vault note contract | `"<major>.<minor>"` | Vault writer (newest major) and readers (same major). |

Rules that keep the sources single:

- Package manifests (`package.json`, `Cargo.toml`, `pyproject.toml`) carry the app version only as a stamped copy; a mismatch with `VERSION` is a release-blocking defect, not an override.
- The worker protocol version always equals the major.minor of the frozen worker protocol schemas; implementations must not declare an independent number.
- Prompt metadata versions are per-prompt; there is no global prompt version.

## Compatibility, rejection, and migration

| Interaction | Compatible when | Otherwise |
|---|---|---|
| Rust Core ↔ Worker | `protocol_version` major matches the major the Rust build was compiled against. | Supervisor refuses to hand over jobs and reports `WORKER_NOT_AVAILABLE` with a developer detail naming both versions; bounded restarts do not clear an incompatibility. |
| Binding ↔ canonical schema | Same major; unknown additive fields from a newer minor are ignored by open records. | A newer-major payload fails validation with `LLM_INVALID_JSON`-style structured errors at the Parse/Validate boundary; it is never partially persisted. |
| Vault reader ↔ note | Same `schema_version` major. | Reader surfaces a `VAULT_SCHEMA_MISMATCH` (developer detail only; user message stays safe) and defers to the writer for an upgrade proposal; user content is never rewritten to force compatibility. |
| Fixture ↔ schema | Envelope `schema_version` major matches the schema file referenced. | Loader fails fast with a mismatch error before tests run; fixtures are never auto-migrated. |

Migration conditions:

- **Schemas**: additive changes bump the minor inside the same file; breaking changes add a new major file plus an ADR (see `packages/schemas/README.md`). Readers may support N and N−1 majors; writers target only N.
- **SQLite**: forward-only numbered migrations per `packages/schemas/MIGRATIONS.md`; runtime state may be rebuilt from contracts, user Markdown may not.
- **Prompts**: a changed prompt must bump its metadata version; caches keyed on the old version are invalid by construction (see `docs/ai/CACHE_AND_COST.md`).
- **App**: `0.0.x` experimental, `0.1.0` first complete local workflow, per `docs/development/RELEASE_STRATEGY.md`.

## Notable schema version notes

Compatibility-relevant facts about specific contracts; the authoritative per-contract index stays in `packages/schemas/README.md`.

| Contract | Current minor | Note |
|---|---|---|
| `claim.v1.json` | 1.1 | Minor 1.1 (ADR-016) splits the formerly conflated status field into `status` (review lifecycle) + `confidence` (evidence strength); writers target 1.1, readers accept 1.0 and 1.1. |
| `event.v1.json` | 1.0 | ADR-015 Amendment 1 (2026-09-12) ratified the `run.incremental_report` type into the 1.0 vocabulary in the same change that updated all consumers and the corpus (`packages/schemas/README.md` rule 4); no new writer-targeted minor was released. |

## Release-time synchronization

Release preparation (owned by REL tasks, executed by the maintainer) reads `VERSION`, stamps every manifest, records app + schema majors in use + worker + protocol + prompt versions in the release notes, and tags `vMAJOR.MINOR.PATCH`. Automated stamping must never run as a side effect of a normal build or test.
