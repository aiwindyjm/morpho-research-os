# Morpho Research OS: Product and Technical Specification

**Canonical specification.** This is the single source of truth for Morpho's product intent and technical direction. Supporting documents explain implementation rules or detailed contracts; they must not redefine product scope or create competing versions.

## 1. Product definition

Morpho Research OS is an open-source, local-first, AI-driven research workspace that turns a research question into a source-grounded, linked, and continuously evolving personal knowledge base.

> Turn a research question into a living knowledge base.

Morpho is infrastructure for persistent research knowledge, not only a chat interface. A chat response ends with an answer; Morpho preserves the research plan, tasks, sources, evidence, claims, relationships, and user-owned Markdown assets.

## 2. Product principles

1. Research is a process, not a prompt.
2. Knowledge is structured, not only generated.
3. Important claims must be traceable to evidence.
4. The knowledge belongs to the user.
5. A research project keeps growing after the first run.
6. Local-first is the default; external providers are explicit user choices.
7. AI proposes and transforms structured data; it never becomes the only source of truth.
8. The first release favors a reliable, explainable workflow over autonomous agent complexity.

## 3. Users and jobs

Knowledge workers, developers, product managers, teachers, students, independent researchers, writers, consultants, and analysts use Morpho to build a structured understanding of an unfamiliar field, prepare research-based work, track topics over time, and keep evidence in a standard Markdown/Obsidian Vault.

## 4. Core workflow

```text
Research Configuration → Research Plan → Review → Task DAG
→ Search and source evaluation → Content extraction
→ Entity, relation, claim, and evidence extraction
→ Validation and conflict detection → Normalization
→ Markdown/Obsidian Vault → Graph, timeline, coverage, and gaps
→ Incremental research run
```

The first complete journey is: create a project, configure it, approve a plan, run tasks, inspect sources and claims, export a Vault, and open the graph.

## 5. Research configuration

Each project is defined by structured configuration, not an unbounded prompt:

```yaml
research:
  domain: ""
  topic: ""
  purpose: "learning | teaching | writing | research | industry | product | strategy | custom"
  audience: ""
  depth: 1
  dimensions: []
  time_range: { from: null, to: null }
  geographic_scope: ""
  languages: []
  source_types: []
  source_domains: []
  update_frequency: "manual"
```

Depth has five levels: orientation; system understanding; structured research; professional research; and frontier mapping. It is a planning input, not a promise of academic completeness. Default dimensions cover concepts, history, theory, technology, experiments, papers, people, organizations, companies, products, applications, industry, policy, market, investment, controversy, risk, recent developments, and future trends. Users may add dimensions.

## 6. Domain model

Core objects are Project, ResearchConfig, ResearchPlan, ResearchSection, ResearchTask, ResearchRun, TaskDependency, Source, SourceContent, KnowledgeNode, Claim, Evidence, Relation, Artifact, Event, and LLMUsage.

The critical distinction is:

```text
Source → Evidence → Claim → Knowledge
Knowledge → Relation → Knowledge
```

Claims and evidence are never silently folded into entity descriptions. Conflicting claims coexist with their evidence and review state.

Knowledge nodes have structured fields `id`, `type`, `title`, `aliases`, `summary`, `status`, `confidence`, `source_ids`, `claim_ids`, `created_at`, and `updated_at`. Supported types include Concept, Person, Organization, Company, Paper, Book, Experiment, Event, Technology, Product, Application, Policy, Dataset, and Controversy. Claims carry subject, predicate, object/value, scope, status, confidence, and provenance. Evidence carries source, quote or value, precise locator, retrieval time, and support/contradict direction.

Confidence states are `confirmed`, `high`, `medium`, `low`, `unverified`, and `conflicting`. Source quality describes authority and fitness for purpose; it does not declare that a low-rated source is false.

## 7. Task engine

V0.1 uses one durable Orchestrator with Search, Source Evaluation, Extraction, Entity, Relation, Validation, and Writer workers. The state machine is:

```text
PENDING → PLANNING → RUNNING → VALIDATING → COMPLETED
                         ├→ NEEDS_REVIEW
                         ├→ PAUSED → RUNNING
                         ├→ FAILED → RUNNING (retry)
                         └→ CANCELLED
```

