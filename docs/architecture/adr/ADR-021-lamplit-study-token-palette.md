# ADR-021 Adopt the Lamplit Study ("深夜研究室") Warm-Dark Token Palette

## Status

Accepted (2026-09-13)

## Context

反模式审计（app-ui-ux-best-practices 技能 `anti-patterns.md`）发现当前视觉令牌值踩中多条明令禁止的组合：

- **Tailwind 默认蓝 `#3b82f6` 直接作为 primary**（`--morpho-color-accent`），属于"习惯性取默认色"而非从品牌推导；
- **蓝 + 紫组合**：accent 蓝（`#72a7ff`/`rgb(114 167 255 …)`）与 accent-alt 紫（`#b59aff`）配对，是反模式清单点名的 AI 生成签名（"Blue + Purple pairing (primary + secondary)"，无论比例如何一律禁止）；
- **渐变按钮与渐变进度条**：`brand-gradient-button`（`linear-gradient(135deg, #315fae, #7250b8)` 蓝紫渐变）与 `progress-fill`（accent→accent-alt 渐变）命中"High-contrast gradient buttons (purple-to-blue …)"禁用项；
- **单色相家族**：背景、面、边、文字全部落在蓝相（`#0b0f17`/`#111722`/`#1b2433` 家族），是安静的"one-note blue family"收敛模式。

维护者于 2026-09-13 的设计咨询中在多个方向里选定了方向 B「深夜研究室」（Raycast/Things 3 dark 一族的暖黑纸面工作台：暖石深底 + 黄铜强调 + 青灰绿反相辅色），设计规格见本地规格 `docs/superpowers/specs/2026-09-13-lamplit-study-redesign.md`（方向 B 选择日期 2026-09-13）。本 ADR 将该选择登记为 Accepted 并承载其公开内容。

与 ADR-013 的关系：沿用其先例——**语义名与令牌结构不变，仅值置换**；本 ADR 取代 ADR-013 的值表（Decision §1 及 Decision §2 中随原型批准的复合色值），ADR-013 的其余内容继续有效：语义令牌名与结构、效果层的职责边界（不定义新颜色体系）、alpha tint 规则（Decision §2 的治理条款）、信息架构（§3）与浮动助手（§4）均不在本次范围。

## Decision

1. **语义令牌值整体置换为暖石深底 + 黄铜强调**（`packages/ui/src/tokens.css`；核心面色相约 28–32°，禁紫相）：

   | Token | 新值 | 说明 |
   |---|---|---|
   | `--morpho-color-background` | `#17130f` | 暖石黑壳层 |
   | `--morpho-color-surface` | `#1f1a15` | 面板 |
   | `--morpho-color-surface-raised` | `#292219` | 浮起卡/悬浮层 |
   | `--morpho-color-surface-sunken` | `#120e0b` | 侧栏深面 |
   | `--morpho-color-border` | `rgb(222 200 172 / 0.14)` | 羊皮纸发丝线 |
   | `--morpho-color-text-primary` | `#f2ebe0` | |
   | `--morpho-color-text-secondary` | `#b3a695` | |
   | `--morpho-color-text-muted` | `#988a78` | 规格值 `#8a7e6d` 的对比度驱动提亮（见 §3） |
   | `--morpho-color-accent` | `#d9a05b` | 黄铜；品牌色 ≤12% 表面 |
   | `--morpho-color-accent-soft` | `rgb(217 160 91 / 0.12)` | 同三模 alpha |
   | `--morpho-color-accent-alt` | `#7fa5a3` | 石板青，接管原紫 `#b59aff` 的角色位（来源/技术 badge、add-chip） |
   | `--morpho-color-success` | `#8fbf7f` | 叶绿 |
   | `--morpho-color-warning` | `#cf7d54` | 陶土橙 |
   | `--morpho-color-error` | `#d47676` | 沉绛红（规格值 `#c96a6a` 的对比度驱动提亮，见 §3） |
   | `--morpho-color-info` | `#8ca6bf` | 石板蓝；限定 info 语义，不作主强调 |
   | `--morpho-color-text-on-brand` | `#1c1207` | 深墨——黄铜底上的字由亮字改深字 |

   扩展令牌：`--morpho-color-avatar-bg`/`avatar-ink` = `#c9ab7c`/`#1c1207`；`--morpho-color-scrim` = `rgb(10 6 3 / 0.62)`；overlay 梯从纯白改暖白 `rgb(242 235 224 / 0.02 / 0.035 / 0.06 / 0.22)`；`--morpho-color-graph-node` = `#2b241c`；`--morpho-color-graph-edge`/`hover`/`active` = `rgb(217 160 91 / 0.28 / 0.55 / 0.75)`。圆角 6/8/12 与全部布局/字号/动效令牌不变（SOFT 圆角哲学保留）；阴影改暖黑 `--morpho-shadow-panel: 0 18px 45px rgb(15 9 4 / 0.35)`、`--morpho-shadow-overlay: 0 20px 50px rgb(15 9 4 / 0.5)`（`app.css` 的 `@theme` 影子绑定同步）。

