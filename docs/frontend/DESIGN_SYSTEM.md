# Frontend Design System
Dark research workspace; neutral surfaces; restrained accent colors, aligned with the product prototype (ADR-013, `docs/architecture/adr/ADR-013-align-visual-tokens-with-prototype.md`). Tokens are the only source for color, spacing, typography, radius, shadow, motion, and layout; pages never hard-code colors outside `tokens.css`/`prototype.css`.

Prototype-aligned page heading: kicker eyebrow (`.kicker`) + display h1 + lede description on the left, header actions on the right; optional toolbar row below (`PageShell`). View containers fade in on switch (`view-fade`).

Kicker eyebrow pattern: 10px/800 uppercase text-muted labels that carry section context (e.g. 「研究项目 / 运行中」 above the page title, 「当前工作区」 in the project menu, 「保存规则」 in side cards).

Badge language: status pills (`.pill` + `pill-success/warning/accent/neutral/error`) for run, task, and project states; monospace type badges (`.badge-mono` + `node-badge-accent/alt/warning/error`) for source and knowledge-node types.

Shell layout (see PAGE_PATTERNS.md): 236px brand sidebar + 65px topbar + flexible main canvas with radial glow. The docked-inspector pattern is superseded by the floating assistant launcher + 360×530 popup panel (ADR-013); pages no longer reserve inspector space.