Only the Orchestrator transitions tasks. SQLite is authoritative and events are projections. A task has a durable ID, dependencies, idempotency key, checkpoint, retry count, cache references, result reference, and error reference. Dependent tasks wait for predecessors to complete or be explicitly skipped. Crashed work resumes from its last checkpoint. Search and extraction fan out; validation and synthesis fan in.

## 8. Desktop and process architecture

```text
React + TypeScript + Vite
        ↓ typed Tauri commands/events
Tauri 2 Rust Core
        ├── SQLite repositories
        ├── filesystem and Vault service
        ├── OS keychain and configuration
        └── Python worker supervisor
                ↓ versioned local protocol
        Python research worker
```

React handles presentation, navigation, local view state, async query state, and visualization. Rust owns IPC, persistence, migrations, filesystem, atomic Vault writes, keychain, configuration, worker lifecycle, cancellation, and event forwarding. Python owns research planning/execution, provider/search adapters, extraction, validation, and normalization. Frontend cannot access SQLite, files, secrets, or processes; the worker cannot mutate UI state or bypass Rust persistence.

Worker endpoints are `GET /health`, `GET /version`, `POST /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, and `GET /jobs/{id}/events` using SSE. Commands are request/response; events are ordered, append-only, reconnectable, and redacted. Rust supplies an ephemeral session token, checks protocol compatibility, restarts with bounded backoff, and reports `WORKER_NOT_AVAILABLE` after exhaustion.

## 9. Technology stack

| Layer | Decision |
|---|---|
| Desktop | Tauri 2 |
| Frontend | React, TypeScript, Vite |
| UI | Tailwind CSS, shadcn/ui, Morpho token/component layer |
| Local UI state | Zustand |
| Async state | TanStack Query |
| Validation | Zod plus canonical JSON Schema |
| Core | Rust |
| Runtime state | SQLite with numbered migrations |
| Worker | Python |
| Visualization | D3.js 2D |
| Providers | OpenAI-compatible LLM, search, and embedding interfaces |

No new framework, state library, database, queue, or agent framework enters V0.1 without an ADR explaining the problem, alternatives, added complexity, and solo-maintainer cost.

## 10. Persistence and Vault

```text
SQLite  = runtime state, indexes, task state, relationships
Markdown = durable user knowledge and Obsidian-compatible Vault
Cache   = replaceable search, source, LLM, and embedding data
Logs    = operational records
```

Vault folders include Concepts, People, Organizations, Companies, Technologies, Papers, Books, Experiments, Events, Applications, Policies, Claims, Controversies, Sources, and Maps. Notes use YAML frontmatter with `schema_version`, `node_id`, `type`, `title`, `aliases`, `tags`, `confidence`, `status`, `source_ids`, `claim_ids`, `created_at`, and `updated_at`, plus standard `[[wikilinks]]`.

Writes use temporary files and atomic rename. Before an AI update, Morpho detects user changes and creates a merge proposal or conflict record; it never silently overwrites user-modified Markdown.

## 11. Providers, prompts, secrets, and cache

`LLMProvider`, `SearchProvider`, and `EmbeddingProvider` are interfaces. Adapters support GLM, OpenAI, Claude, Gemini, DeepSeek, and Ollama without leaking provider types into the domain. Configuration includes base URL, key reference, model, timeout, retry policy, and usage accounting. V0.1 can use one provider; future routing can reserve strong models for planning/validation and cheaper models for extraction/classification.

Prompts live under `packages/prompts/`, are versioned, declare input/output schemas, and have golden cases. Accepted path: `LLM → parse → schema validation → normalization → persistence`. Keys live in the OS keychain and never enter Git, SQLite application tables, logs, prompts, or events. Cache keys include normalized input, schema/prompt version, provider/model, and source fingerprint. LLMUsage records input/output tokens, provider, model, duration, and estimated cost.

## 12. Frontend system

The feature-first structure keeps product behavior, tests, services, and page specifications together:

```text
app/ components/ features/ hooks/ stores/ services/ types/ utils/
```

Supported page patterns are Dashboard, List, Detail, Form, Workspace, Split View, and Inspector. The main Workspace is a 240px sidebar, flexible canvas, and 320px inspector; the inspector collapses below 1024px and the sidebar becomes an accessible drawer below 768px.

Primitive components are Button, Input, Textarea, Select, Checkbox, Dialog, Popover, Tooltip, Tabs, Badge, Card, Table, Progress, Toast, Skeleton, and Alert. Business components are ResearchDepthSelector, ResearchDimensionPicker, ResearchStatusBadge, TaskProgress, SourceCard, KnowledgeCard, ClaimCard, EvidenceList, ResearchPlanTree, GraphNodeInspector, and CoveragePanel. AI must read design tokens, registry, patterns, and page spec before UI work and may not duplicate components or introduce arbitrary styles.

## 13. Views and graph

Core views are Projects, Research Configuration, Plan, Tasks, Sources, Knowledge, Graph, Timeline, Gaps, Reports, and Settings. Every view defines loading, empty, error, responsive, keyboard, and accessibility states.

D3 renders a 2D graph with node/relation/confidence/time/dimension filters, search, selection, clustering, and an inspector. Around 100 nodes it is interactive; around 500 it uses filtering and incremental updates; around 5,000 it uses aggregation, virtualization, and a list fallback. 3D is deferred.

## 14. Coverage, gaps, and incremental research

V0.1 coverage is an explainable indicator:

```text
coverage = 0.4 task completion
          + 0.3 knowledge breadth
          + 0.2 evidence density
          + 0.1 source diversity
