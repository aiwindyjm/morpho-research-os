# AI 并行开发计划

这是 Morpho Research OS 的统一执行计划，面向项目维护者和多个 AI Coding Agent。它把架构阶段拆成可以并行分派、独立验收、逐步合并的小任务。本文件不包含个人日期、私有批次、未公开的发布顺序或对话内容。

## 使用方式

维护者是产品负责人和最终审查者。AI 只有在依赖任务完成、规范明确时才能接取任务。修改前必须阅读 `AGENTS.md`、`DO_NOT_BREAK.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、本计划和任务对应的局部规范。

每个任务只交付一个可审查结果。AI 必须报告任务 ID、变更文件、验收检查、已知限制和后续任务。测试通过、文档同步、没有无关修改，才算任务完成。

开发顺序、批次、时间安排和个人笔记属于 `private/`，不得复制到 GitHub Issue、Commit、PR、Release、Prompt 或 Telemetry。

## 并行开发规则

1. 一个任务负责一个目录或明确列出的文件集合。两个 AI 不得同时修改同一文件。
2. 契约先于实现。如果任务需要新增 Schema、IPC 字段、Worker 消息、Provider 接口、Migration 或 Design Token，必须先提出契约变更。
3. 每个任务使用独立分支或 Worktree，并创建一个范围明确的 PR。维护者按依赖顺序合并。
4. 并行任务可以读取已经完成的契约，但不得自行发明第二套契约。
5. 集成任务必须串行执行，负责冲突处理、完整质量检查和规范更新。
6. 未经 ADR，不得新增框架、状态库、数据库、队列、Agent Framework 或 Provider。
7. 测试必须使用 Mock 和 Fixture。真实 Provider、API Key、私有对话和个人研究资料不得进入 CI 或公开产物。

## 给其他 AI 的任务包格式

复制下面的结构到 Issue 或本地交接记录中，验收条件必须具体。

```text
任务 ID：
目标结果：
工作范围：
允许修改的文件/目录：
修改前必须阅读：
依赖任务：
明确不做的内容：
验收检查：
需要更新的文档：
交接说明：
```

如果依赖没有完成，AI 不得扩大范围。它应该返回阻塞问题或契约提案，而不是自行补造架构。

## 依赖关系图

```text
W0 契约与仓库基线
 ├── W1-A 前端基础
 ├── W1-B Rust Core 基础
 ├── W1-C Python Worker 基础
 └── W1-D 测试、Mock 与 Fixture 基础
          ↓
W2 跨边界契约与适配器
          ↓
W3 研究流程垂直切片
 ├── Planner
 ├── Task DAG
 ├── Search 与 Source Evaluation
 ├── Knowledge Normalization
 ├── Vault Writer
 └── Graph Projection
          ↓
