# Morpho Desktop（前端工作台）

多项目研究工作台的前端应用（工作组 B 首轮构建）。技术栈：React 19 + TypeScript +
Vite + Tailwind CSS 4 + Zustand（本地 UI 状态）+ TanStack Query（异步状态）+ Zod
（校验）+ D3（2D 图谱）。

## 启动命令

```bash
# 1) 安装 UI 组件包（设计 Token 与原语）
cd packages/ui
pnpm install

# 2) 安装并启动桌面前端（Mock 数据，无需 API Key 与网络）
cd ../../apps/desktop
pnpm install
pnpm dev          # 开发服务器
pnpm test         # Vitest 单元/组件测试
pnpm typecheck    # TypeScript 检查
pnpm build        # 生产构建
```

`@morpho/ui` 通过 pnpm `link:` 协议连接到 `packages/ui`；待工作组 A 建立根
Workspace（W0-06）后，此关系会并入统一工具链。

## 架构边界

- `src/services/` 是前端唯一的服务边界：类型化 Command Map、统一信封
  `{schema_version, request_id, data, error}`（docs/API.md）、结构化错误模型
  （docs/api/ERRORS.md）。组件不直接调用任何后端。
- 当前只有 Mock Transport（`src/services/mocks/`），数据为与文档 Schema 一致的
  确定性 Fixture，响应经 Zod 注册表校验。真实 Tauri IPC 在 W2-05 契约冻结后接入
  `transportProvider.ts`，不改动任何调用方。
- 状态：`src/stores/workspaceStore.ts`（当前项目、视图、布局）；项目切换会更换
  全部 Query Key，因此配置、计划、任务、助手上下文严格按项目隔离。
- 覆盖度/缺口投影当前由 Mock 服务按 docs/PRD.md §14 的公式实现；真实投影属于
  后端（Rust/Worker），前端只负责可解释展示。

## 首轮能力

项目列表/创建/切换、研究配置表单、计划审查（编辑/批准/拒绝/重新生成）、任务
DAG 模拟运行（暂停/恢复/重试/取消、脚本化失败与重试）、来源/知识/论断查看
（证据定位与冲突共存）、D3 2D 图谱（搜索/过滤/选择/Inspector/列表降级）、
时间线、覆盖度与缺口（建议需用户批准）、项目级 AI 助手（解释进度、建议下一
任务、查看待审核、显式保存决定）。

所有核心页面提供 Loading / Empty / Error / Keyboard / Responsive 状态；
测试运行完全离线，不使用真实 Provider、API Key、网络或私有数据。
