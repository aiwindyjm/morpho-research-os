# Design Tokens
Define semantic CSS variables for background, surface, border, text, accent, success, warning, error, info; spacing xs 4, sm 8, md 12, lg 16, xl 24, xxl 32; typography Display/H1/H2/H3/Body/Caption/Label; radii and motion tiers. Components consume tokens; pages never hard-code colors outside the tint governance rule below.

Values are aligned with the product prototype (ADR-013, `docs/architecture/adr/ADR-013-align-visual-tokens-with-prototype.md`): semantic names are unchanged, only values moved, so consumers are affected only by value changes. Source of truth: `packages/ui/src/tokens.css`.

## Color tokens (ADR-013 values)

| Token | Value |
|---|---|
| `--morpho-color-background` | `#0b0f17` |
| `--morpho-color-surface` | `#111722` |
| `--morpho-color-surface-raised` | `#1b2433` |
| `--morpho-color-border` | `rgb(176 191 215 / 0.13)` |
| `--morpho-color-text-primary` | `#e8edf5` |
| `--morpho-color-text-secondary` | `#8490a5` |
| `--morpho-color-text-muted` | `#606b80` |
| `--morpho-color-accent` | `#3b82f6` |
| `--morpho-color-accent-soft` | `rgb(114 167 255 / 0.11)` |
| `--morpho-color-accent-alt` | `#b59aff` (new in ADR-013; purple — source/technology badges, add-chip) |
| `--morpho-color-success` | `#62d0a3` |
| `--morpho-color-warning` | `#efaa65` |
| `--morpho-color-error` | `#ed7788` |
| `--morpho-color-info` | `#72a7ff` |

## Radii and shadows (ADR-013 values)

| Token | Value |
|---|---|
| `--morpho-radius-sm` / `--morpho-radius-md` / `--morpho-radius-lg` | `6px` / `8px` / `12px` |
| `--morpho-shadow-panel` | `0 18px 45px rgb(0 0 0 / 0.18)` |
| `--morpho-shadow-overlay` | `0 20px 50px rgb(0 0 0 / 0.38)` |

## Effect and layout token expansion (ADR-013 follow-up)

Added for the token-foundation wave so pages can drop one-off literals for scrim, overlay tints, avatar, graph, and shell/dock scaffolding. All values verified against `prototype/styles.css`.

| Token | Value | Notes |
|---|---|---|
| `--morpho-color-surface-sunken` | `#0d121b` | Shell/sidebar deep surface |
| `--morpho-color-text-on-brand` | `#f2f6ff` | Text atop brand gradients |
| `--morpho-color-avatar-bg` / `--morpho-color-avatar-ink` | `#b8c8ef` / `#151a24` | Local avatar (topbar) |
| `--morpho-color-scrim` | `rgb(0 0 0 / 0.6)` | Modal/drawer backdrop (no prototype counterpart; contract value) |
| `--morpho-color-overlay-hairline` | `rgb(255 255 255 / 0.018)` | Plan-summary style wash |
| `--morpho-color-overlay-soft` | `rgb(255 255 255 / 0.03)` | White tint ladder rung |
| `--morpho-color-overlay-hover` | `rgb(255 255 255 / 0.05)` | White tint ladder rung |
| `--morpho-color-overlay-strong` | `rgb(255 255 255 / 0.2)` | On-gradient translucent fill |
| `--morpho-color-graph-node` | `#1b273b` | Graph node fill |
| `--morpho-color-graph-edge` | `rgb(114 167 255 / 0.25)` | Graph edge stroke |
| `--morpho-color-graph-edge-hover` | `rgb(114 167 255 / 0.55)` | Edge hover state |
| `--morpho-color-graph-edge-active` | `rgb(114 167 255 / 0.7)` | Edge selected/active state |

Tailwind color utilities: `bg-surface-sunken`, `text-text-on-brand`, `bg-avatar-bg`, `text-avatar-ink`, `bg-scrim`, `bg-overlay-hairline` / `bg-overlay-soft` / `bg-overlay-hover` / `bg-overlay-strong`, `bg-graph-node`, `border-graph-edge` / `border-graph-edge-hover` / `border-graph-edge-active` (all `*-` variants work per the standard Tailwind color namespace).

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

Visual effects that Tailwind utilities cannot express cleanly. The effect layer defines no new color system — it references tokens; the raw gradient/glow composites in it were approved with the prototype (ADR-013). Registered classes:

