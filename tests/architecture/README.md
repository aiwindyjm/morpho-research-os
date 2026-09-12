# Architecture Checks

`scripts/check-architecture.ps1` enforces the resource-boundary rules from `AGENTS.md`, `docs/ARCHITECTURE_INVARIANTS.md`, and `docs/architecture/MODULE_BOUNDARIES.md`:

| Rule | Detects |
|---|---|
| `frontend-sqlite` | SQLite drivers (`@tauri-apps/plugin-sql`, `better-sqlite3`, `sql.js`) imported in `apps/desktop/src` |
| `frontend-filesystem` | Filesystem access (`@tauri-apps/api/fs`, `plugin-fs`, `node:fs`, bare `fs`) in frontend code |
| `frontend-process` | Process spawning (`child_process`, process APIs) in frontend code |
| `frontend-shell` | Shell/open access (`@tauri-apps/plugin-shell`, shell APIs) in frontend code |
| `frontend-secret` | Credential material read from `import.meta.env` in frontend code |
| `real-provider-endpoint` | Real provider hostnames inside `tests/` or `examples/` (tests must stay offline; documented hosts in `docs/` are fine) |
| `secret-*` | Hardcoded secret literals in tracked files (OpenAI-style keys, GitHub tokens, AWS keys, Slack tokens, PEM blocks) |

## Conditional by design

Checks activate only when the corresponding directories exist (`apps/desktop/src`). This keeps the check honest on a docs-only repository: it never fails vacuously and never false-passes on absent code. As workgroups B–D land frontend and worker code, the same script starts enforcing their boundaries without modification. Worker-side and Rust-side static rules are added by the integration task once those codebases exist.

## Detector self-test

`-SelfTest` runs the detectors against `tests/architecture/cases/`. Case file names encode the expectation:

```text
<rule-code>--detect.<ext>   <- must trigger exactly this rule
<rule-code>--clean.<ext>    <- must trigger nothing (approved pattern sample)
```

Case files are inert test data with clearly fake secrets; repository-wide scans exclude the `cases` directory so the sample patterns cannot mask real findings.

## Commands

```text
powershell -ExecutionPolicy Bypass -File scripts/check-architecture.ps1            # repository scan
powershell -ExecutionPolicy Bypass -File scripts/check-architecture.ps1 -SelfTest  # detector self-test
```

Both run in CI via `.github/workflows/contracts.yml`, together with `check-contracts.ps1` (schema/fixture drift) and `check-public-boundary.ps1` (private file tracking).

## Adding a rule

1. Add the rule to the rule table in the script.
2. Add one `--detect` case and, when an approved pattern exists, a `--clean` case.
3. Run `-SelfTest` and the repository scan; both must pass.
