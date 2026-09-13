# Design Tokens
Define semantic CSS variables for background, surface, border, text, accent, success, warning, error, info; spacing xs 4, sm 8, md 12, lg 16, xl 24, xxl 32; typography Display/H1/H2/H3/Body/Caption/Label; radii and motion tiers. Components consume tokens; pages never hard-code colors outside the tint governance rule below.

## Theme system (ADR-022)

Since ADR-022 the token layer is a **two-skin theme system**. Structure tokens (spacing/layout/typography/radii/shadows/motion/keyframes) are theme-independent and live in a shared `:root`; every color token (28 semantic slots) is defined by a skin:

- **`lamplit-study`** (default) — the "深夜研究室" graphite + brass workbench (ADR-021 + Amendment 1 values, unchanged). Declared on plain `:root`, so the skin renders correctly even before any `data-theme` attribute is set.
- **`bio-luminal`** (生物荧光) — deep-sea dark field with bio-luminescent cyan primary and violet secondary, derived from the brand logo's butterfly-brain artwork. Futuristic/youthful register for THIS skin only (maintainer direction overrides the quiet register here); glow is reserved for "living data" positions (focus rings, graph, active states, coverage) — never button fills.

Mechanism (the contract for the future Settings switcher):

| Aspect | Value |
|---|---|
| Theme ids | `lamplit-study` \| `bio-luminal` (whitelist; anything else falls back) |
| Apply | `document.documentElement.dataset.theme = "<id>"` |
| Persist | `localStorage["morpho.theme"]` (browser-local UI preference, journal precedent — no IPC/schema) |
| Default | `lamplit-study` |
| FOUC guard | Inline `<head>` script in `apps/desktop/index.html` resolves the key before first paint (whitelist + fallback, ≤10 lines) |

`color-scheme` stays `dark` for both skins. Source of truth: `packages/ui/src/tokens.css`.

## Color tokens — lamplit-study (default skin; ADR-021 Amendment 1 values)