| Class | Purpose |
|---|---|
| `kicker` | Eyebrow text: 10px / 800 / uppercase / letter-spacing 0.12em, text-muted |
| `view-fade` | View-switch fade-in (opacity 0→1, translateY 4px→0, 220ms) |
| `brand-mark` | Gradient sidebar brand tile ("M") |
| `main-glow` | Radial top glow on the main canvas |
| `metric-accent` | Accent metric-card gradient + corner ring (overview coverage card) |
| `pill` + `pill-success` / `pill-warning` / `pill-accent` / `pill-neutral` / `pill-error` | Rounded status pills |
| `badge-mono` + `node-badge-accent` / `node-badge-alt` / `node-badge-warning` / `node-badge-error` | Monospace type badges |
| `progress-track` / `progress-fill` | 4px track + accent→accent-alt gradient fill |
| `brand-gradient-button` | Gradient assistant launcher button |
| `graph-canvas-bg` | Radial dark graph canvas |
| `timeline-connector` | Dashed connector between overview research-path rows (parent is position-relative) |
| `chip-selected` | Selected chip/filter state: info text, accent 0.45 border, accent-soft background |
| `option-selected` (+ `:hover`) | Selected option card: accent 0.4 border on accent 0.066 fill; hover relaxes the border to 0.3 |
| `dot-glow-accent` | 4px purple glow ring (project dot) |
| `dot-glow-secondary` | 4px neutral glow ring (draft dot) |
| `dot-glow-warning` | 4px orange glow ring (paused dot) |
| `dot-muted` | Muted status dot fill — resolves to `text-secondary` (prototype draft-dot value `#8490a5`) |
| `pulse` | 5px accent glow ring on the current overview timeline marker |

Rule (ADR-013, decision 2): base colors on pages must come from semantic tokens. Token-derived alpha tints — the same RGB triple as a named token with an `/alpha` suffix (e.g. `border-[rgb(114_167_255/0.45)]`) — are permitted in Tailwind arbitrary values. One-off approved literals are limited to those listed in the ADR: sidebar background `#0d121b`, avatar `#b8c8ef`/`#151a24`, brand text `#f2f6ff`, graph node fill `#1b273b`, plus the gradient composites in `prototype.css` (ADR-013 boundary; DO_NOT_BREAK #4 — this is prototype alignment, not an arbitrary redesign).

## Approved non-token values (documented exceptions)

The raw values below are approved one-offs; everything else must consume tokens, token-derived alpha tints, or the effect layer (value → location → rationale).

- `grid-template-columns` values (e.g. `repeat(3/4, 1fr)`, `1.55fr 1fr`, `minmax(0, 1.55fr) minmax(260px, .75fr)`, task/source table column tracks) → metric/content/knowledge/project/source/settings grids (9 sites) → structural layout tracks, not theme values; they describe how many columns a specific composition has, not a reusable design decision.
- `min-h-[45px]` → ProjectsPage project-card excerpt → single-site prototype measurement (`min-height: 45px`).
- `min-h-[63px]` → TasksPage / GraphPage toolbars → toolbar strip height below the topbar token's role.
- `min-h-[65px]` → KnowledgePage card summary → single-site prototype measurement.
- `min-h-[190px]` / `min-h-[203px]` → ProjectsPage / KnowledgePage cards → card minimum heights specific to each page's copy length.
- `min-h-[260px]` → JournalPage entry list → single-site scroll-region floor.
- `min-h-[440px]` → GraphPage canvas → canvas viewport floor tied to the graph layout.
- `max-w-[180px]` → GraphPage mini progress → single-site prototype measurement.
- `max-w-[850px]` → SettingsPage stack → reading-width cap specific to the settings composition.
- `w-[52px]` → ConfigPage segmented control → control-specific button width.
- `size-[34px]` → Sidebar brand tile → brand-mark glyph box (pairs with `rounded-brand`).
- `lg:w-[245px]` → GraphPage inspector → inspector column width at desktop breakpoint.
- `ml-[68px]` → PlanPage task indent → tree-indent structural offset.
- `pt-[3px]` / `mt-[7px]` → ConfigPage section number/help → optical alignment nudges inside the config form.
- `gap-[3px]` / `gap-[11px]` → Sidebar nav list / nav items → prototype nav rhythm; promote to tokens if reused outside the sidebar.
- `text-[9px]` → AssistantPanel timestamps → below the `nano` tier, single consumer.
- `text-[21px]` → SourcesPage metric numerals → between `subhead` (17px) and `h2` (18px numeral display role), single consumer.
- `text-[25px]` → ProjectsPage new-project icon glyph → decorative glyph size, single consumer.

If a second consumer appears for any value above, promote it to a numbered token instead of duplicating the literal.

### 2026-09-12 additions (post-remediation sweep)

- `min-h-[70px]` / `min-h-[65px]` → `components/cards.tsx` (`SourceCard variant="row"` / `KnowledgeCard`) → card minimum heights moved here from SourcesPage/KnowledgePage when the pages adopted the registered cards (commit `a10b7da`); same rationale as above.
- `text-[21px]` / `text-[10px]` → `features/reports/ReportsPage.tsx` → metric numeral + timestamp, same roles as the SourcesPage/JournalPage exceptions.
- `border-[rgb(114_167_255/0.2)]` → JournalPage privacy note → single-site info-alpha tint of the accent/info token triple (ADR-013 decision 2 permits token-derived alpha tints).
- `border-[rgb(114_167_255/0.3)]` → AssistantDock popup border (`WorkspaceLayout.tsx`) → single-site info-alpha tint; adjacent to `.chip-selected`'s 0.45 but a distinct approved value.