W4 完整本地流程集成与发布加固
```

W0 完成后，四条 W1 泳道可以并行。契约冻结后，W3 也可以部分重叠：Planner 与 DAG 可以并行；Worker/Provider 契约完成后，Search 与 Extraction 可以并行；有标准 Knowledge Fixture 后，Vault 与 Graph 可以并行。W4 必须串行，因为它验证完整用户旅程。

## 工作包与小任务

### W0：契约与仓库基线

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `W0-01` | 确认仓库所有权图和模块边界 | 无 | 仓库结构文档与边界文档一致；不添加业务代码 |
| `W0-02` | 建立统一 Schema 包布局 | `W0-01` | `packages/schemas/` 有版本化 JSON Schema 约定和校验说明 |
| `W0-03` | 建立版本与兼容性元数据 | `W0-01` | 根目录 `VERSION`、Schema、Worker Protocol、Vault Schema 策略有说明 |
| `W0-04` | 建立质量门禁和离线测试框架 | `W0-01` | CI 能运行格式、Lint/Type、契约和 Mock 测试 |
| `W0-05` | 建立 Fixture 命名和 Golden Result 约定 | `W0-02`, `W0-04` | Fixture 格式有文档，至少一个离线 Fixture 可校验 |

### W1-A：前端基础

负责 `apps/desktop` 前端和 `packages/ui`。前端不得访问 SQLite、文件、Secrets 或 Worker Process。

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `UI-01` | 创建 React/Vite/Tailwind 应用壳 | `W0-01`, `W0-04` | 应用可本地启动，有类型化入口，不包含业务流程 |
| `UI-02` | 实现 Design Token 和注册组件原语 | `UI-01` | 组件测试通过；页面不硬编码 Token |
| `UI-03` | 实现应用布局和导航壳 | `UI-02` | 核心路由具有 Loading、Empty、Error、Responsive、Keyboard 状态 |
| `UI-04` | 建立类型化 IPC/Query 服务边界 | `UI-01`, `W0-02` | UI 只调用类型化服务；架构检查禁止直接后端导入 |
| `UI-05` | 添加紧凑的上下文 AI Assistant 壳 | `UI-02`, `UI-03` | Assistant 绑定项目，有显式保存动作，不包含 Provider/持久化逻辑 |

### W1-B：Rust Core 基础

负责 Tauri Rust Core 路径。

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `RUST-01` | 创建 Tauri Command 和结构化 Error 骨架 | `W0-02`, `W0-03` | 类型化 Command Result 和稳定 Error Code 有单元测试 |
| `RUST-02` | 增加 SQLite 连接和编号 Migration Runner | `RUST-01`, `W0-03` | 新数据库和升级路径通过集成测试 |
| `RUST-03` | 增加 Repository Transaction 边界 | `RUST-02`, `W0-02` | 事务、外键和幂等行为有测试 |
| `RUST-04` | 增加 OS Keychain/Configuration 边界 | `RUST-01` | 只保存 Secret 引用；Fake Keychain 测试证明不会记录密钥 |
| `RUST-05` | 增加 Worker Supervisor 生命周期骨架 | `RUST-01`, `W2-02` | 使用 Fake Worker 测试启动、健康检查、重启、取消和关闭 |

### W1-C：Python Worker 基础

负责 `apps/research-worker`。Worker 不得直接写 Vault 或修改 UI 状态。

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `PY-01` | 创建 Python 包和配置边界 | `W0-02`, `W0-03` | `pytest` 可以导入；配置不包含原始密钥 |
| `PY-02` | 实现版本化健康检查和版本接口 | `PY-01`, `W2-02` | `/health` 和 `/version` 返回兼容响应 |
| `PY-03` | 实现 JSONL/SSE Event 原语 | `PY-02`, `W2-02` | Event 有序、追加式、可重连且经过脱敏 |
| `PY-04` | 创建 Orchestrator 和 Worker 接口骨架 | `PY-01`, `W0-02` | Planner/Search/Extraction/Validation/Writer 接口有 Mock |
| `PY-05` | 创建 Provider 接口和 Mock Adapter | `PY-04`, `W2-03` | Mock LLM/Search/Embedding 覆盖超时、重试和用量记录 |

### W1-D：测试、Mock 与 Fixture 基础

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `TEST-01` | 定义跨语言 Fixture Envelope | `W0-02`, `W0-05` | Rust、Python、TypeScript 能读取同一 Fixture ID 和 Schema Version |
| `TEST-02` | 添加 Mock Provider 场景 | `W0-04` | 成功、非法 JSON、超时、认证失败、重试耗尽均可重复 |
| `TEST-03` | 添加契约和架构检查 | `W0-02`, `W0-04` | CI 能发现 Schema Drift、私有文件跟踪和前端禁用导入 |
| `TEST-04` | 添加 Playwright Mock 应用 Harness | `UI-01`, `TEST-02` | E2E 不需要网络 Provider 或 API Key 即可启动 |

### W2：跨边界契约与适配器

这些任务可以分派给不同 AI，但 Adapter 必须在契约冻结后实现。

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `W2-01` | 冻结 Project/Config/Plan/Task Schema | `W0-02`, `TEST-01` | JSON Schema、Zod、Pydantic、Serde 对 Fixture 的校验一致 |
| `W2-02` | 冻结 Worker Protocol 和 Event Envelope | `W0-03`, `PY-02`, `PY-03`, `RUST-05` | Health、Job、Event、Cancel、Compatibility、Error 示例可校验 |
| `W2-03` | 冻结 Provider 接口和 Usage Record | `W0-02`, `PY-05` | Domain Type 覆盖 Base URL、Key Reference、Model、Timeout、Retry、Token、Cost |
| `W2-04` | 冻结 Prompt Metadata 和 Structured Output 契约 | `W0-02`, `PY-04` | Prompt Version、Input/Output Schema、Golden Case 格式有文档 |
| `W2-05` | 将类型化 Tauri IPC 接入 Query/Mutation Service | `UI-04`, `RUST-01`, `W2-01`, `W2-02` | UI 能调用 Mock Project/Job Command，不能直接访问后端 |

### W3：研究流程垂直切片

每一行都是独立的小实现任务，不要合并成一个大分支。

| ID | 结果 | 依赖 | 并行说明 | 验收 |
|---|---|---|---|---|
| `RES-01` | Planner 生成可审查 Plan | `W2-01`, `W2-04`, `PY-04` | 可与 `RES-02` 并行 | Mock Fixture 生成合法 Plan；UI 支持批准/修改 |
| `RES-02` | 可暂停、重试、恢复的持久化 Task DAG | `W2-01`, `W2-02`, `RUST-02` | 可与 `RES-01` 并行 | 状态转移、依赖、幂等和崩溃恢复通过测试 |
| `RES-03` | Search Adapter 和 Source 去重 | `W2-03`, `W2-02`, `TEST-02` | 可与 `RES-04` 并行 | Mock Search 返回标准 Source、Cache Hit 和稳定去重 Key |
| `RES-04` | Source Evaluation 和 Content Extraction | `RES-03`, `W2-04` | 可与 `RES-05` 并行 | 非法内容可恢复；Source Quality Metadata 保留 |
| `RES-05` | Knowledge/Entity/Relation Normalization | `W2-01`, `W2-04`, `TEST-01` | Fixture 就绪后可并行 | Node/Relation 有类型、可去重且保留 Provenance |
| `RES-06` | Claims 和 Evidence 持久化 | `RES-05`, `W2-01` | 等 Knowledge 契约稳定后 | Support/Contradict 方向和 Confidence 可校验 |
| `RES-07` | Markdown/Obsidian Vault Writer | `RES-05`, `RES-06`, `RUST-03` | 可与 `RES-08` 并行 | Frontmatter、Links、原子写入和用户修改保护通过测试 |
| `RES-08` | Graph Projection 和基础 D3 View | `RES-05`, `UI-03`, `UI-04` | 可与 `RES-07` 并行 | 100 Node Fixture 可渲染；选择、过滤、Inspector 状态通过测试 |
| `RES-09` | 第一条完整研究旅程 | `RES-01` 至 `RES-08` | 串行集成 | 创建项目 → 批准 Plan → 执行 Mock → 检查 Knowledge → 导出 Vault → 打开 Graph |

### W4：加固与公开版本发布

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `REL-01` | 离线端到端质量门禁 | `RES-09`, `TEST-04` | Format、Lint、Typecheck、Unit、Contract、Migration、Playwright 全部通过 |
| `REL-02` | 文档和示例同步 | `REL-01` | README、架构链接、Quick Start、Fixture README、CHANGELOG 描述真实行为 |
| `REL-03` | 隐私和公共边界审计 | `REL-01`, `REL-02` | 暂存区没有私有文件、密钥、本地数据库、Cache 或对话记录 |
| `REL-04` | 人工发布审查 | `REL-03` | 维护者确认范围、已知问题、Demo、版本和 Release Notes |

## 合并顺序

1. 合并 W0 契约和质量任务。
2. 四条 W1 泳道分别通过各自测试后合并。
3. 先合并 W2 契约，再合并依赖它们的 Adapter。
4. 按依赖顺序合并 W3；由集成任务处理跨泳道冲突。
5. 将 W4 作为一个串行 Release Candidate 审查。

如果两个分支修改了同一个契约或 Migration，不要简单选择更新的代码。暂停实现，比较规范并创建或更新 ADR。

## AI 交接协议

任务发起者提供任务包和明确的验收命令。实现 AI 必须返回：

```text
完成任务：<任务 ID>
结果：<一句话说明>
修改文件：<路径>
执行检查：<命令和结果>
契约/文档更新：<路径或无>
已知限制：<无或列表>
建议的下一任务：<任务 ID 或无>
```

Schema、Migration、IPC、Worker Protocol、Provider Adapter、Secrets、持久化语义、导航、全局 UI Token 和 Release 必须人工审查。文档、Fixture、测试或可逆的小实现可以由 AI 准备，但仍必须通过同样的验收和隐私检查。

## 每个任务的完成标准

- 已阅读相关规范和依赖任务结果。
- 修改范围没有超出任务包。
- 测试或明确的人工检查证明验收条件。
- 在适用时验证 Error、Retry、Idempotency 和 Privacy。
- 文档和组件/Provider 注册信息与实现一致。
- `git diff --check` 和公共边界检查通过。
- Commit/PR 说明真实结果并关联任务。

## 明确延期内容

Hosted Collaboration、账号、支付、企业 IAM、云数据库、Kubernetes、Redis/Kafka、Vector Database、自建 Search、模型训练、复杂 Multi-Agent、自带移动端、浏览器扩展、3D Graph 和自动代写学术论文，在新的架构决策批准前全部延期。

## 任务总量与并行能力评估

当前计划共包含 **42 个有边界任务**：

| 工作包 | 任务数 | 作用 |
|---|---:|---|
| W0 基线与契约 | 5 | 建立共享规则和质量门禁 |
| W1 基础设施 | 19 | 前端、Rust、Python、测试四条泳道 |
| W2 跨边界契约 | 5 | 冻结 Schema、Protocol、Provider、Prompt、IPC |
| W3 研究垂直切片 | 9 | 按依赖构建研究流程 |
| W4 集成与发布 | 4 | 串行端到端验证和人工发布审查 |

实际最多适合同时运行四条基础泳道，而不是启动 42 个 AI。建议同时运行 4 到 8 个 AI：维护者或一个集成 AI 保留给契约、Migration、冲突处理和完整质量门禁。继续增加 AI 数量通常只会增加合并冲突，不会缩短关键路径。

关键路径是：

```text
W0 → W2 契约 → RES-01/02 → RES-03/04/05 → RES-06/07/08 → RES-09 → W4
```

W0 完成后，UI、Rust、Python、测试四条基础泳道可以并行。但任何 AI 都不能绕过未完成的契约，创建私有或竞争性的 Schema。

## 5 个可直接复制的并行任务提示词

以下 5 个提示词应在 W0（`W0-01` 至 `W0-05`）完成后作为独立任务运行。每个 AI 使用自己的分支或 Worktree。提示词已经分配了互不重叠的目录。如果依赖未完成，AI 必须停止并提交书面提案，不得自行发明替代契约。

### 提示词 1：前端应用壳（`UI-01`）

```text
你正在实现 Morpho Research OS 任务 UI-01：创建最小的 React + TypeScript + Vite + Tailwind 桌面应用壳。

