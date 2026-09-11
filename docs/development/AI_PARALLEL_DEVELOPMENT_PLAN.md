# AI Parallel Development Plan

This is the canonical execution plan for building Morpho Research OS with a maintainer and several AI coding agents. It turns the architecture phases into small, independently reviewable tasks that can be assigned in parallel. It does not contain private dates, personal batching, unpublished release order, or conversation content.

## How to use this plan

The maintainer is the Product Owner and final reviewer. An AI agent may take a task only when its dependencies are complete and the governing documents are clear. The agent must read `AGENTS.md`, `DO_NOT_BREAK.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, this plan, and the task's local specification before editing.

Each task produces one reviewable outcome. The agent reports the task ID, changed files, acceptance checks, known limitations, and follow-up tasks. A task is complete only when its tests pass, its documentation is updated, and its diff contains no unrelated work.

Private execution order, batching, timing, and local notes belong under `private/` and are never copied into GitHub Issues, commits, pull requests, releases, prompts, or telemetry.

## Parallel work rules

1. One task owns one directory or an explicitly listed file set. Two agents must not edit the same file concurrently.
2. Contracts are upstream of implementations. If a task needs a schema, IPC field, worker message, provider interface, migration, or token change, stop and propose the contract first.
3. Every task uses a separate branch or worktree and one focused pull request. The maintainer merges completed tasks in dependency order.
4. Parallel tasks may read completed contracts but may not invent competing versions.
5. Integration tasks are serial. They resolve conflicts, run the full quality gate, and update the canonical documentation.
6. No task adds a framework, state library, database, queue, agent framework, or provider without an ADR.
7. Tests use mocks and fixtures. Real providers, API keys, private conversations, and personal research data never enter CI or public artifacts.

## Task packet for other AI agents

Copy this structure into an Issue or private handoff. Keep the acceptance criteria concrete.

```text
Task ID:
Outcome:
Scope:
Allowed files/directories:
Read first:
Dependencies:
Non-goals:
Acceptance checks:
Documentation to update:
Handoff notes:
```

The agent must not broaden scope when a dependency is missing. It should return a blocking question or a contract proposal instead.

## Dependency graph

```text
W0 Contract and repository baseline
 ├── W1-A Frontend foundation
 ├── W1-B Rust Core foundation
 ├── W1-C Python worker foundation
 └── W1-D Test, mock, and fixture foundation
          ↓
W2 Cross-boundary contracts and adapters
          ↓
W3 Research vertical slices
 ├── Planner
 ├── Task DAG
 ├── Search and source evaluation
 ├── Knowledge normalization
 ├── Vault writer
 └── Graph projection
          ↓
