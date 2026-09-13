# ADR-022 Dual-Skin Token Themes ("lamplit-study" Default + "bio-luminal")

## Status

Accepted (2026-09-13，维护者指定「皮肤管理；从 Logo 艺术风格衍生一款年轻、未来感的皮肤」)

## Context

ADR-021 + Amendment 1 之后，视觉令牌是单一硬编码调色板（石墨 + 黄铜），全部颜色令牌平铺在 `packages/ui/src/tokens.css` 的 `:root` 中。两个事实推动本次变更：

- **品牌资产与 chrome 割裂**：品牌 Logo 是蓝/青/紫生物荧光的蝴蝶脑图形（深海暗场 + 荧光触角），与石墨 + 黄铜的工作台外壳气质相悖；侧栏/顶栏已改用真实 Logo 图（brand-mark 瓷砖退役），冲突更显眼。
- **维护者明确要求皮肤管理**，并在多个候选方向中选定以 Logo 艺术风格为源的第二皮肤：深海暗场、生物荧光青为主强调、紫为辅，辉光仅用于「活数据」位置（focus ring、图谱、激活态、覆盖率），绝不用于按钮填充；该皮肤整体基调为年轻/未来感。

同时，效果层（`apps/desktop/src/styles/prototype.css`）仍携带一批与黄铜/石墨绑定的字面 RGB 复合色（`.main-glow`、`.metric-accent` 角环、`.card-active-*`、`.pill-*`/`.node-badge-*`、`.option-selected`、`.dot-glow-*`、`.progress-track`、`.graph-canvas-bg`、`.pulse` 等）。换肤若只置换令牌，效果层会继续渲染旧皮肤的残影。

## Decision

1. **双皮肤令牌分层（`packages/ui/src/tokens.css`）**：结构令牌（spacing/layout/typography/radii/shadow/motion/keyframes）与皮肤无关，留在共享 `:root`（阴影色为近中性深黑，两皮肤共用）。全部颜色令牌（28 个语义位：background/surface/surface-raised/surface-sunken/border/text-primary/secondary/muted/accent/accent-soft/accent-alt/success/warning/error/info/text-on-brand/avatar-bg/avatar-ink/scrim/overlay 梯 ×4/graph-node/graph-edge ×3）由皮肤块定义：
   - **"lamplit-study"（默认）**：现值原样保留，声明在普通 `:root` 上——`data-theme` 属性缺位时也渲染正确；ADR-021 的值表不变。
   - **"bio-luminal"**：`[data-theme="bio-luminal"]` 整组覆盖同一语义位集合。`color-scheme` 两皮肤均为 dark。皮肤 id 即契约：`lamplit-study` | `bio-luminal`。