开始前必须阅读：AGENTS.md、DO_NOT_BREAK.md、docs/PRD.md、docs/ARCHITECTURE.md、docs/frontend/DESIGN_SYSTEM.md、docs/frontend/DESIGN_TOKENS.md、docs/frontend/COMPONENT_REGISTRY.md、docs/frontend/PAGE_PATTERNS.md，以及 docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md。

允许范围：只修改 apps/desktop 的前端文件。禁止修改 apps/desktop/src-tauri、packages/schemas、packages/ui、Python Worker、根依赖文件、导航契约和研究业务功能。

目标结果：创建可以本地启动的类型化桌面应用壳和最小入口。不实现 Research Agent、Provider 调用、数据库访问、文件访问、Secret 访问或 Worker Process 代码。

明确不做：业务页面、新 UI Framework、新状态库、Design Token 修改和 Tauri Command 实现。

验收检查：文档中的前端启动命令成功；TypeScript/Build 检查通过；Shell 挂载 Smoke Test 通过；不存在禁止的后端导入；git diff --check 通过。

如果依赖或契约缺失，停止实现并提出问题，不要自行扩大范围。

最后必须按以下格式返回：完成任务、结果、修改文件、执行检查及结果、文档更新、已知限制、建议的下一任务。
```

### 提示词 2：Rust Command 和 Error 骨架（`RUST-01`）

```text
你正在实现 Morpho Research OS 任务 RUST-01：创建最小的 Tauri Rust Core Command/Result 和结构化 Error 骨架。

