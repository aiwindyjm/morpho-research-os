# ADR-023 前端国际化（i18next + react-i18next，zh-CN 默认 + en）

## Status

Accepted (2026-09-13，维护者指定「产品开源、面向更广受众，前端需要国际化」)

## Context

V0.1 前端的全部用户可见文案硬编码为简体中文（夹杂少量英文片段，如切换器副标题 "Research project"）。开源后社区受众不再限于中文用户，维护者明确要求国际化。三个既有事实约束方案：

- **既有测试全部断言中文文本**：apps/desktop vitest 221 个断言、Playwright 11 个 spec、packages/ui 59 个测试都以中文 DOM 文本/可访问名查询。默认渲染语言必须保持简体中文，既有断言一个都不改。
- **本地优先**：应用必须完全离线可用，i18n 资源不能走网络/CDN 加载。
- **前端无全局状态框架之外的运行时**：主题偏好（ADR-022）已经确立了「localStorage 键 + 白名单 + `<html>` 属性镜像 + FOUC 内联脚本」的本地偏好模式，语言偏好应当复用同一模式而非引入新机制。

## Decision

1. **库选型（`apps/desktop`）**：`i18next` + `react-i18next`（生态标准、维护活跃、按命名空间组织资源、插值/回退内建，`useTranslation` 与 React 渲染天然集成）。拒绝的备选：react-intl（更重，FormatJS 工具链面向消息抽取工作流，本项目规模收益为负）；手写 Context/Switch（无法承载复数、插值、命名空间、回退链，不可扩展）。
2. **资源打包**：全部资源以 TS 模块内联打包（`src/i18n/locales/{zh-CN,en}/<ns>.ts` → `resources.ts` 汇总），零网络请求，jsdom 中同步、确定性初始化。**zh-CN 是参照语言**：其字符串即抽取前的界面原文（逐字节一致），同时是 i18next `fallbackLng`——en 暂缺某个键时回退渲染中文而非裸键。
3. **语言解析阶梯（`src/i18n/index.ts` 的 `getInitialLanguage`，不用 i18next-languageDetector 插件）**：持久化 `localStorage["morpho.lang"]`（白名单 `zh-CN` | `en`，非法值跳过）→ 否则 `navigator.language` 以 "zh" 开头 → `zh-CN` → 否则 `en`。约 10 行、可单测，与 themeStore 的 `getInitialTheme` 同构。应用机制：`i18n.changeLanguage(id)` + `document.documentElement.lang`；`index.html` 增加 ≤10 行 FOUC 内联守卫（镜像同一阶梯）保证首绘前 `<html lang>` 正确。
4. **语言偏好 store（`stores/languageStore.ts`）**：沿用 ADR-022 themeStore 模式（白名单守卫 + 显式持久化 + 模块初始化时镜像 `<html lang>`）；副作用（实例/DOM/存储）集中在 `@/i18n` 模块的 `setLanguage`，store 只镜像响应式 id，三者不会漂移。设置页外观主题卡内新增「语言」行：注册原语 SegmentedControl（简体中文 / English，选项名为各语言自称、不做翻译），即时生效、持久化，radiogroup 无障碍契约来自原语。
5. **键约定**：按界面划分命名空间——`common`（跨页面共享句式：加载/错误/重试）、`shell`（app/layout 外壳与 `WORKSPACE_VIEWS` 导航标签）、后续视图各自注册（`projects`、`tasks`…）。`WORKSPACE_VIEWS.label` 存 i18n 键（如 `"shell:nav.plan"`），store 保持 data-only，Sidebar/WorkspaceLayout 渲染时 `t()` 翻译；视图 id/testid 不变。动态值用插值（`{{percent}}`、`{{view}}`、项目名等来自用户数据的名值只插值、永不翻译）。
6. **测试语言钉死**：vitest（`vitest.setup.ts`）在任何应用模块求值前写 `localStorage["morpho.lang"]="zh-CN"` 并 `defineProperty` 钉死 `navigator.language(s)`，再动态 import 初始化 i18n（静态 import 会提升到钉死语句之前）；Playwright（`playwright.config.ts`）`use.locale = "zh-CN"`。所有既有中文断言因此零改动通过。
7. **范围切分**：本 ADR 落地基础设施 + 外壳抽取作为参照范式（Topbar、Sidebar、ProjectSwitcher、WorkspaceLayout/AssistantDock、PageStates 共享句式、workspaceStore 标签键化、设置页语言行）；其余特性视图的文案抽取由后续波次按同一范式完成。新组件一律直接写键，不再硬编码文案。

## Alternatives

- **react-intl / FormatJS**：运行时更重，消息抽取/编译流水线对当前规模是纯成本；ICU 复数等能力远超需求。
- **手写语言 Context**：无回退链、无命名空间、无插值规范，每个组件自行拼字符串，规模化即失控。
- **i18next-languageDetector 插件**：检测逻辑只有三级阶梯，插件引入额外依赖面与黑盒行为；显式函数可单测、与 themeStore 对称。
- **语言资源走网络/懒加载**：违背本地优先（离线首启即需完整 UI）；桌面包体对几十 KB JSON 不敏感。
- **默认语言随 navigator 即时切换（不保留 zh-CN 默认）**：会破坏全部既有中文断言与维护者当前工作流；解析阶梯已让中文浏览器用户无感，非中文用户显式切换一次即可持久化。

## Consequences

外壳全部用户可见文案经 `t()` 输出，zh-CN 渲染与抽取前逐字节一致（含中文标点与既有英文片段），既有 vitest 221 断言、Playwright 11 spec、packages/ui 59 测试零改动通过。后续视图接入成本 = 一个资源文件对 + `useTranslation` 一行（配方见 `src/i18n/resources.ts` 注释与 COMPONENT_REGISTRY.md）。语言键 `morpho.lang`、语言 id 白名单（`zh-CN` | `en`）、解析阶梯、`<html lang>` 应用机制、命名空间约定自本 ADR 起为公共契约。明确范围外：fixture **数据**保持中文（那是内容不是 chrome，随数据契约走）；RTL 不支持；仓库级文档维持中英双语现状；AssistantPanel 等特性视图文案属后续波次。
