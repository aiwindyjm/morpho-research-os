# ADR-013 Align Visual Tokens With Product Prototype

## Status

Accepted(2026-09-12)

## Context

用户评审后判定:当前 React/Tauri 前端在信息架构与视觉语言上与 `prototype/` 产品原型差距显著——整体视觉为扁平化深色,而原型是精致的深色研究工作台(渐变品牌标、光晕、kicker 层级、状态 pill 等)。用户批准按原型做完整对齐:信息架构 + 视觉全面对齐,数据交互逻辑全部复用现有 queries/mocks/服务,不改 WG-A 冻结契约、不改 worker/IPC。设计细节见 `docs/superpowers/specs/2026-09-12-prototype-alignment-design.md`。

## Decision

1. **设计 tokens:语义名不变,仅值对齐原型**(`packages/ui/src/tokens.css`)。`--morpho-color-background: #0b0f17`、`--morpho-color-surface: #111722`、`--morpho-color-surface-raised: #1b2433`、`--morpho-color-border: rgb(176 191 215 / 0.13)`;文字三档 `--morpho-color-text-primary: #e8edf5`、`--morpho-color-text-secondary: #8490a5`、`--morpho-color-text-muted: #606b80`;`--morpho-color-accent: #3b82f6`、`--morpho-color-accent-soft: rgb(114 167 255 / 0.11)`、新增 `--morpho-color-accent-alt: #b59aff`(紫,用于来源/技术徽章、add-chip);`--morpho-color-success: #62d0a3`、`--morpho-color-warning: #efaa65`、`--morpho-color-error: #ed7788`、`--morpho-color-info: #72a7ff`;圆角 `--morpho-radius-sm/md/lg` = 6/8/12px;阴影 `--morpho-shadow-panel: 0 18px 45px rgb(0 0 0 / 0.18)`、`--morpho-shadow-overlay: 0 20px 50px rgb(0 0 0 / 0.38)`。`apps/desktop/src/styles/app.css` 的 `@theme` 同步绑定 `--color-accent-alt` 与新阴影值。这是对齐原型,不是任意重设计(不违反 DO_NOT_BREAK #4)。

2. **新增 `apps/desktop/src/styles/prototype.css` 原型效果层**。仅承载 Tailwind 工具类无法简洁表达的视觉效果:渐变品牌标(`brand-mark`)、accent 指标卡光晕(`metric-accent`)、主区径向光晕(`main-glow`)、图谱径向画布(`graph-canvas-bg`)、launcher 渐变按钮(`brand-gradient-button`)、渐变进度条(`progress-track`/`progress-fill`)、时间线虚线连接线(`timeline-connector`)、fade-in 视图切换动画(`view-fade`)、kicker 文字样式(`.kicker`)与状态 pill/badge 工具类。边界:效果层不定义新颜色体系,颜色一律引用 tokens;页面不得绕过 tokens 硬编码颜色;页面样式仍以 Tailwind 工具类为主,prototype.css 只做补充。

3. **信息架构对齐原型**(view registry,后续任务实施)。侧栏导航恰为原型 10 项:projects/overview/config/plan/tasks/sources/knowledge/graph/journal/settings;`timeline`、`gaps` 从导航移除,其查询、领域类型、服务全部保留,内容并入概览页;`reports` 保留为合法 ViewId(PRD §13 注册表不破坏)但不进侧栏导航。

4. **AI 助手改为浮动形态**。删除停靠 inspector(含 <1024px overlay 与 xl dock 两种形态),改为右下角浮动 launcher(渐变胶囊)+ 弹出面板;消息逻辑复用现有 `AssistantPanel` 的实现。

## Alternatives

- 整体移植原型类名系统:违反「复用注册组件与 tokens」规则,形成双样式体系。
- 纯 Tailwind 任意值:渐变/光晕栈成为不可维护的类名泥潭,削弱 tokens 纪律。

## Consequences

消费方(组件/页面)只受 token 值变化影响,语义类名与 Tailwind 工具类不变,后续视觉重做任务可逐步消费新 tokens 与效果层类名。视觉验收以 `prototype/index.html` + `prototype/styles.css` 为基线逐页核对。对话日志等浏览器本地存储用法遵循 DO_NOT_BREAK #11/#12,不进入 Git。