| Token | Value |
|---|---|
| `--morpho-color-background` | `#131312` |
| `--morpho-color-surface` | `#1b1b19` |
| `--morpho-color-surface-raised` | `#242422` |
| `--morpho-color-border` | `rgb(228 226 220 / 0.12)` |
| `--morpho-color-text-primary` | `#f2f1ee` |
| `--morpho-color-text-secondary` | `#a8a5a0` |
| `--morpho-color-text-muted` | `#8f8c85` |
| `--morpho-color-accent` | `#d9a05b` (brass; ≤12% surface coverage — the only strongly warm hue in this skin) |
| `--morpho-color-accent-soft` | `rgb(217 160 91 / 0.12)` |
| `--morpho-color-accent-alt` | `#7fa5a3` (celadon — source/technology badges, add-chip; takes over the former purple's role) |
| `--morpho-color-success` | `#8fbf7f` |
| `--morpho-color-warning` | `#cf7d54` |
| `--morpho-color-error` | `#d47676` |
| `--morpho-color-info` | `#8ca6bf` (slate blue; info semantics only, never the main accent) |

### Contrast adjustments (lamplit-study; ADR-021 + Amendment 1)

Contrast-driven values, kept within their families by the programmatic WCAG audit (ratios computed against background/surface/surface-raised/surface-sunken):

| Token | First value | Shipped | Why |
|---|---|---|---|
| `--morpho-color-text-muted` | spec `#8a7e6d` → cut-1 `#988a78` | `#8f8c85` | The spec value failed 4.5:1; cut 1 passed but read beige (sepia drift). Amendment 1 neutral gray passes all four surfaces (worst 4.63 on raised) |
| `--morpho-color-error` | spec `#c96a6a` | `#d47676` | Spec value fails on surface-raised (4.30) and on its own pill tint (4.19); shipped value passes all uses |

Audit result (WCAG 2.x, worst case per pair, Amendment 1 surfaces): text-primary 13.77:1, text-secondary 6.33:1, text-muted 4.63:1 (all on surface-raised); accent as text 6.76:1, accent-alt 5.79:1, success 7.35:1, warning 4.97:1, error 4.93:1, info 6.16:1; `text-on-brand` on brass 8.02:1; avatar ink on avatar fill 7.80:1; selection/active borders at alpha 0.55 composite ≥3:1 (the UI-component floor). The hairline border (0.12 alpha, ≈1.3:1 composite) is a decorative divider per WCAG 1.4.11 and does not carry state.

## Color tokens — bio-luminal (ADR-022)

Derived from the brand logo (deep-sea field, bio-luminescent cyan/violet). The cyan/violet pair is brand-sanctioned (maintainer's artwork) and deliberately distinct from every banned AI-slop literal (`#3b82f6`/`#b59aff`/`#72a7ff`…) — guarded by an explicit test assertion.

| Token | Value | Worst-case contrast (on surface-raised `#18243a` unless noted) |
|---|---|---|
| `--morpho-color-background` | `#0c1220` | — |
| `--morpho-color-surface` | `#111a2c` | — |
| `--morpho-color-surface-raised` | `#18243a` | — |
| `--morpho-color-surface-sunken` | `#090f1a` | — |
| `--morpho-color-border` | `rgb(148 190 235 / 0.16)` | decorative hairline (1.41:1 composite), WCAG 1.4.11 divider |
| `--morpho-color-text-primary` | `#e8f2ff` | 13.74:1 |
| `--morpho-color-text-secondary` | `#9fb4d0` | 7.33:1 |
| `--morpho-color-text-muted` | `#7c90ae` | 4.78:1 (passes ≥4.5 everywhere; same margin pattern as lamplit's muted) |
| `--morpho-color-accent` | `#53d7f5` (bio-luminescent cyan) | 9.17:1 as text |
| `--morpho-color-accent-soft` | `rgb(83 215 245 / 0.13)` | decorative face tint |
| `--morpho-color-accent-alt` | `#b8a5ff` (violet — brand hue) | 7.29:1 as text |
| `--morpho-color-success` | `#6fdda8` | 9.31:1 (own 10% pill tint: 7.42:1) |
| `--morpho-color-warning` | `#f5b04a` | 8.28:1 (own pill tint: 6.83:1) |
| `--morpho-color-error` | `#ff8f9e` | 7.15:1 (own pill tint: 6.01:1); 0.55 state-border composite worst 3.10:1 |
| `--morpho-color-info` | `#6fa8ff` | 6.45:1 (own pill tint: 5.40:1) |
| `--morpho-color-text-on-brand` | `#061018` | 11.33:1 on cyan brand fill |
| `--morpho-color-avatar-bg` / `--morpho-color-avatar-ink` | `#9adcf0` / `#0a1420` | 12.23:1 ink on fill |
| `--morpho-color-scrim` | `rgb(4 8 16 / 0.65)` | — |
| `--morpho-color-overlay-hairline` / `soft` / `hover` / `strong` | `rgb(232 242 255 / 0.02 / 0.035 / 0.06 / 0.22)` | decorative tint ladder |
| `--morpho-color-graph-node` | `#142642` | — |
| `--morpho-color-graph-edge` / `hover` / `active` | `rgb(83 215 245 / 0.3 / 0.55 / 0.75)` | states ≥3.73:1 on node fill; base edge is a decorative stroke (2.06:1, stronger than lamplit's 1.74 baseline) |

### Contrast adjustments (bio-luminal)

| Token | Draft | Shipped | Why |
|---|---|---|---|
| `--morpho-color-error` | `#ff7a8a` | `#ff8f9e` | Draft passes ≥4.5 as text (6.21) but fails the 0.55 state-border floor (2.77:1 on raised, 2.94 on surface); brightened within the salmon family so text (7.15), pill tint (6.01) and border (worst 3.10:1) all pass |

Accent `@ 0.55` selection/active borders composite ≥3:1 on every surface (worst 3.77:1 on raised). All other draft values passed the audit unchanged.

## Radii and shadows (theme-independent)

| Token | Value |
|---|---|
| `--morpho-radius-sm` / `--morpho-radius-md` / `--morpho-radius-lg` | `6px` / `8px` / `12px` |
| `--morpho-shadow-panel` | `0 18px 45px rgb(5 5 5 / 0.35)` (shared neutral, both skins) |
| `--morpho-shadow-overlay` | `0 20px 50px rgb(5 5 5 / 0.5)` (shared neutral, both skins) |

## Effect and layout token expansion (structure from ADR-013; values per skin)

Originally added in the token-foundation wave (ADR-013) so pages could drop one-off literals for scrim, overlay tints, avatar, graph, and shell/dock scaffolding. Since ADR-022 these are color tokens: each skin defines the full set (lamplit-study values: sunken `#0e0e0d`, text-on-brand `#1c1207`, avatar `#b8b3a8`/`#21201d`, scrim `rgb(5 5 5 / 0.6)`, overlay ladder `rgb(242 241 238 / 0.02–0.22)`, graph-node `#232320`, graph edges `rgb(217 160 91 / 0.28–0.75)`; bio-luminal values in the table above).

Tailwind color utilities: `bg-surface-sunken`, `text-text-on-brand`, `bg-avatar-bg`, `text-avatar-ink`, `bg-scrim`, `bg-overlay-hairline` / `bg-overlay-soft` / `bg-overlay-hover` / `bg-overlay-strong`, `bg-graph-node`, `border-graph-edge` / `border-graph-edge-hover` / `border-graph-edge-active` (all `*-` variants work per the standard Tailwind color namespace). Because `app.css` binds utilities to token names, every utility automatically follows the active skin.

## Type tier expansion

| Token pair | Size / line-height | Utility |
|---|---|---|
| `--morpho-text-micro-size` / `--morpho-text-micro-line-height` | `11px` / `16px` | `text-micro` |
| `--morpho-text-nano-size` / `--morpho-text-nano-line-height` | `10px` / `14px` | `text-nano` |
| `--morpho-text-subhead-size` / `--morpho-text-subhead-line-height` | `17px` / `24px` | `text-subhead` |

`--leading-caption` binds to `--morpho-text-caption-line-height` (utility `leading-caption`).

## Spacing, layout, and radius expansion

| Token | Value | Utility (examples) |
|---|---|---|
| `--morpho-space-dot` | `7px` | `size-dot` (status dot diameter; also `w-dot`/`gap-dot`) |
| `--morpho-layout-sidebar-width` | `236px` | `w-sidebar` |
| `--morpho-layout-topbar-height` | `65px` | `h-topbar` |
| `--morpho-layout-dock-width` | `360px` | `w-dock` |
| `--morpho-layout-dock-height` | `530px` | `h-dock-h` |
| `--morpho-layout-dock-offset` | `76px` | `bottom-dock-offset` |
| `--morpho-radius-brand` | `10px` | `rounded-brand` |
| `--morpho-radius-dock` | `14px` | `rounded-dock` |

## Prototype effect layer (`apps/desktop/src/styles/prototype.css`)

Visual effects that Tailwind utilities cannot express cleanly. Since ADR-022 the layer is **theme-agnostic**: it defines no colors of its own — every composite is `color-mix(in srgb, var(--morpho-color-<token>) N%, transparent)` over a semantic token (supported in the target runtimes: Chromium/WebView2). The percentages are the tuned intensities from the ADR-021 polish pass, carried over unchanged, so both skins get identical effect geometry. Class names are the consumer contract and outlived both the ADR-013 composites and the ADR-021 literals. The only raw literal left is the shared neutral shadow color on `brand-gradient-button` (guard-pinned).

| Class | Purpose (color-mix form) |
|---|---|
| `kicker` | Eyebrow text: 10px / 800 / uppercase / letter-spacing 0.12em, text-muted |
| `view-fade` | View-switch fade-in (opacity 0→1, translateY 4px→0, 220ms) |
| ~~`brand-mark`~~ | **Retired 2026-09-13** — the sidebar/topbar now render the real brand logo (`/brand-mark.png`) inside a rounded frame; guard-pinned in `prototype.test.ts` |
| `main-glow` | Weak accent radial glow on the main canvas — accent 6% (lamplit: lamp-warm brass; bio-luminal: cyan haze) |
| `metric-accent` | Accent metric-card: flat accent-soft face + accent corner ring (border 25%, ring 14%; no gradient dependence) |
| `card-active-accent` | Active project card: accent 55% border (≥3:1 in both audited palettes) on a flat accent 6% wash |
| `card-active-error` | Conflicting knowledge card: error 55% border on a flat error 7% wash |
| `pill` + `pill-success` / `pill-warning` / `pill-accent` / `pill-neutral` / `pill-error` | Rounded status pills — semantic token at 10% (`pill-accent` wears the info color; `pill-neutral` = text-primary 5%) |
| `badge-mono` + `node-badge-accent` / `node-badge-alt` / `node-badge-warning` / `node-badge-error` | Monospace type badges — info / accent-alt / warning / error at 10% |
| `progress-track` / `progress-fill` | 4px track (text-primary 9%) + solid accent fill (gradient fills are a banned combination) |
| `brand-gradient-button` | Assistant launcher: solid accent + deep-ink text + shared neutral shadow `rgb(5 5 5 / 0.4)` (class name kept; gradient retired; the layer's one allowed raw literal) |
| `graph-canvas-bg` | Vignette that darkens the background token itself — `color-mix(in srgb, var(--morpho-color-background) 70%, black)` radial, so each skin deepens into its own hue |
| `timeline-connector` | Dashed connector between overview research-path rows (`var(--morpho-color-border)`; parent is position-relative) |
| ~~`chip-selected`~~ | **Retired 2026-09-13** — replaced by the registered `Chip` primitive (tokens-only selected face); rule removed, retirement guard-pinned |
| `option-selected` (+ `:hover`) | Selected option card: accent 55% border (≥3:1) on accent 6% fill; hover deepens the fill to 10% instead of relaxing the border below 3:1 |
| `dot-glow-accent` | 4px accent glow ring (project dot) — accent 11% |
| `dot-glow-secondary` | 4px neutral glow ring (draft dot) — text-secondary 10%; retuned in the 2026-09-13 polish pass from the spec's 0.4 (read ~4x brighter than its siblings, inverting the status hierarchy) |
| `dot-glow-warning` | 4px warning glow ring (paused dot) — warning 10% |
| `dot-muted` | Muted status dot fill — resolves to `text-secondary` |
| `pulse` | 5px accent glow ring on the current overview timeline marker — accent 8% |

Rule (ADR-013 decision 2, still in force): base colors on pages must come from semantic tokens. Token-derived alpha tints — the same RGB triple as a named token with an `/alpha` suffix (e.g. `border-[rgb(217_160_91/0.3)]`) — are permitted in Tailwind arbitrary values; under ADR-022 prefer the token utility or a `color-mix` over the active skin's token when a one-off tint is unavoidable, so the tint follows the skin. A guard test pins the effect layer to zero raw rgb/hex composites (shared shadow excepted).

### Polish-pass semantic notes (2026-09-13 visual review)

- `pill-accent` wears the info color even though its name says "accent" (class names are the frozen consumer contract). Verified against every consumer: the journal date pill and the RUNNING task status are informational/transient states, so the info hue is the correct read — nothing that should carry brand-CTA emphasis consumes this class. The accent stays reserved for interactive emphasis (≤12% surface), so no "accent" pill competes with primary actions.
- `node-badge-accent` (info: Concept/Event node types, `web_page` sources) and `node-badge-alt` (accent-alt: source/technology badges) are type labels, not status semantics; the two counter-axis hues distinguish label families from the success/warning/error pills without ever reading as calls to action.
- `option-selected:hover` (fill deepened 6% → 10% while the border holds 55% / ≥3:1) verified: selection is carried by the 3:1 accent border and wash, hover only deepens the wash, so selected-vs-hover stays legible; unselected option cards answer hover with the tint ladder (`bg-overlay-hover`), never a state border below 3:1.
- Shared motion keyframes live in `packages/ui/src/tokens.css` beside the motion tiers: `morpho-overlay-in` (ease-out rise), `morpho-tooltip-in` (opacity-only fast fade, so it never overrides the tooltip's centering transform), and `morpho-progress-slide` (indeterminate Progress loop). Shared by both skins.

## Approved non-token values (documented exceptions)

The raw values below are approved one-offs; everything else must consume tokens, token-derived alpha tints, or the effect layer (value → location → rationale).

- `grid-template-columns` values → **narrow-window revision (2026-09-13)**: the page-composition grids (metric / content / knowledge / project / source / settings) are expressed as responsive Tailwind utilities (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3/4`), so the former raw `repeat(3/4, 1fr)` and `1.55fr 1fr` literals no longer exist. What remains are single-consumer structural tracks: ConfigPage form-section gutter `grid-cols-[56px_1fr]`, ConfigPage preference cards `grid-cols-[auto_1fr]`, JournalPage entry rows `grid-cols-[48px_1fr]`, PlanPage tree headers `grid-cols-[22px_35px_1fr_auto_24px]` and task rows `grid-cols-[42px_1fr] md:grid-cols-[42px_1fr_auto]`, SettingsPage cards `grid-cols-[36px_1fr] md:grid-cols-[36px_1fr_auto]`, JournalPage two-panel `lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.75fr)]`, and the task/source table row tracks below (structural layout tracks, not theme values).
- `min-h-[45px]` → ProjectsPage project-card excerpt → single-site prototype measurement (`min-height: 45px`).
- `min-h-[63px]` → TasksPage / GraphPage toolbars → toolbar strip height below the topbar token's role.
- `min-h-[65px]` → KnowledgePage card summary → single-site prototype measurement.
- `min-h-[190px]` / `min-h-[203px]` → ProjectsPage / KnowledgePage cards → card minimum heights specific to each page's copy length.
- `min-h-[260px]` → JournalPage entry list → single-site scroll-region floor.
- `min-h-[440px]` → GraphPage canvas → canvas viewport floor tied to the graph layout.
- `max-w-[180px]` → GraphPage mini progress → single-site prototype measurement.
- `max-w-[850px]` → SettingsPage stack → reading-width cap specific to the settings composition.
- `w-[52px]` → ConfigPage segmented control → control-specific button width.
- `max-h-[70dvh]` → AssistantDock bottom sheet → viewport guard below lg only; the sheet never grows past 70% of the dynamic viewport (the desktop popup keeps the bare `h-dock` height).
- `size-[34px]` → Sidebar brand tile → logo image frame (`/brand-mark.png`, pairs with `rounded-brand`; the Topbar breadcrumb uses an 18px copy of the same asset).
- `lg:w-[245px]` → GraphPage inspector → inspector column width at desktop breakpoint.
- `ml-6 md:ml-[68px]` → PlanPage task indent → tree-indent structural offset (steps down to the spacing token below md so narrow windows keep title width).
- `grid-cols-[minmax(150px,2.2fr)_minmax(84px,1.2fr)_minmax(76px,0.85fr)_25px]` → TasksPage table rows → narrow table strategy floors (see below).
- `grid-cols-[minmax(64px,74px)_minmax(150px,1fr)_minmax(60px,70px)_35px]` → SourceCard `variant="row"` → narrow table strategy floors (74px/70px/35px maxima preserve the desktop geometry).
- `min-w-[480px]` → ReportsPage dimension coverage table → floor below which the table scrolls horizontally instead of wrapping headers character-by-character.
- `pt-[3px]` / `mt-[7px]` → ConfigPage section number/help → optical alignment nudges inside the config form.
- `gap-[3px]` / `gap-[11px]` → Sidebar nav list / nav items → prototype nav rhythm; promote to tokens if reused outside the sidebar.
- `text-[9px]` → AssistantPanel timestamps → below the `nano` tier, single consumer.
- `text-[21px]` → SourcesPage metric numerals → between `subhead` (17px) and `h2` (18px numeral display role), single consumer.

If a second consumer appears for any value above, promote it to a numbered token instead of duplicating the literal.

### 2026-09-12 additions (post-remediation sweep)

- `min-h-[70px]` / `min-h-[65px]` → `components/cards.tsx` (`SourceCard variant="row"` / `KnowledgeCard`) → card minimum heights moved here from SourcesPage/KnowledgePage when the pages adopted the registered cards (commit `a10b7da`); same rationale as above.
- `text-[21px]` / `text-[10px]` → `features/reports/ReportsPage.tsx` → metric numeral + timestamp, same roles as the SourcesPage/JournalPage exceptions.

### 2026-09-13 additions (ADR-021 migration)

- `border-[rgb(217_160_91/0.2)]` → JournalPage privacy note → single-site accent-alpha tint harmonizing with the note's `bg-accent-soft` face (former `rgb(114_167_255/0.2)`).
- `border-[rgb(217_160_91/0.3)]` → AssistantDock popup border (`WorkspaceLayout.tsx`) → single-site accent-alpha tint on the assistant brand surface (former `rgb(114_167_255/0.3)`).
- Note (ADR-022): these two lamplit accent tints ride the brass triple in the default skin; when the bio-luminal skin becomes switchable from Settings, prefer re-expressing them as token utilities (e.g. `border-accent/20`) so they follow the active skin.

### 2026-09-13 narrow-window additions (PRD §12 responsive pass)

**Narrow table strategy** (one pattern for TasksPage rows, SourcesPage rows via SourceCard `variant="row"`, and the ReportsPage dimension coverage table): table-like rows keep every column and gain `minmax(floor, track)` column floors inside a shared `overflow-x-auto` region — columns compress only down to their readable floors, then the header + rows scroll horizontally together (the real `<table>` in Reports uses the same idea as `w-full min-w-[480px]`). Above the point where the floors stop binding the tracks resolve to the exact former proportions, so ≥sm rendering is pixel-identical. Information-hiding (dropping secondary columns on narrow windows) was the considered alternative and rejected: no column is unreachable and the pattern extends to real `<table>` elements unchanged.

**AssistantDock below lg** (registered-component behavior change): the 360px popup becomes a full-width bottom sheet — `max-lg:inset-x-0 max-lg:bottom-0`, top corners keep `rounded-dock`, height capped at `max-h-[70dvh]` — rendered over a `lg:hidden` scrim that closes it on tap (same contract as the sidebar drawer backdrop). The launcher stays mounted beneath the sheet (spec §8 fidelity), so it never floats over narrow-window form controls. Desktop (lg+) is byte-identical: popup position/width classes resolve to the same values and the scrim is `display:none`.

### 2026-09-13 removal (lucide-react iconography, ADR-014 prep)

- `text-[25px]` (ProjectsPage new-project glyph) was removed from this list: the glyph character itself was replaced by a lucide `Plus` icon rendered at the component's standard hero size (`size={18}` prop), so the className literal no longer exists anywhere. Icon sizing is a lucide prop, not a text-size token — see COMPONENT_REGISTRY.md "Iconography".
