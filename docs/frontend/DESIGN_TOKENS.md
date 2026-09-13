# Design Tokens
Define semantic CSS variables for background, surface, border, text, accent, success, warning, error, info; spacing xs 4, sm 8, md 12, lg 16, xl 24, xxl 32; typography Display/H1/H2/H3/Body/Caption/Label; radii and motion tiers. Components consume tokens; pages never hard-code colors outside the tint governance rule below.

Values follow the "深夜研究室" (Lamplit Study) warm-dark palette (ADR-021, `docs/architecture/adr/ADR-021-lamplit-study-token-palette.md`; Accepted 2026-09-13): semantic names are unchanged, only values moved (ADR-013 precedent), so consumers are affected only by value changes. ADR-021 supersedes the ADR-013 value table; ADR-013's semantic names, token governance, and alpha-tint rule remain in force. Source of truth: `packages/ui/src/tokens.css`.

## Color tokens (ADR-021 values)

| Token | Value |
|---|---|
| `--morpho-color-background` | `#17130f` |
| `--morpho-color-surface` | `#1f1a15` |
| `--morpho-color-surface-raised` | `#292219` |
| `--morpho-color-border` | `rgb(222 200 172 / 0.14)` |
| `--morpho-color-text-primary` | `#f2ebe0` |
| `--morpho-color-text-secondary` | `#b3a695` |
| `--morpho-color-text-muted` | `#988a78` |
| `--morpho-color-accent` | `#d9a05b` (brass; ≤12% surface coverage) |
| `--morpho-color-accent-soft` | `rgb(217 160 91 / 0.12)` |
| `--morpho-color-accent-alt` | `#7fa5a3` (celadon — source/technology badges, add-chip; takes over the former purple's role) |
| `--morpho-color-success` | `#8fbf7f` |
| `--morpho-color-warning` | `#cf7d54` |
| `--morpho-color-error` | `#d47676` |
| `--morpho-color-info` | `#8ca6bf` (slate blue; info semantics only, never the main accent) |

### Contrast-driven adjustments to the spec values (ADR-021)

Two token values are brightenings of the design spec's targets within their hue families, required by the programmatic WCAG audit (all ratios below are computed against the four surfaces background/surface/surface-raised/surface-sunken):

| Token | Spec target | Shipped | Why |
|---|---|---|---|
| `--morpho-color-text-muted` | `#8a7e6d` | `#988a78` | Spec value fails 4.5:1 on surface (4.34) and surface-raised (3.95); shipped value passes all four (worst 4.67 on surface-raised) |
| `--morpho-color-error` | `#c96a6a` | `#d47676` | Spec value fails on surface-raised (4.30) and on its own pill tint (4.19); shipped value passes all uses (worst 4.78 on the pill tint) |

Audit result (WCAG 2.x, worst case per pair): text-primary 13.26:1, text-secondary 6.59:1, text-muted 4.67:1 (all on surface-raised, the darkest-surface worst case); accent as text 6.83:1, accent-alt 5.84:1, success 7.42:1, warning 5.02:1, error 4.98:1, info 6.22:1; `text-on-brand` on brass 8.02:1; avatar ink on avatar fill 8.43:1; selection/active borders at alpha 0.55 composite ≥3.06:1 (the 3:1 UI-component floor); accent focus ring on background 8.03:1. The hairline border (0.14 alpha, ≈1.37:1 composite) is a decorative divider per WCAG 1.4.11 and does not carry state.

## Radii and shadows (ADR-021 values)

| Token | Value |
|---|---|
| `--morpho-radius-sm` / `--morpho-radius-md` / `--morpho-radius-lg` | `6px` / `8px` / `12px` |
| `--morpho-shadow-panel` | `0 18px 45px rgb(15 9 4 / 0.35)` |
| `--morpho-shadow-overlay` | `0 20px 50px rgb(15 9 4 / 0.5)` |

## Effect and layout token expansion (ADR-013 structure, ADR-021 values)

Originally added in the token-foundation wave (ADR-013) so pages could drop one-off literals for scrim, overlay tints, avatar, graph, and shell/dock scaffolding; values now follow ADR-021.

| Token | Value | Notes |
|---|---|---|
| `--morpho-color-surface-sunken` | `#120e0b` | Shell/sidebar deep surface |
| `--morpho-color-text-on-brand` | `#1c1207` | Deep ink atop brass brand fills (was light-on-gradient in ADR-013) |
| `--morpho-color-avatar-bg` / `--morpho-color-avatar-ink` | `#c9ab7c` / `#1c1207` | Local avatar (topbar) |
| `--morpho-color-scrim` | `rgb(10 6 3 / 0.62)` | Modal/drawer backdrop |
| `--morpho-color-overlay-hairline` | `rgb(242 235 224 / 0.02)` | Plan-summary style wash |
| `--morpho-color-overlay-soft` | `rgb(242 235 224 / 0.035)` | Warm tint ladder rung |
| `--morpho-color-overlay-hover` | `rgb(242 235 224 / 0.06)` | Warm tint ladder rung |
| `--morpho-color-overlay-strong` | `rgb(242 235 224 / 0.22)` | On-brand translucent fill |
| `--morpho-color-graph-node` | `#2b241c` | Graph node fill |
| `--morpho-color-graph-edge` | `rgb(217 160 91 / 0.28)` | Graph edge stroke |
| `--morpho-color-graph-edge-hover` | `rgb(217 160 91 / 0.55)` | Edge hover state |
| `--morpho-color-graph-edge-active` | `rgb(217 160 91 / 0.75)` | Edge selected/active state |

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

Visual effects that Tailwind utilities cannot express cleanly. The effect layer defines no new color system — it references tokens; the raw gradient/glow composites in it were approved with the active palette (ADR-021; class names are the consumer contract and outlived the ADR-013 composites). Registered classes:

| Class | Purpose |
|---|---|
| `kicker` | Eyebrow text: 10px / 800 / uppercase / letter-spacing 0.12em, text-muted |
| `view-fade` | View-switch fade-in (opacity 0→1, translateY 4px→0, 220ms) |
| `brand-mark` | Brass micro-gradient brand tile ("M" in text-on-brand deep ink) |
| `main-glow` | Weak lamp-warm radial glow on the main canvas (brass 0.06) |
| `metric-accent` | Accent metric-card: flat accent-soft face + brass corner ring (no gradient dependence) |
| `card-active-accent` | Active project card: 3:1 brass border (0.55) on a flat brass wash (0.06) |
| `card-active-error` | Conflicting knowledge card: 3:1 error border (0.55) on a flat error wash (0.07) |
| `pill` + `pill-success` / `pill-warning` / `pill-accent` / `pill-neutral` / `pill-error` | Rounded status pills (new semantic triples; `pill-accent` wears the slate-blue info color) |
| `badge-mono` + `node-badge-accent` / `node-badge-alt` / `node-badge-warning` / `node-badge-error` | Monospace type badges (info slate blue / celadon accent-alt / terracotta / error) |
| `progress-track` / `progress-fill` | 4px warm track + solid brass fill (gradient fills are a banned combination) |
| `brand-gradient-button` | Assistant launcher: solid brass + deep-ink text + warm shadow (class name kept; gradient implementation retired) |
| `graph-canvas-bg` | Warm dark vignette (`#141009` radial) over the background token |
| `timeline-connector` | Dashed connector between overview research-path rows (parent is position-relative) |
| `chip-selected` | Selected chip/filter state: brass text, brass 0.55 border (≥3:1), accent-soft background |
| `option-selected` (+ `:hover`) | Selected option card: brass 0.55 border (≥3:1) on brass 0.06 fill; hover deepens the fill to 0.1 instead of relaxing the border below 3:1 |
| `dot-glow-accent` | 4px brass glow ring (project dot) |
| `dot-glow-secondary` | 4px warm-neutral glow ring (draft dot); retuned in the 2026-09-13 polish pass from the spec's `rgb(242 235 224 / 0.4)` to `rgb(242 235 224 / 0.1)` — at 0.4 the parchment ring read ~4x brighter than its sibling glows (accent 0.11, warning 0.1), making the draft state the loudest on screen and inverting the status hierarchy; 0.1 matches the sibling ring intensity |
| `dot-glow-warning` | 4px terracotta glow ring (paused dot) |
| `dot-muted` | Muted status dot fill — resolves to `text-secondary` |
| `pulse` | 5px brass glow ring on the current overview timeline marker |

Rule (ADR-013 decision 2, still in force): base colors on pages must come from semantic tokens. Token-derived alpha tints — the same RGB triple as a named token with an `/alpha` suffix (e.g. `border-[rgb(217_160_91/0.3)]`) — are permitted in Tailwind arbitrary values. The former one-off literals (sidebar `#0d121b`, avatar `#b8c8ef`/`#151a24`, brand text `#f2f6ff`, graph node `#1b273b`) were promoted to named tokens in the ADR-013 follow-up wave and simply ride the ADR-021 values now; the only raw literals left in the effect layer are the ADR-021 gradient/glow composites (`#e0b06b`, `#c8914e`, `#141009`) and documented flat washes.

### Polish-pass semantic notes (2026-09-13 visual review)

- `pill-accent` wears the slate-blue info color even though its name says "accent" (class names are the frozen consumer contract). Verified against every consumer: the journal date pill and the RUNNING task status are informational/transient states, so the info hue is the correct read — nothing that should carry brand-CTA emphasis consumes this class. Brass stays reserved for interactive emphasis (≤12% surface), so no "accent" pill competes with primary actions.
- `node-badge-accent` (info slate blue: Concept/Event node types, `web_page` sources) and `node-badge-alt` (celadon accent-alt: source/technology badges, taking over the former purple's role per ADR-021) are type labels, not status semantics; the two cool counter-axis hues distinguish label families from the success/warning/error pills without ever reading as calls to action.
- `option-selected:hover` (fill deepened 0.06 → 0.1 while the border holds 0.55 / ≥3:1) verified: selection is carried by the 3:1 brass border and wash, hover only deepens the wash, so selected-vs-hover stays legible; unselected option cards answer hover with the warm tint ladder (`bg-overlay-hover`), never a state border below 3:1.
- Shared motion keyframes now live in `packages/ui/src/tokens.css` beside the motion tiers (additive): `morpho-overlay-in` (ease-out rise, `--morpho-motion-slow` for Dialog, base for Popover/Toast), `morpho-tooltip-in` (opacity-only fast fade, so the keyframe never overrides the tooltip's centering transform), and `morpho-progress-slide` (indeterminate Progress loop — a static full bar would read as complete). The Dialog previously referenced a `fade-in` keyframe that did not exist anywhere, so dialogs had no entrance at all.

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

### 2026-09-13 additions (ADR-021 migration)

- `border-[rgb(217_160_91/0.2)]` → JournalPage privacy note → single-site accent-alpha tint harmonizing with the note's `bg-accent-soft` face (former `rgb(114_167_255/0.2)`).
- `border-[rgb(217_160_91/0.3)]` → AssistantDock popup border (`WorkspaceLayout.tsx`) → single-site accent-alpha tint on the assistant brand surface (former `rgb(114_167_255/0.3)`).
