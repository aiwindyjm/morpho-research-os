# Component Registry
Every component records purpose, props, states, accessibility contract, owner, and examples. Existing business components must be reused; additions require rationale and a documentation entry. Registry is the review checklist for AI-generated UI.

## Implementation index (V0.1 first build)

Primitives live in `packages/ui/src/primitives/` and consume design tokens only (`Button.tsx`, `inputs.tsx` — Input/Textarea/Select/Checkbox/Field/Label, `overlays.tsx` — Dialog/Popover/Tooltip/Toast, `display.tsx` — Badge/Card/Table/Progress/Skeleton/Alert/Tabs). Each primitive ships keyboard, focus, disabled, and loading states with component tests.

Registered business components (`apps/desktop/src/`):

| Component | Location | Purpose | States |
|---|---|---|---|
| PageShell | `components/PageShell.tsx` | Prototype page heading: kicker + display title + lede + actions, optional toolbar, fade-in content | static |
| PageStates (PageLoading/PageEmpty/PageError) | `components/PageStates.tsx` | Mandatory loading/empty/error rendering | loading, empty, error, content |
| ResearchStatusBadge | `components/cards.tsx` | Task/plan/confidence status badge | per documented vocabulary |
| TaskProgress | `components/cards.tsx` | Completed/total progress with Progress primitive | determinate/empty |
| SourceCard | `components/cards.tsx` | Source with URL, type, quality metadata | evaluated / pending quality |
| KnowledgeCard | `components/cards.tsx` | Node summary with type, confidence, counts | default |
| ClaimCard | `components/cards.tsx` | Claim statement with subject and scope | per confidence state |
| EvidenceList | `components/cards.tsx` | Evidence quotes with locator and direction | support/contradict, empty |
| TaskRow | `components/cards.tsx` | Task row with state-driven user actions | per TaskState |
| ResearchDepthSelector / ResearchDimensionPicker / PurposeSelect | `components/research.tsx` | Structured config controls (PRD §5) | disabled, checked |
| ResearchPlanTree | `components/research.tsx` | Plan sections with editable task drafts | draft (editable) / locked |
| GraphCanvas | `features/graph/GraphPage.tsx` | SVG 2D force graph with node selection | nodes/relations filtered, keyboard focus |
| GraphNodeInspector | `features/graph/GraphPage.tsx` | Selected node details and relations | open/closed |
| AssistantPanel | `features/assistant/AssistantPanel.tsx` | Project-bound assistant: explain progress, suggest next task, list pending reviews, record decision (explicit save) | loading, responding, error, saved |
| ProjectSwitcher | `app/layout/ProjectSwitcher.tsx` | Prototype project menu: status dots + progress, manage-all entry, create | loading, empty, error |
| Topbar | `app/layout/Topbar.tsx` | Prototype topbar: breadcrumb Morpho / {project}, saved state, help, local avatar (ADR-013) | static |
| AssistantDock | `app/layout/WorkspaceLayout.tsx` | Floating assistant: gradient launcher (bottom-right) + 360×530 popup wrapping AssistantPanel; Escape closes, focus moves into panel and back to launcher (ADR-013) | open/closed |
| OverviewPage | `features/overview/OverviewPage.tsx` | Dashboard absorbing timeline/gaps: 4 metric cards (testid `metric-*`), research path (`overview-path`), activity (`overview-activity`), dimension-coverage disclosure with reasons + `COVERAGE_WEIGHTS` (`overview-dimensions`), next-step gap panel with approve/dismiss (`overview-next`); replaces CoveragePanel/GapCard | loading, empty, error, content |
| SettingsPage | `features/settings/SettingsPage.tsx` | Local workspace settings: three status cards — 知识库位置 (disabled, 桌面版提供) / AI Provider (→ config) / 私有对话日志 (→ journal); no forms, no persistence in V0.1 | static |
| JournalPage | `features/journal/JournalPage.tsx` | Private local journal: date-grouped entries, entry form, explicit Markdown/JSON download; meta bar with 仅本机 badge and 保存规则 aside | empty, error (inline), content |
| journal service | `services/journal.ts` | localStorage journal (`morpho.journal.<YYYY-MM-DD>`): `todayIso/listEntries/addEntry/buildMarkdown/buildJson/downloadMarkdown/downloadJson`; explicit download only, no network (DO_NOT_BREAK #11/#12) | local-only |

Removed (ADR-013): `TimelinePage` / `GapsPage` (incl. CoveragePanel/GapCard rows) — content absorbed by OverviewPage; the coverage/gaps/timeline queries and services remain and are consumed by the overview page. `PlaceholderPage` now serves the `reports` view only (settings is a real page).

## Prototype effect-layer class inventory (`apps/desktop/src/styles/prototype.css`, ADR-013)

`kicker`, `view-fade`, `brand-mark`, `main-glow`, `metric-accent`, `pill` (`pill-success` / `pill-warning` / `pill-accent` / `pill-neutral` / `pill-error`), `badge-mono` (`node-badge-accent` / `node-badge-alt` / `node-badge-warning` / `node-badge-error`), `progress-track`, `progress-fill`, `brand-gradient-button`, `graph-canvas-bg`, `timeline-connector`. Pages must consume tokens or these classes — no hard-coded colors (see DESIGN_TOKENS.md).

Page specifications for every implemented view live under `docs/frontend/pages/`.