开始前必须阅读：AGENTS.md、DO_NOT_BREAK.md、docs/PRD.md、docs/ARCHITECTURE.md、docs/API.md、docs/api/ERRORS.md、docs/architecture/MODULE_BOUNDARIES.md、docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md，以及已批准的 Schema 约定。

允许范围：只修改 apps/desktop/src-tauri。禁止修改前端、packages/schemas、数据库 Migration、Worker、Provider Adapter、Keychain 实现和 Vault Writer。

目标结果：创建类型化的 Tauri Command Result、稳定 Error Code 和单元测试。Error 必须包含 code、safe user message、developer detail、retryable 和 correlation ID。

明确不做：SQLite 连接、Filesystem 操作、Process 管理、Secret 处理和产品业务 Command。

验收检查：Rust Format/Check/Test 通过；成功和错误结果能按契约序列化；不记录 Secret；模块边界清晰；git diff --check 通过。

如果 Error 或 IPC 契约不完整或互相矛盾，停止实现并提交契约提案，不要猜测。

最后必须按统一交接格式返回任务 ID、结果、文件、检查结果、契约/文档更新、限制和下一任务。
```

### 提示词 3：Python Worker 包（`PY-01`）

```text
你正在实现 Morpho Research OS 任务 PY-01：创建最小的 Python Research Worker 包和配置边界。

