# Design Tokens
Define semantic CSS variables for background, surface, border, text, accent, success, warning, error, info; spacing xs 4, sm 8, md 12, lg 16, xl 24, xxl 32; typography Display/H1/H2/H3/Body/Caption/Label; radii and motion tiers. Components consume tokens; pages never hard-code values.

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

Rule: pages never hard-code colors outside `tokens.css` and `prototype.css` (ADR-013 boundary; DO_NOT_BREAK #4 — this is prototype alignment, not an arbitrary redesign).