W4 Integrated local workflow and release hardening
```

The four W1 lanes can run in parallel after W0. W3 work can overlap where the listed contract is already frozen: planner and DAG can proceed together; search and extraction can proceed after worker/provider contracts; Vault and graph can proceed after normalized knowledge fixtures exist. W4 remains serial because it validates the complete user journey.

## Work packages and small tasks

### W0: Contract and repository baseline

| ID | Outcome | Dependencies | Acceptance |
|---|---|---|---|
| `W0-01` | Confirm repository ownership map and module boundaries | None | Repository and boundary docs agree; no production feature code added |
| `W0-02` | Establish canonical schema package layout | `W0-01` | `packages/schemas/` has versioned JSON Schema conventions and validation instructions |
| `W0-03` | Establish version and compatibility metadata | `W0-01` | Root `VERSION`, schema version, worker protocol version, and Vault schema policy are documented |
| `W0-04` | Establish quality gates and offline test harness | `W0-01` | CI runs configured formatting, lint/type checks, contract checks, and mock-only tests |
| `W0-05` | Establish fixture naming and golden-result conventions | `W0-02`, `W0-04` | Fixture format is documented and one minimal offline fixture validates |

### W1-A: Frontend foundation

| ID | Outcome | Dependencies | Acceptance |
|---|---|---|---|
| `UI-01` | Create React/Vite/Tailwind shell | `W0-01`, `W0-04` | App starts locally with a typed entry point and no business workflow |
| `UI-02` | Implement design tokens and registry primitives | `UI-01` | Registered primitives render in component tests; no page-local token literals |
| `UI-03` | Implement application layout and navigation shell | `UI-02` | Core routes have specified loading, empty, error, responsive, and keyboard states |
| `UI-04` | Add typed IPC/query service boundary | `UI-01`, `W0-02` | UI calls typed services only; architecture check prevents direct backend imports |
| `UI-05` | Add compact contextual AI Assistant shell | `UI-02`, `UI-03` | Assistant is project-scoped, has explicit save action, and contains no provider/persistence logic |

### W1-B: Rust Core foundation

| ID | Outcome | Dependencies | Acceptance |
|---|---|---|---|
| `RUST-01` | Create Tauri command and structured error skeleton | `W0-02`, `W0-03` | Typed command result and stable error codes compile with unit tests |
| `RUST-02` | Add SQLite connection and numbered migration runner | `RUST-01`, `W0-03` | Fresh database and upgrade path pass migration integration tests |
| `RUST-03` | Add repository transaction boundary | `RUST-02`, `W0-02` | Tests prove transaction, foreign-key, and idempotency behavior |
| `RUST-04` | Add OS keychain/configuration boundary | `RUST-01` | Secrets use key references; fake-keychain tests show no secret logging |
| `RUST-05` | Add worker supervisor lifecycle skeleton | `RUST-01`, `W2-02` | Start, health, bounded restart, cancellation, and shutdown use a fake worker |

### W1-C: Python worker foundation

| ID | Outcome | Dependencies | Acceptance |
|---|---|---|---|
| `PY-01` | Create Python package and configuration boundary | `W0-02`, `W0-03` | `pytest` imports package; configuration contains no raw secrets |
| `PY-02` | Implement versioned health/version endpoints | `PY-01`, `W2-02` | `/health` and `/version` return compatible responses |
| `PY-03` | Implement JSONL/SSE event primitives | `PY-02`, `W2-02` | Events are ordered, append-only, reconnectable, and redacted |
| `PY-04` | Add orchestrator and worker interface skeletons | `PY-01`, `W0-02` | Planner/search/extraction/validation/writer interfaces have mocks |
| `PY-05` | Add provider interfaces and mock adapters | `PY-04`, `W2-03` | Mock LLM/search/embedding providers cover timeout, retry, and usage records |

### W1-D: Test, mock, and fixture foundation

| ID | Outcome | Dependencies | Acceptance |
|---|---|---|---|
| `TEST-01` | Define cross-language fixture envelope | `W0-02`, `W0-05` | Rust, Python, and TypeScript load the same fixture IDs and schema versions |
| `TEST-02` | Add mock provider scenarios | `W0-04` | Success, invalid JSON, timeout, auth failure, and retry exhaustion are deterministic |
| `TEST-03` | Add contract and architecture checks | `W0-02`, `W0-04` | CI detects schema drift, private-file tracking, and forbidden frontend imports |
| `TEST-04` | Add Playwright mock application harness | `UI-01`, `TEST-02` | E2E starts without network providers or API keys |

### W2: Cross-boundary contracts and adapters

| ID | Outcome | Dependencies | Acceptance |
|---|---|---|---|
| `W2-01` | Freeze project/configuration/plan/task schemas | `W0-02`, `TEST-01` | JSON Schema, Zod, Pydantic, and Serde agree on fixtures |
| `W2-02` | Freeze worker protocol and event envelope | `W0-03`, `PY-02`, `PY-03`, `RUST-05` | Health, job, event, cancellation, compatibility, and error examples validate |
| `W2-03` | Freeze provider interfaces and usage record | `W0-02`, `PY-05` | Domain types cover base URL, key reference, model, timeout, retry, tokens, and cost |
| `W2-04` | Freeze prompt metadata and structured-output contract | `W0-02`, `PY-04` | Prompt version, input/output schemas, and golden-case format are documented |
| `W2-05` | Connect typed Tauri IPC to query/mutation services | `UI-04`, `RUST-01`, `W2-01`, `W2-02` | UI calls mocked project/job commands without direct backend access |

### W3: Research vertical slices

| ID | Outcome | Dependencies | Parallel notes | Acceptance |
|---|---|---|---|---|
| `RES-01` | Planner creates a reviewable plan | `W2-01`, `W2-04`, `PY-04` | Parallel with `RES-02` | Mock fixture produces a valid plan; UI supports approve/revise |
| `RES-02` | Durable task DAG with pause/retry/resume | `W2-01`, `W2-02`, `RUST-02` | Parallel with `RES-01` | State transitions, dependencies, idempotency, and crash recovery pass |
| `RES-03` | Search adapter and source deduplication | `W2-03`, `W2-02`, `TEST-02` | Parallel with `RES-04` | Mock search returns normalized sources, cache hits, and stable dedup keys |
| `RES-04` | Source evaluation and content extraction | `RES-03`, `W2-04` | Parallel with `RES-05` | Invalid content is recoverable; quality metadata is preserved |
| `RES-05` | Knowledge/entity/relation normalization | `W2-01`, `W2-04`, `TEST-01` | Parallel with `RES-04` after fixtures | Nodes/relations are typed, deduplicated, and provenance-aware |
| `RES-06` | Claims and evidence persistence | `RES-05`, `W2-01` | After knowledge contract | Support/contradict direction and confidence validate |
| `RES-07` | Markdown/Obsidian Vault writer | `RES-05`, `RES-06`, `RUST-03` | Parallel with `RES-08` | Frontmatter, links, atomic writes, and merge protection pass |
| `RES-08` | Graph projection and basic D3 view | `RES-05`, `UI-03`, `UI-04` | Parallel with `RES-07` | 100-node fixture renders; selection/filter/inspector states pass |
| `RES-09` | Integrated first research journey | `RES-01` through `RES-08` | Serial integration | Create project → approve plan → run mocks → inspect knowledge → export Vault → open graph |

### W4: Hardening and public slice release

| ID | Outcome | Dependencies | Acceptance |
|---|---|---|---|
| `REL-01` | Offline end-to-end quality gate | `RES-09`, `TEST-04` | Format, lint, typecheck, unit, contract, migration, and Playwright checks pass |
| `REL-02` | Documentation and example update | `REL-01` | README, architecture links, Quick Start, fixture README, and changelog describe actual behavior |
| `REL-03` | Privacy and public-boundary audit | `REL-01`, `REL-02` | No private files, secrets, local databases, caches, or journals are staged |
| `REL-04` | Human release review | `REL-03` | Maintainer confirms scope, known issues, demo, version, and release notes |

## Merge order

1. Merge W0 contract and quality tasks.
2. Merge the four W1 lanes independently after their lane tests pass.
3. Merge W2 contracts before adapters that consume them.
4. Merge W3 slices in dependency order; use the integration task to resolve cross-lane conflicts.
5. Run W4 as one serial release candidate review.

If two branches touch the same contract or migration, pause, compare the governing specification, and create or update an ADR. Do not resolve a contract conflict by choosing the newer code.

## AI handoff protocol

The task author supplies the task packet and exact acceptance checks. The implementing AI returns:

```text
Completed task: <ID>
Outcome: <one sentence>
Files changed: <paths>
Checks run: <commands and result>
Contract/doc updates: <paths or none>
Known limitations: <none or list>
Suggested next task: <ID or none>
```

Human review is mandatory for schemas, migrations, IPC, worker protocol, provider adapters, secrets, persistence semantics, navigation, global UI tokens, and releases. A bounded documentation, fixture, test, or reversible implementation slice may be prepared by AI for review, but it follows the same acceptance and privacy checks.

## Definition of done

- Governing documents and dependencies were read.
- Scope stayed within the task packet.
- Tests or explicit manual checks prove acceptance criteria.
- Errors, retries, idempotency, and privacy were considered where relevant.
- Documentation and registry entries match the implementation.
- `git diff --check` and the private-boundary check pass.
- Commit/PR message describes the real outcome and links the task.

## Deferred

Hosted collaboration, accounts, payments, enterprise IAM, cloud databases, Kubernetes, Redis/Kafka, vector databases, self-hosted search, custom model training, complex multi-agent autonomy, mobile, browser extensions, 3D graphs, and automatic academic paper authorship remain deferred until an approved architecture decision changes scope.