开始前必须阅读：AGENTS.md、DO_NOT_BREAK.md、docs/PRD.md、docs/ARCHITECTURE.md、docs/architecture/RESEARCH_ENGINE.md、docs/api/PROVIDERS.md、docs/ai/AI_DEVELOPMENT_RULES.md、docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md，以及 Schema 约定。

允许范围：只修改 apps/research-worker。禁止修改 Rust Core、前端、packages/schemas、Prompt Asset、SQLite、Vault 和 Provider 网络 Adapter。

目标结果：创建可导入的 Python 包、显式配置对象和环境变量解析。配置只能保存 Key Reference，不能保存原始 API Key。包只为后续健康检查和协议任务准备，不实现研究逻辑。

明确不做：真实 Provider 调用、Research Agent、Search、LLM Orchestration、Filesystem 写入和 UI 通信。

验收检查：pytest 可以导入包；默认值和缺失值测试通过；不打印或持久化原始 Secret；配置的类型检查通过；git diff --check 通过。

必须使用依赖注入和 Mock。如果 Worker Protocol 或配置契约缺失，停止并提出提案。

最后必须按统一交接格式返回任务 ID、结果、文件、检查结果、契约/文档更新、限制和下一任务。
```

### 提示词 4：跨语言 Fixture Envelope（`TEST-01`）

```text
你正在实现 Morpho Research OS 任务 TEST-01：定义 Rust、Python、TypeScript 测试共用的确定性 Fixture Envelope。

开始前必须阅读：AGENTS.md、DO_NOT_BREAK.md、docs/PRD.md、docs/ARCHITECTURE.md、docs/TESTING.md、docs/testing/MOCKS.md、packages/schemas/MIGRATIONS.md、docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md，以及现有 Fixture 约定。

允许范围：只修改 tests/Fixture 支持、examples/fixtures 的 Fixture 元数据和必要测试文档。禁止修改产品代码、Provider、Migration、Prompt、前端组件和 Worker Protocol。

目标结果：创建包含 fixture ID、schema version、input、expected outputs、provenance metadata 的版本化 Fixture Envelope，并提供一个不需要网络请求的最小离线 Fixture。

明确不做：不得定义与 packages/schemas 冲突的新领域字段；不得加入真实个人研究数据；不得包含私有对话、API Key 或个人信息。

验收检查：Fixture 通过统一 Schema 校验；非法格式和版本不匹配会明确失败；至少一个 Loader Test 通过；不调用真实 Provider；git diff --check 通过。

如果共享 Schema 缺字段，报告问题并把建议交给 W2，不要在 Fixture 内嵌一套临时 JSON 结构。

最后必须按统一交接格式返回任务 ID、结果、文件、检查结果、契约/文档更新、限制和下一任务。
```

### 提示词 5：Mock Provider 场景（`TEST-02`）

```text
你正在实现 Morpho Research OS 任务 TEST-02：添加确定性的 Mock LLM、Search 和 Embedding Provider 场景。

开始前必须阅读：AGENTS.md、DO_NOT_BREAK.md、docs/PRD.md、docs/ARCHITECTURE.md、docs/api/PROVIDERS.md、docs/ai/CACHE_AND_COST.md、docs/TESTING.md、docs/testing/MOCKS.md，以及 docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md。

允许范围：只修改 tests/mocks 和测试专用配置。禁止修改生产 Provider 接口、Rust Core、前端、Worker Orchestration、Prompt Asset 和 Secret 配置。

目标结果：提供可注入、可重复的 Mock，覆盖成功、结构化非法 JSON、超时、认证失败、重试耗尽、Cache Hit 和 Usage Accounting。

明确不做：不得访问网络；不得使用真实 API Key；不得实现 Provider 生产行为；不得修改 Domain Model。

验收检查：每个场景和 Retryable 行为都有测试；Token/Duration/Cost 字段确定；测试证明没有网络调用；配置的 Test Runner 通过；git diff --check 通过。

如果 Provider 契约尚未冻结，停止并提交契约提案，不要创建第二套接口。

最后必须按统一交接格式返回任务 ID、结果、文件、检查结果、契约/文档更新、限制和下一任务。
```