2. **效果层（`apps/desktop/src/styles/prototype.css`）逐类置换，类名一律不改**（消费者不动）：
   `brand-mark` 改黄铜微渐变瓦片 `linear-gradient(145deg, #e0b06b, #c8914e)` + 深墨 "M"（背景渐变允许，按钮渐变不允许）；`main-glow` 改 `rgb(217 160 91 / 0.06)` 极弱台灯暖光；`metric-accent` 去渐变依赖，改 accent-soft 同色调面 + 黄铜角环；`progress-fill` 改纯黄铜实色（渐变进度条为禁用组合）；`brand-gradient-button` 改纯黄铜实底 + 深墨字（`text-on-brand` token 自动跟随）+ 暖黑阴影，类名保留；`graph-canvas-bg` 改 `radial(#141009 → background token)` 暖暗幅；`dot-glow-accent/secondary/warning` 改黄铜 / 暖中性 `rgb(242 235 224 / 0.4)` / 陶土；`chip-selected` 改黄铜字 + `rgb(217 160 91 / 0.55)` 边 + accent-soft 底；`option-selected` 改黄铜系（边 0.55、底 0.06，hover 加深底至 0.1 而非放松边线）；`card-active-accent`/`card-active-error` 改 3:1 实色状态边（0.55）+ 平涂同色洗；`pill-*`/`node-badge-*` 按新 success/warning/info（石板蓝）/accent-alt（青）/error 映射；`pulse` 改黄铜光圈；`kicker`/`view-fade`/`timeline-connector` 值随 token 自动跟随。

3. **对比度程序化复核与两处明度微调**（规格值先经 WCAG 2.x 计算验证，不达标者在色相族内提亮并记录于 `DESIGN_TOKENS.md`）：
   - `text-muted`：规格 `#8a7e6d` 在 surface 4.34:1、surface-raised 3.95:1（<4.5:1）→ 提亮为 `#988a78`（四面对照最差 4.67:1）。
   - `error`：规格 `#c96a6a` 在自身 pill tint 上 4.19:1、surface-raised 4.30:1（<4.5:1）→ 提亮为 `#d47676`（全部用途 ≥4.78:1）。
   - 其余文字对照全部 ≥4.5:1（最差者 info 6.22:1 于 surface-raised）；选中/激活态边线统一 0.55 alpha 以满足 UI 组件 ≥3:1（0.45/0.4 复合后仅 2.56/2.29:1）；发丝线 border（0.14，≈1.37:1）为装饰性分隔线，不承载状态，按 WCAG 1.4.11 豁免。

4. **一次性字面量迁移**：页面中 token 派生 alpha tint `rgb(114_167_255/*)` 仅两处——JournalPage 隐私提示边线（`0.2`，accent 语义，配合其 `bg-accent-soft` 面）与 AssistantDock 弹出层边线（`0.3`，助手品牌面）——均迁移为 `rgb(217_160_91/*)`。ADR-013 批准的一次性字面量（侧栏底、头像、品牌文字、图谱节点）此前已晋升为具名 token，本次直接随新值走，不再以字面量存在。反模式禁项（默认蓝、蓝+紫、渐变按钮、紫相深底、霓虹辉光、纯黑底）由 `packages/ui/src/tokens.test.ts` 与 `apps/desktop/src/styles/prototype.test.ts` 的禁用值守卫测试长期看护。

