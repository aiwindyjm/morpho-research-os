# Page Patterns
Supported patterns: Dashboard, List, Detail, Form, Workspace, Split View, Overview. Pages use PageHeader (kicker + display title + lede + actions), optional PageToolbar, PageContent, and explicit loading/empty/error states.

Workspace shell (ADR-013): 236px sidebar — brand lockup (gradient "M" mark + Research OS eyebrow + Morpho), icon navigation (16px icon + label, active = accent-soft background + 2px accent inset line), project switcher menu (status dots with soft glow — 进行中 purple / 已暂停 orange / 草稿 gray — plus "{status} · {progress}%" labels), footer storage state (green dot + 本地工作区 / 数据保存在本机) and the settings entry. 65px topbar — breadcrumb "Morpho / {project}" (muted + strong), saved state (green dot 已保存), round help button, round local avatar. Flexible canvas with radial top glow (`main-glow`).

View registry: 10 navigation views — projects/overview/config/plan/tasks/sources/knowledge/graph/journal/settings. `reports` remains a registered ViewId but is not shown in navigation (ADR-013); timeline/gaps views are removed and absorbed into the overview page.

AI assistant: floating launcher (fixed bottom-right gradient pill `brand-gradient-button`) opening a 360×530 popup panel above it; the docked-inspector pattern and its breakpoint rules (xl dock / <1024px overlay) are removed (ADR-013). The mobile drawer (<768px) for the sidebar is retained.