```

Quality additionally considers source quality, freshness, confidence, and cross-validation. A gap is a dimension below 0.6 coverage or with fewer than two independent quality sources. The UI explains the reason and offers a proposed task requiring user acceptance.

Each ResearchRun snapshots configuration and plan. Later runs fingerprint sources and normalized claims to detect new, changed, and conflicting material. Existing Vault indexing is a future adapter parsing frontmatter and wikilinks into the same model.

## 15. Errors, privacy, and observability

Errors use a stable code, safe user message, developer detail, retryable flag, and correlation ID. Initial codes include `WORKER_NOT_AVAILABLE`, `PROVIDER_AUTH_FAILED`, `PROVIDER_TIMEOUT`, `SEARCH_FAILED`, `SOURCE_PARSE_FAILED`, `LLM_INVALID_JSON`, `TASK_DEPENDENCY_FAILED`, `VAULT_WRITE_FAILED`, and `DATABASE_ERROR`.

User-facing activity summarizes meaningful work, while Developer Mode may expose provider, model, prompt version, retries, timing, and redacted raw responses. External provider transmission is an explicit configuration choice; the default knowledge location is local.

## 16. Testing

Rust uses unit, repository, IPC, worker-supervisor, and migration tests. Frontend uses Vitest, component, accessibility, and graph fallback tests. Python uses pytest. Playwright E2E runs against mock workers and providers. Golden fixtures cover quantum entanglement, brain-computer interface, and large language model. Required scenarios include task/DAG recovery, deduplication, claim/evidence validation, Vault merge protection, retries, cache reuse, and worker crash recovery. Automated tests never call real providers or require API keys.

## 17. Scope and roadmap

The first complete workflow includes project/configuration, plan review, resumable DAG, web/source discovery, source indexing, normalized knowledge, Markdown/Obsidian export, and a basic 2D graph. Later groups add document/PDF and richer paper/GitHub sources, claims/evidence validation, conflicts, timeline, existing Vault indexing, incremental change detection, gap-driven research, scheduling, and model routing.

Explicitly deferred are hosted collaboration, accounts, payments, enterprise IAM, cloud database, Kubernetes, Redis/Kafka, vector database, self-hosted search, custom model training, complex multi-agent autonomy, mobile, browser extension, 3D graph, and automatic academic paper authorship.

## 18. Delivery phases

0. Architecture initialization: repository, schemas, rules, tokens, CI, mocks.
1. Repository skeleton and code generation.
2. Frontend shell and component registry.
3. Tauri Core, migrations, keychain, worker supervisor.
4. Worker health, protocol, and mocks.
5. Data schemas and repositories.
6. Planner and plan review.
7. Task DAG and recovery.
8. Search and source evaluation.
9. Knowledge normalization.
10. Vault writer and Obsidian export.
11. Graph, timeline, coverage, and gap views.

Every phase ships tests and documentation and must preserve the contracts and invariants.

## 19. Governance

```text
Product requirement → Architecture decision → Feature specification
→ Page specification → Data contract → Implementation → Tests → Documentation
```

AI may implement approved specifications, fix bugs, refactor within boundaries, add tests, and update docs. Human approval is required for product direction, architecture, schemas, navigation, global tokens, persistence, worker protocol, providers, security, and releases. Non-negotiable invariants are in `DO_NOT_BREAK.md` and `docs/ARCHITECTURE_INVARIANTS.md`.