2. **"bio-luminal" 调色板**（源自 Logo；先经 WCAG 程序化复核、不达标者在色相族内调明度并记录于 `DESIGN_TOKENS.md`）：background `#0c1220`、surface `#111a2c`、surface-raised `#18243a`、surface-sunken `#090f1a`、border `rgb(148 190 235 / 0.16)`、text-primary `#e8f2ff`、text-secondary `#9fb4d0`、text-muted `#7c90ae`、accent 生物荧光青 `#53d7f5`（accent-soft `rgb(83 215 245 / 0.13)`）、accent-alt 紫 `#b8a5ff`、success `#6fdda8`、warning `#f5b04a`、error `#ff8f9e`、info `#6fa8ff`、text-on-brand `#061018`、avatar-bg/ink `#9adcf0`/`#0a1420`、scrim `rgb(4 8 16 / 0.65)`、overlay 梯 `rgb(232 242 255 / 0.02 / 0.035 / 0.06 / 0.22)`、graph-node `#142642`、graph-edge `rgb(83 215 245 / 0.3 / 0.55 / 0.75)`。青/紫为品牌豁免色（维护者 Logo），但必须与禁用清单字面量（`#3b82f6`/`#b59aff`/`#72a7ff` 等）逐个不同——禁用守卫测试长期看护，并新增「bio 品牌色 ≠ 禁用值」显式断言。对齐复核：全部文字对照 ≥4.5:1（最差 text-muted 4.78:1 于 surface-raised）；0.55 选中/激活边线复合 ≥3:1（accent 最差 3.77:1）；error 由草案 `#ff7a8a` 于鲑红族内提亮为 `#ff8f9e`（草案 0.55 边线复合在 raised 仅 2.77:1）。本皮肤登记例外：维护者明确要求年轻/未来感能量，覆盖「安静」基调——**仅对此皮肤**，lamplit-study 的静音纪律不变。
3. **效果层主题无关化（`apps/desktop/src/styles/prototype.css`）**：全部字面 RGB 复合改写为 `color-mix(in srgb, var(--morpho-color-<token>) N%, transparent)`（运行时为 Chromium/WebView2，`color-mix` 受支持）。强度百分比沿用 ADR-021 打磨波的调校值，逐类换算：`main-glow` → accent 6%；`metric-accent` 边/角环 → accent 25%/14%；`card-active-accent`/`error` → accent/error 0.55 边 + 6%/7% 平涂；`pill-*/node-badge-*` → 各语义 token 10%（`pill-neutral` → text-primary 5%）；`option-selected` → accent 0.55 边 + 6%/10%（hover 只加深底、不动边）；`dot-glow-accent/secondary/warning` → accent 11% / text-secondary 10% / warning 10%；`progress-track` → text-primary 9%；`main-glow` 同前；`pulse` → accent 8%；`graph-canvas-bg` → `color-mix(in srgb, var(--morpho-color-background) 70%, black)` 径向（各皮肤向自己的色相加深）；`brand-gradient-button` 阴影保持共享中性 `rgb(5 5 5 / 0.4)`（该层唯一遗留字面量，由守卫测试钉住）。
4. **FOUC 内联脚本（`apps/desktop/index.html`）**：`<head>` 内、模块脚本之前，读取 `localStorage["morpho.theme"]`，命中白名单（`lamplit-study` | `bio-luminal`）则写 `document.documentElement.dataset.theme`，否则回退 `lamplit-study`；≤10 行、零依赖。
5. **持久化定位**：皮肤是浏览器本地 UI 偏好（journal 先例），纯前端实现——无 IPC/schema/迁移变更；设置项切换器由后续波次交付（见 Consequences）。

## Alternatives

- **仅置换 accent 换取「未来感」**：单一调色板继续与 Logo 割裂，且皮肤管理诉求未满足。
- **效果层为每个皮肤写一套规则**：类名/规则数翻倍，每次调色双写，违背效果层「只引用令牌、不定义颜色」的职责边界（ADR-013）。
- **CSS-in-JS / 运行时主题对象**：引入新依赖与样式通道，破坏令牌文件即唯一事实源的治理（ADR-013/021），且无法参与 FOUC 前渲染。
- **`prefers-color-scheme` 自动切换**：两皮肤都是 dark，媒体查询无信号；皮肤是品味偏好而非系统状态。

## Consequences

消费方（组件/页面/Tailwind 工具类）零改动：`app.css` 的 `@theme` 绑定引用的是令牌名，值随 `data-theme` 级联自动切换。`tokens.test.ts` 重构为逐皮肤值钉 + 「两皮肤语义位集合一致」结构守卫；`prototype.test.ts` 钉 color-mix 形态 + 百分比，并新增「效果层无裸色字面量（唯一例外共享阴影）」守卫。`DESIGN_TOKENS.md` 改为逐皮肤值表 + 审计记录。后续波次：设置页皮肤切换器（读/写 `morpho.theme`、同步 `dataset.theme`）。主题 id（`lamplit-study`/`bio-luminal`）、localStorage 键（`morpho.theme`）、应用机制（`document.documentElement.dataset.theme`）、默认值（`lamplit-study`）自本 ADR 起为公共契约，切换器实现必须与其一致。E2E 默认皮肤不受影响。明确范围外：皮肤切换 UI、皮肤级动效差异、亮色模式。