## Alternatives

- **仅替换 accent、保留蓝相深底**：成本最低，但单色相蓝底仍是 one-note 收敛模式，且与暖石底 + 黄铜的选定方向不符。
- **推倒重来引入新令牌名/新结构**：破坏 ADR-013 建立的语义名契约与全部既有消费方，违反「语义名不变仅值变更」先例。
- **保留渐变品牌按钮/进度条仅换色相**：渐变按钮本身是禁用组合（与色相无关），不成立。

## Consequences

消费方（组件/页面）只受令牌值变化影响：语义类名、Tailwind 工具类、effect-layer 类名、IPC/契约全部不变。两处页面 alpha tint（JournalPage、WorkspaceLayout）与 `app.css` 阴影绑定随本役同步。`DESIGN_TOKENS.md` 值表与批准字面量清单已按新现实更新；值断言类测试（新增 `tokens.test.ts`/`prototype.test.ts`）钉住新值。明确范围外（记录不实施）：字体维持系统栈（emfont 引入留待专项 ADR）；IA/导航外壳不动（PRD §12）；ADR-014（shadcn 迁移）独立推进；组件 8 态与动效细则、Playwright 截图人工审查属后续打磨波次。视觉验收以反模式清单逐条核对 + 对比度程序化复核为准。

## Amendment 1 — Neutral graphite surfaces (2026-09-13, Accepted)

维护者在浏览器中评审第一刀实现后否定了观感：面层全部带明显棕色相、层间过近、文字偏米褐，整体呈"棕褐泥/旧照片滤镜"，恰好落入反模式清单的 one-note 暖棕收敛（本 ADR §1 明令规避的单色相失败，辅色轴占比过低不足以对冲）。修正：**暖意集中于黄铜强调色，面层族彻底转中性石墨**——语义名、令牌结构、效果层类名全部不变，仅值再置换：

| Token | cut 1（已废） | Amendment 1 |
|---|---|---|
| `--morpho-color-background` | `#17130f` | `#131312` |
| `--morpho-color-surface` | `#1f1a15` | `#1b1b19` |
| `--morpho-color-surface-raised` | `#292219` | `#242422` |
| `--morpho-color-surface-sunken` | `#120e0b` | `#0e0e0d` |
| `--morpho-color-border` | `rgb(222 200 172 / 0.14)` | `rgb(228 226 220 / 0.12)` |
| `--morpho-color-text-primary` | `#f2ebe0` | `#f2f1ee` |
| `--morpho-color-text-secondary` | `#b3a695`（米褐） | `#a8a5a0`（中性灰） |
| `--morpho-color-text-muted` | `#988a78` | `#8f8c85`（最差 4.63:1） |
| `--morpho-color-avatar-bg` / `ink` | `#c9ab7c` / `#1c1207` | `#b8b3a8` / `#21201d` |
| `--morpho-color-scrim` | `rgb(10 6 3 / 0.62)` | `rgb(5 5 5 / 0.6)` |
| overlay 梯 | `rgb(242 235 224 / …)` | `rgb(242 241 238 / …)` |
| `--morpho-color-graph-node` | `#2b241c` | `#232320` |
| 阴影 | `rgb(15 9 4 / …)` | `rgb(5 5 5 / …)`（中性深黑） |

accent/accent-soft/accent-alt/success/warning/error/info/text-on-brand 不变。效果层同步：`graph-canvas-bg` 径向 `#141009`→`#111110`，阴影与 tint 梯字面量随上表。对比度复核：全部文字对照 ≥4.63:1（最差 muted 于 raised），UI 组件 ≥3:1 不变。本节取代上文 Decision 中的表值；其余决策（语义名不变、类名契约、禁项守卫、范围外清单）继续有效。
