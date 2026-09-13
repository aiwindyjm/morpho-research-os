# Component Registry
Every component records purpose, props, states, accessibility contract, owner, and examples. Existing business components must be reused; additions require rationale and a documentation entry. Registry is the review checklist for AI-generated UI.

## Implementation index (V0.1 first build)

Primitives live in `packages/ui/src/primitives/` and consume design tokens only (`Button.tsx` — Button, `inputs.tsx` — Input/Textarea/Select/Checkbox/Field/Label, `overlays.tsx` — Dialog/Popover/Tooltip/Toast, `display.tsx` — Badge/Card/Chip/SegmentedControl/Table/Progress/Skeleton/Alert/Tabs). Each primitive ships keyboard, focus, disabled, and loading states with component tests.

### Primitive additions promoted from app code (ADR-014 adoption prep)

Overriding primitive base classes from a consumer: under Tailwind v4, same-property utilities sort alphabetically in the built CSS, so a primitive's base class wins over a plain consumer `className` (`rounded-md` beats `rounded-full`, ghost's `bg-transparent` beats `bg-scrim`). Use the trailing-`!` important suffix for those overrides (`rounded-full!`, `px-md!`, `bg-avatar-bg!`, `bg-accent-soft!`); smaller-value overrides on properties the primitive leaves free (e.g. `px-xs` on a `px-lg` base) work without it.

| Primitive | Purpose | Props (beyond native) | States / a11y | Promoted from |
|---|---|---|---|---|
| Button `size="icon"` | Square compact icon-only button (`h-7 w-7 p-0`); pass `aria-label`; `rounded-md` default retained — circular targets are a caller `className` concern via `rounded-full!` (see the override convention above) | `size?: "sm" \| "md" \| "icon"` | Shares all variant/disabled/loading semantics (aria-busy, shared muted disabled face, enabled-gated hover/press) of sm/md, which are unchanged | The 22 raw `<button>` icon sites flagged in the maintainer review (Sidebar icon nav, row actions, dialog closers) |
| Badge `dot` | Decorative status dot (`size-dot rounded-full`) prefixed inside the badge, tinted by the badge variant (neutral = `dot-muted` text-secondary ink) | `dot?: boolean` | Dot is `aria-hidden` — label text carries the meaning; variant faces unchanged | Topbar 已保存 dot (`Topbar.tsx`: `size-dot rounded-full bg-success`), ProjectSwitcher status dots (`ProjectSwitcher.tsx`; glow rings `dot-glow-*` remain app-side `className`) |
| Chip | Compact selectable filter/dimension button reproducing the `.chip-selected` contract with tokens only: selected = brass ink + `border-accent/55` + `bg-accent-soft`, idle = quiet border + muted ink (hover lifts ink one step) | `selected?: boolean`; otherwise native button props (`onClick` per selection change; size sm fixed) | Toggle-button pattern: `aria-pressed={selected}`, native button semantics, global focus ring, `disabled` mutes ink and blocks interaction. Rationale: `.chip-selected` lives in the app effect layer; primitives must consume tokens only, so the selected face is re-expressed inline and the app class is retired per consumer during adoption | GraphPage type-filter chips, SourcesPage type chips, ConfigPage dimension chips (all `aria-pressed` + `chip-selected`; GraphPage/SourcesPage idle face is canonical — ConfigPage's slightly warmer idle `text-text-secondary hover:text-text-primary` normalizes to the primitive's idle face on adoption) |
| SegmentedControl | Single-select joined segments reproducing the ConfigPage depth-selector geometry (`h-9` × `w-[52px]`, collapsed borders via `-ml-px`, rounded group ends) | `options: { value: string; label: string }[]`, `value: string` (controlled), `onChange(value)`, `label: string` (radiogroup name) | Radiogroup pattern (a11y-correct for single-select, unlike the prototype's `aria-pressed` group): `role="radiogroup"` + `role="radio"` + `aria-checked`, roving tabindex (only selected segment tabbable), Arrow/Home/End move selection with focus following, wrapping both ends; selected face = brass fill + `text-text-on-brand` (intentional upgrade over the prototype's `chip-selected` face for a firmer single-select affordance), unselected = quiet `bg-surface` face | ConfigPage 研究深度 selector (`ConfigPage.tsx`) |

## Iconography (lucide-react, ADR-014 adoption prep)

