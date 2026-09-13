# ADR-014 Adopt shadcn/ui and React Router

## Status

Proposed（2026-09-12）——等待维护者批准（awaiting maintainer ratification）。

## Context

基线修正：维护者于 2026-09-12 修正了 `AGENTS.md`，明确前端目标栈为 shadcn/ui + Tailwind CSS + React Router + Zustand + TanStack Query（React 18+/TypeScript/Vite）。书面基线其实早已如此——`docs/PRD.md`（技术栈表）与 `docs/architecture/TECH_STACK.md` 的 Styling 行均已写明「Tailwind CSS + shadcn/ui」。

但实现发生了漂移：在原型对齐（ADR-013）过程中，组件基础落在了自研 primitives 上（`packages/ui/src/primitives/`：Button/inputs/overlays/display），而非 shadcn/ui；导航则是自定义类型化 view registry（`apps/desktop/src/app/viewRegistry.tsx`）+ `stores/workspaceStore.ts` 的 `activeView`，以条件渲染切换视图，未引入任何 router（`viewRegistry.tsx` 与 `workspaceStore.ts` 中「V0.1 不引入 router」的注释即基于旧基线，本 ADR 将其取代）。

同时出现了新的行为需求：视图切换时保留定义好的临时 UI 状态，且在项目锁定、权限撤销、版本失效时主动清除。这在条件渲染式视图切换下很难满足——今天每次切换视图都会卸载页面组件，本地状态随之丢失。

## Decision

1. **采用 shadcn/ui 作为组件基础**（Radix primitives + cva + clsx + tailwind-merge，`components.json` 管理生成组件，`cn()` 工具函数统一类名合并）。Morpho token 体系（`packages/ui/src/tokens.css` 的 `--morpho-*`）**仍是唯一视觉事实源**：shadcn 组件的 CSS 变量（`--background`/`--foreground`/`--primary`/`--radius` 等）在 `apps/desktop/src/styles/app.css` 中映射到 `--morpho-*` token，不引入第二套颜色/圆角体系（延续 ADR-013 的 token 纪律）。

2. **采用 React Router（v7 library mode，data router 可选）**替换自定义 view registry。view registry 的类型化 `{id, label, icon}` 表（`WORKSPACE_VIEWS`）成为路由表的生成源，信息架构与导航文案保持单一来源；`reports` 仍为合法路由但不进侧栏导航（PRD §13 注册表不破坏，沿用 ADR-013 结论）。

3. **视图切换改为路由挂载 + 显式 keepAlive 清单**：按路由定义哪些临时 UI 状态在切换后保留。默认：过滤/搜索/草稿类状态存入按视图键控的 Zustand slice，跨切换保留；图谱选中态保留；项目切换则什么都不保留——这一语义已由 `WorkspaceLayout` 的 `key={activeProjectId}` 重挂载强制执行，予以保留。被项目锁定、权限撤销、版本失效所失效的状态必须主动清除。

## Alternatives

- 保留自研 primitives：否决——双组件体系分裂维护成本，且违反 PRD/TECH_STACK/AGENTS.md 一致写明的基线。
- TanStack Router：否决——相比基线措辞（React Router）生态契合度更低；对固定 11 视图的信息架构而言其类型安全优势边际收益有限。
- 全视图 `display:none` 式 keep-alive：否决——d3 图谱与全部 10 个页面常驻挂载，内存代价高，且埋下事件/监听器泄漏隐患。

## Consequences

迁移分四个阶段，每阶段独立可验证：

- **Phase 1**：新增依赖（react-router-dom、@radix-ui/react-dialog、@radix-ui/react-popover、@radix-ui/react-tooltip、@radix-ui/react-slot、class-variance-authority、clsx、tailwind-merge）、`components.json` 与 `cn()` 工具。无行为变化；验收：构建与既有测试全绿。
- **Phase 2**：在 `app.css` 将 shadcn CSS 变量映射到 `--morpho-*` token；逐个等价替换 primitives，公开 props 与测试保持不变。`packages/ui` 保留至零消费方后废弃。验收：与原型基线逐页视觉核对 + 既有 101 项测试套件 + testid 不回归。
- **Phase 3**：registry → routes 切换，落地 keepAlive 清单，临时 UI 状态迁入按视图键控的 Zustand slice。验收：按清单验证切换保留/清除语义；项目切换仍全量清除；锁定/撤销/失效的主动清除可验证。
- **Phase 4**：删除遗留 primitives 与 view registry。验收：无残留引用，文档同步更新。

风险：primitives 替换期的视觉一致性（以 token 映射 + 既有测试套件 + testid 缓解）；Radix 带来的包体积增长（小且可 tree-shake）；无已知 Radix/React 18 peer 依赖冲突。

W2-05（Tauri IPC）不受影响：本决策仅涉及前端呈现与导航层，不改 IPC/事件契约、worker 协议或持久化语义。