The prototype carried raw Unicode text characters as icons (`⌄` switcher chevron, sidebar nav glyphs, `⌕` search, `⋯` menus, `✦` assistant launcher, …). They violated the icon standard: no single library, no consistent stroke, and no grid. **ADR-014 prep (2026-09-13)**: every such glyph was replaced with [lucide-react](https://lucide.dev) (the shadcn-ecosystem standard), pinned at `lucide-react@1.45.0` in `apps/desktop`. This is a dependency adoption, not a framework change.

Rules:

- **One library only**: `lucide-react`; no other icon source, no new text glyphs.
- **Sizing**: `size={16}` for inline/nav icons (sidebar nav, buttons, row markers, list checks); `size={18}` for launcher/hero spots (assistant launcher, the dashed new-project card's plus). Icon-only targets stay `Button size="icon"` (`h-7 w-7`).
- **Stroke**: `strokeWidth={1.75}` globally (inside the 1.5–2 band).
- **Color**: single color only, inherited from the parent text token class via `currentColor`; fill colors are never set. Decorative icons are `aria-hidden="true"`; icon-only interactive elements keep their `aria-label`.
- **Data shape**: `WORKSPACE_VIEWS` (`stores/workspaceStore.ts`) carries icon *names* (`ViewIconName`: `"layout-grid" | "house" | …`), keeping the store data-only; `Sidebar.tsx` maps names to components (`VIEW_ICONS: Record<ViewIconName, LucideIcon>`) and renders `<Icon size={16} strokeWidth={1.75} aria-hidden />`.
- **Open-state affordance**: disclosure chevrons (ProjectSwitcher trigger, PlanPage group collapse) render `ChevronDown` and `rotate-180` while expanded (`aria-expanded`-derived class, `duration-[var(--morpho-motion-fast)]`).

Glyph → icon mapping as adopted:

| Glyph (was) | Lucide | Site(s) |
|---|---|---|
| `▦` | `LayoutGrid` | Sidebar 我的研究 |
| `⌂` | `House` | Sidebar 概览 |
| `＋` | `Plus` | Sidebar 研究配置；ProjectsPage 新建研究 button + dashed new-project card (`size={18}`); ConfigPage 自定义维度 chip |
| `☷` | `ListTree` | Sidebar 研究计划 |
| `✓` | `ListChecks` | Sidebar 任务 |
| `◌` | `Globe` | Sidebar 来源；ConfigPage web_page |
| `◇` | `BookOpen` | Sidebar 知识；OverviewPage knowledge activity; KnowledgeCard 结论 count |
| `⌘` | `Waypoints` | Sidebar 图谱 |
| `▤` | `ScrollText` | Sidebar 对话日志；SettingsPage 对话日志 card |
| `⚙` | `SlidersHorizontal` | Sidebar 设置 (gear banned as a lazy stereotype) |
| `◫` | `FileText` | reports view registration (not in nav, ADR-013) |
| `⌄` / `⌃` | `ChevronDown` (+rotate) | ProjectSwitcher trigger, PlanPage group collapse |
| `⌕` | `Search` | ProjectsPage search; OverviewPage source activity |
| `?` | `CircleHelp` | Topbar 帮助 |
| `⋯` | `Ellipsis` | ProjectsPage card menu, TasksPage row actions |
| `✕` / `×` | `X` | AssistantPanel close, GraphNodeInspector close |
| `✦` | `Sparkles` | AssistantDock launcher (`size={18}`); SettingsPage provider card |
| `☰` | `Menu` | Mobile 菜单 button |
| `◉` | `Server` | SettingsPage 桌面核心连接 card |
| (new, no prototype glyph) | `Palette` | SettingsPage 外观主题 card |
| `◈ ▭ ▷ ⌗` | `FileText` `Book` `Play` `GitBranch` | ConfigPage source-type preferences (paper / book / video / repository; dataset `▦`→`Database`) |
| `→ ✓ ○ !` (path markers) | `CircleDot` `Check` `Circle` `TriangleAlert` | OverviewPage 研究路径 (`!` renders inside the review pill) |
| `↗` | `ArrowUpRight` | SourceCard row external link; OverviewPage run activity; KnowledgeCard 来源 count |
| `⋮⋮` | `GripVertical` | PlanPage section row decoration |

Deliberately **not** icons: trailing text arrows in button/link labels (`查看任务 →`, `打开日志 →`) and the graph relation direction arrows (`→` / `←`) are typographic punctuation in running text, not icon slots; the Topbar avatar "A" and the Sidebar brand "M" are initials/brand marks, not icons.

Registered business components (`apps/desktop/src/`):

| Component | Location | Purpose | States |
|---|---|---|---|
| PageShell | `components/PageShell.tsx` | Prototype page heading: kicker + display title + lede + actions, optional toolbar, fade-in content | static |
| PageStates (PageLoading/PageEmpty/PageError) | `components/PageStates.tsx` | Mandatory loading/empty/error rendering | loading, empty, error, content |
| ResearchStatusBadge | `components/cards.tsx` | Task/plan/confidence status badge | per documented vocabulary |
| SourceCard | `components/cards.tsx` | Source rendering: full card (URL, type, quality rationale) or prototype compact row (`variant="row"`, `source-row` testid) used by the sources view | evaluated / pending quality |
| KnowledgeCard | `components/cards.tsx` | Prototype knowledge card: mono type badge, confidence caption, source/claim counts | default, conflict |
| ClaimCard | `components/cards.tsx` | Claim statement with subject and scope | per confidence state |
| EvidenceList | `components/cards.tsx` | Evidence quotes with locator and direction | support/contradict, empty |
| PurposeSelect | `components/research.tsx` | Research purpose select (PRD §5) consumed by the config page | disabled |
| GraphCanvas | `features/graph/GraphPage.tsx` | SVG 2D force graph with node selection | nodes/relations filtered, keyboard focus |
| GraphNodeInspector | `features/graph/GraphPage.tsx` | Selected node details and relations | open/closed |
| AssistantPanel | `features/assistant/AssistantPanel.tsx` | Project-bound assistant: explain progress, suggest next task, list pending reviews, record decision (explicit save) | loading, responding, error, saved |
| ProjectSwitcher | `app/layout/ProjectSwitcher.tsx` | Prototype project menu: status dots + progress, manage-all entry, create | loading, empty, error |
| Topbar | `app/layout/Topbar.tsx` | Prototype topbar: breadcrumb Morpho / {project}, saved state, help, local avatar (ADR-013) | static |
| Sidebar | `app/layout/Sidebar.tsx` | Prototype sidebar: brand mark, project switcher, icon nav with active inset line (aria-current), storage footer + settings entry; below lg an accessible drawer (aria-modal, focus trap, Escape/backdrop close, focus return) | docked, drawer open/closed |
| AssistantDock | `app/layout/WorkspaceLayout.tsx` | Floating assistant: gradient launcher (bottom-right) + 360×530 popup wrapping AssistantPanel; Escape closes, focus moves into panel and back to launcher (ADR-013) | open/closed |
| OverviewPage | `features/overview/OverviewPage.tsx` | Dashboard absorbing timeline/gaps: 4 metric cards (testid `metric-*`), research path (`overview-path`), activity (`overview-activity`), dimension-coverage disclosure with reasons + `COVERAGE_WEIGHTS` (`overview-dimensions`), next-step gap panel with approve/dismiss (`overview-next`); replaces CoveragePanel/GapCard | loading, empty, error, content |
| SettingsPage | `features/settings/SettingsPage.tsx` | Local workspace settings: 外观主题 card (ADR-022 skin picker — see the theme store row below) first, then three wired cards — 桌面核心连接 (core.info status + capability versions) / AI Provider 密钥 (secrets.listProviders + setProviderKey, keychain-only) / 私有对话日志 (→ journal) | 外观主题: instant-apply selection; 核心连接: loading/online/offline; 密钥: configured/unconfigured, save pending/error toast |
| JournalPage | `features/journal/JournalPage.tsx` | Private local journal: date-grouped entries, entry form, explicit Markdown/JSON download; meta bar with 仅本机 badge and 保存规则 aside | empty, error (inline), content |
| ConfigPage | `features/config/ConfigPage.tsx` | Research config form, four numbered sections (01 研究主题 / 02 研究范围 / 03 研究维度 / 04 来源偏好): topic/audience inputs, PurposeSelect, depth chips, year range, languages, dimension chips, source-type preference cards; draft with 取消/保存配置 and zod validation | loading, error, no-project, dirty draft |
| PlanPage | `features/plan/PlanPage.tsx` | Plan review (RES-01): four-cell summary strip + collapsible plan tree; 确认并开始/拒绝计划/重新生成 gate the run, 开始运行 for approved plans, per-task edit dialog, locked-plan notice while a run is active | loading, empty, error, draft review, locked (run active), edit dialog |
| TasksPage | `features/tasks/TasksPage.tsx` | Task table (RES-02): count tabs 全部/执行中/待审核/已完成, status pills, row-action popover (暂停/恢复/重试/取消), run start gated on an approved plan | loading, empty, error, per-tab filter |
| SourcesPage | `features/sources/SourcesPage.tsx` | Source library: quality summary strip, search + type chips (`chip-selected`) + quality toggle; rows rendered by SourceCard `variant="row"` | loading, empty, error, filtered |
| ProjectsPage | `features/projects/ProjectsPage.tsx` | Project grid with search + count; cards with active gradient (`card-active-accent`), progress bar (progressbar role), create dialog shared with the dashed new-project card | loading, empty, error, content |
| KnowledgePage | `features/knowledge/KnowledgePage.tsx` | Knowledge nodes grid (KnowledgeCard incl. conflict variant) + claims tab (ClaimCard with evidence disclosure); type filter select, toolbar count badges | loading, empty, error, conflict variant, evidence open/closed |
| journal service | `services/journal.ts` | localStorage journal (`morpho.journal.<YYYY-MM-DD>`): `todayIso/listEntries/addEntry/buildMarkdown/buildJson/downloadMarkdown/downloadJson`; explicit download only, no network (DO_NOT_BREAK #11/#12) | local-only |
| theme store | `stores/themeStore.ts` | Skin preference, ADR-022 public contract: `theme: ThemeId` (`"lamplit-study" \| "bio-luminal"` whitelist; unknown → default `lamplit-study`), `setTheme` instant-applies by writing `document.documentElement.dataset.theme` + `localStorage["morpho.theme"]`; `getInitialTheme` is the shared fallback ladder (stored id → whitelist check → default, storage-throw safe) and seeds the store at module init (which mirrors state onto `<html>`; the FOUC inline script in `index.html` stays the pre-paint authority). Consumed by the SettingsPage 外观主题 card: radiogroup pattern per SegmentedControl (`role="radiogroup"`/`radio`, `aria-checked`, roving tabindex, Arrow/Home/End with focus following), selected face = `option-selected` effect class (ConfigPage source-preference consistency), no save button. The per-option preview swatches are the page's only sanctioned color literals — they depict each skin's FIXED palette (background/accent/accent-alt) so both options stay distinguishable; surrounding chrome consumes tokens only | default skin, persisted skin, storage blocked (session-only skin, no throw), unknown id ignored |

Removed (ADR-013): `TimelinePage` / `GapsPage` (incl. CoveragePanel/GapCard rows) — content absorbed by OverviewPage; the coverage/gaps/timeline queries and services remain and are consumed by the overview page. Also removed as dead code (zero consumers after prototype alignment): `ResearchDepthSelector` / `ResearchDimensionPicker` / `ResearchPlanTree` / `PlanTreeNode` and `TaskProgress` / `TaskRow` — the config, plan, tasks, and projects pages render their own prototype-aligned markup; `PurposeSelect` remains (config page). `PlaceholderPage` has since been removed as well: every view — including `reports` — now resolves to a real page in `app/viewRegistry.tsx` (`features/reports/ReportsPage.tsx`). Note on primitives: `Progress` currently has zero consumers (pages render `progress-track`/`progress-fill` markup directly), while `Table` (ReportsPage) and `Tabs` (KnowledgePage) are adopted; further primitive adoption/consolidation decisions are deferred to ADR-014 (shadcn/ui migration).

## Prototype effect-layer class inventory (`apps/desktop/src/styles/prototype.css`, ADR-013)

`kicker`, `view-fade`, `brand-mark`, `main-glow`, `metric-accent`, `card-active-accent`, `card-active-error`, `pill` (`pill-success` / `pill-warning` / `pill-accent` / `pill-neutral` / `pill-error`), `badge-mono` (`node-badge-accent` / `node-badge-alt` / `node-badge-warning` / `node-badge-error`), `progress-track`, `progress-fill`, `brand-gradient-button`, `graph-canvas-bg`, `timeline-connector`, `chip-selected`, `option-selected`, `dot-glow-accent`, `dot-glow-secondary`, `dot-glow-warning`, `dot-muted`, `pulse`. Pages must consume tokens or these classes — no hard-coded colors (see DESIGN_TOKENS.md).

Adoption note (ADR-014 prep): `chip-selected` now has a token-only primitive equivalent — `Chip` (selected face) and `SegmentedControl` (geometry; selected face upgraded to the brass fill). The class and its consumers stay in place until the app migration retires them one by one; `option-selected`, `dot-glow-*`, and `dot-muted` are untouched (the Badge `dot` reuses the dot-muted ink value as a token, not the class).

Page specifications for every implemented view live under `docs/frontend/pages/`.
