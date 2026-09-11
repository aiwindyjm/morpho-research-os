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

W0 完成后，四条 W1 泳道可以并行。契约冻结后，W3 也可以部分重叠：Planner 与 DAG 可以并行；Worker/Provider 契约完成后，Search 与 Extraction 可以并行；有标准 Knowledge Fixture 后，Vault、Graph 与 Timeline/Coverage/Gap 可以并行。W4 必须串行，因为它验证完整用户旅程。

## 工作包与小任务

### W0：契约与仓库基线

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `W0-01` | 确认仓库所有权图和模块边界 | 无 | 仓库结构文档与边界文档一致；不添加业务代码 |
| `W0-02` | 建立统一 Schema 包布局 | `W0-01` | `packages/schemas/` 有版本化 JSON Schema 约定和校验说明 |
| `W0-03` | 建立版本与兼容性元数据 | `W0-01` | 根目录 `VERSION`、Schema、Worker Protocol、Vault Schema 策略有说明 |
| `W0-04` | 建立质量门禁和离线测试框架 | `W0-01` | CI 能运行格式、Lint/Type、契约和 Mock 测试 |
| `W0-05` | 建立 Fixture 命名和 Golden Result 约定 | `W0-02`, `W0-04` | Fixture 格式有文档，至少一个离线 Fixture 可校验 |
| `W0-06` | 建立 Monorepo 工具链和启动契约 | `W0-01` | 明确 pnpm/Cargo/uv 的入口、目录清单、格式化和最小启动检查；不实现业务功能 |

### W1-A：前端基础

负责 `apps/desktop` 前端和 `packages/ui`。前端不得访问 SQLite、文件、Secrets 或 Worker Process。

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `UI-01` | 创建 React/Vite/Tailwind 应用壳 | `W0-04`, `W0-06` | 应用可本地启动，有类型化入口，不包含业务流程 |
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
| `RUST-05` | 增加 Worker Supervisor 生命周期骨架 | `RUST-01`, `W0-03` | 使用临时协议草案和 Fake Worker 测试启动、健康检查、重启、取消和关闭；正式契约由 `W2-02` 冻结 |

### W1-C：Python Worker 基础

负责 `apps/research-worker`。Worker 不得直接写 Vault 或修改 UI 状态。

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `PY-01` | 创建 Python 包和配置边界 | `W0-02`, `W0-03` | `pytest` 可以导入；配置不包含原始密钥 |
| `PY-02` | 实现版本化健康检查和版本接口 | `PY-01`, `W0-03` | `/health` 和 `/version` 返回符合协议草案的响应；正式契约由 `W2-02` 冻结 |
| `PY-03` | 实现 JSONL/SSE Event 原语 | `PY-02`, `W0-03` | Event 有序、追加式、可重连且经过脱敏；正式契约由 `W2-02` 冻结 |
| `PY-04` | 创建 Orchestrator 和 Worker 接口骨架 | `PY-01`, `W0-02` | Planner/Search/Extraction/Validation/Writer 接口有 Mock |
| `PY-05` | 创建 Provider 接口和 Mock Adapter | `PY-04`, `W0-02` | 按 Provider 契约草案创建 Mock；正式接口和用量记录由 `W2-03` 冻结 |

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
| `W2-02` | 冻结 Worker Protocol 和 Event Envelope | `W0-03`, `PY-02`, `PY-03`, `RUST-01` | Health、Job、Event、Cancel、Compatibility、Error 示例可校验 |
| `W2-03` | 冻结 Provider 接口和 Usage Record | `W0-02`, `PY-05` | Domain Type 覆盖 Base URL、Key Reference、Model、Timeout、Retry、Token、Cost |
| `W2-04` | 冻结 Prompt Metadata 和 Structured Output 契约 | `W0-02`, `PY-04` | Prompt Version、Input/Output Schema、Golden Case 格式有文档 |
| `W2-05` | 将类型化 Tauri IPC 接入 Query/Mutation Service | `UI-04`, `RUST-01`, `W2-01`, `W2-02` | UI 能调用 Mock Project/Job Command，不能直接访问后端 |
| `W2-06` | 冻结 Knowledge/Claim/Evidence/Relation/Artifact 契约 | `W0-02`, `TEST-01` | JSON Schema 与领域文档明确 Source/Evidence/Claim/Knowledge 关系；三端校验一致 |

### W3：研究流程垂直切片

每一行都是独立的小实现任务，不要合并成一个大分支。

| ID | 结果 | 依赖 | 并行说明 | 验收 |
|---|---|---|---|---|
| `RES-01` | Planner 生成可审查 Plan | `W2-01`, `W2-04`, `PY-04` | 可与 `RES-02` 并行 | Mock Fixture 生成合法 Plan；UI 支持批准/修改 |
| `RES-02` | 可暂停、重试、恢复的持久化 Task DAG | `W2-01`, `W2-02`, `RUST-02` | 可与 `RES-01` 并行 | 状态转移、依赖、幂等和崩溃恢复通过测试 |
| `RES-03` | Search Adapter 和 Source 去重 | `W2-03`, `W2-02`, `TEST-02` | 可与 `RES-04` 并行 | Mock Search 返回标准 Source、Cache Hit 和稳定去重 Key |
| `RES-04` | Source Evaluation 和 Content Extraction | `RES-03`, `W2-04` | 可与 `RES-05` 并行 | 非法内容可恢复；Source Quality Metadata 保留 |
| `RES-05` | Knowledge/Entity/Relation Normalization | `W2-01`, `W2-04`, `W2-06`, `TEST-01` | Fixture 就绪后可并行 | Node/Relation 有类型、可去重且保留 Provenance |
| `RES-06` | Claims 和 Evidence 持久化 | `RES-05`, `W2-01`, `W2-06` | 等 Knowledge 契约稳定后 | Support/Contradict 方向和 Confidence 可校验 |
| `RES-07` | Markdown/Obsidian Vault Writer | `RES-05`, `RES-06`, `W2-06`, `RUST-03` | 可与 `RES-08` 并行 | Frontmatter、Links、原子写入和用户修改保护通过测试 |
| `RES-08` | Graph Projection 和基础 D3 View | `RES-05`, `W2-06`, `UI-03`, `UI-04` | 可与 `RES-07` 并行 | 100 Node Fixture 可渲染；选择、过滤、Inspector 状态通过测试 |
| `RES-09` | 第一条完整研究旅程 | `RES-01` 至 `RES-08`, `RES-10` | 串行集成 | 创建项目 → 批准 Plan → 执行 Mock → 检查 Knowledge → 导出 Vault → 打开 Graph/Timeline/Coverage/Gap |
| `RES-10` | Timeline、Coverage 与 Gap 视图 | `RES-02`, `RES-05`, `RES-06`, `W2-06`, `UI-03`, `UI-04` | 可与 `RES-07`、`RES-08` 并行 | 按 PRD 公式计算可解释覆盖度，展示时间线和缺口，并可由用户批准生成后续任务 |

### W4：加固与公开版本发布

| ID | 结果 | 依赖 | 验收 |
|---|---|---|---|
| `REL-01` | 离线端到端质量门禁 | `RES-09`, `TEST-04` | Format、Lint、Typecheck、Unit、Contract、Migration、Playwright 全部通过 |
| `REL-02` | 文档和示例同步 | `REL-01` | README、架构链接、Quick Start、Fixture README、CHANGELOG 描述真实行为，并确认 quantum-entanglement、brain-computer-interface、large-language-model 三组 Golden Fixture 的状态 |
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

## PRD 一致性审计结论

本计划按 `docs/PRD.md` 的产品流程、数据模型、进程边界、隐私原则和 V0.1 范围逐项核对，采用以下约束防止 AI 误解：

| 审计项 | 计划中的强制约束 |
|---|---|
| 多项目模型 | Project 是隔离边界；配置、Run、Task、Source、Knowledge、Assistant 上下文和 Vault 均必须带 Project 归属 |
| 研究流程 | Planner 只生成待审查 Plan；用户批准后才创建可运行 DAG；后续阶段不得跳过 Source、Evidence、Validation 和 Normalization |
| 数据分层 | SQLite 保存 Runtime/Index/State；Markdown 保存用户知识资产；Cache 可删除；Logs 不作为知识来源 |
| 知识关系 | Source、Evidence、Claim、Knowledge、Relation 是不同实体；冲突 Claim 共存，不覆盖历史 |
| 进程边界 | React 只能使用类型化 IPC/Query；Rust 管理 SQLite、文件、Secrets、Worker；Python 执行研究和 Provider 适配 |
| AI 输出 | LLM 输出必须 Parse → Validate → Normalize → Persist；禁止直接写数据库或覆盖 Vault |
| 可恢复性 | Task 必须有状态、依赖、Idempotency Key、Checkpoint、Retry、Cancel 和崩溃恢复行为 |
| 用户资产 | Vault 使用稳定 Node ID、Frontmatter、wikilink、原子写入和用户修改检测；不得静默覆盖 |
| 本地优先 | 默认离线测试和本地存储；外部 Provider 是显式配置；API Key 不进入 Git、SQLite 普通表、日志或 Prompt |
| V0.1 范围 | 单用户、本地、轻量 Orchestrator、SQLite、Markdown、D3 2D；云协作、复杂 Multi-Agent、Vector DB 等继续延期 |

审计修正了两类结构问题：第一，移除了 `RUST-05/PY-02/PY-03 → W2-02 →` 自身以及 `PY-05 → W2-03 →` 自身的循环依赖，基础实现现在依赖协议草案，W2 再冻结正式契约；第二，新增 `W0-06` 工具链启动契约和 `W2-06` Knowledge/Claim/Evidence/Relation/Artifact 契约，避免 AI 自行修改根配置或发明知识数据结构。

## 明确延期内容

Hosted Collaboration、账号、支付、企业 IAM、云数据库、Kubernetes、Redis/Kafka、Vector Database、自建 Search、模型训练、复杂 Multi-Agent、自带移动端、浏览器扩展、3D Graph 和自动代写学术论文，在新的架构决策批准前全部延期。

## 任务总量与并行能力评估

当前计划共包含 **45 个有边界任务**：

| 工作包 | 任务数 | 作用 |
|---|---:|---|
| W0 基线与契约 | 6 | 建立共享规则、工具链和质量门禁 |
| W1 基础设施 | 19 | 前端、Rust、Python、测试四条泳道 |
| W2 跨边界契约 | 6 | 冻结运行时、知识、Provider、Prompt、IPC Schema |
| W3 研究垂直切片 | 10 | 按依赖构建研究流程 |
| W4 集成与发布 | 4 | 串行端到端验证和人工发布审查 |

实际最多适合同时运行四条基础泳道，而不是为 45 个任务启动 45 个 AI。建议同时运行 4 到 8 个 AI：维护者或一个集成 AI 保留给契约、Migration、冲突处理和完整质量门禁。继续增加 AI 数量通常只会增加合并冲突，不会缩短关键路径。

关键路径是：

```text
W0 → W2-01/02/03/04/06 → W2-05 → RES-01/02 → RES-03/04/05 → RES-06/07/08/10 → RES-09 → W4
```

W0 完成后，UI、Rust、Python、测试四条基础泳道可以并行。W2-06 必须在 RES-05 之前完成，W2-05 必须在完整 UI/后端集成之前完成。但任何 AI 都不能绕过未完成的契约，创建私有或竞争性的 Schema。

## 5 个可直接复制的并行任务提示词

以下 5 个提示词应在 W0（`W0-01` 至 `W0-06`）完成后作为独立任务运行。每个 AI 使用自己的分支或 Worktree。提示词已经分配了互不重叠的目录。如果依赖未完成，AI 必须停止并提交书面提案，不得自行发明替代契约。

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

## 其余任务的中文提示词

使用下面任一任务提示词时，先复制“通用执行前缀”，再复制对应任务块。前缀是全部任务共同的强制规则，任务块定义具体范围。两部分合在一起才是一份完整提示词。

### 通用执行前缀

```text
你正在参与 Morpho Research OS 的 AI 并行开发。维护者是产品负责人和最终审查者。

开始前必须阅读 AGENTS.md、DO_NOT_BREAK.md、docs/PRD.md、docs/ARCHITECTURE.md、docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md，以及任务块列出的专项文档。先检查依赖任务是否完成、当前 Git 状态和允许修改范围。

只实现当前任务的一个结果，不处理顺手发现的其他问题，不覆盖用户或其他 Agent 的修改。契约先于实现；遇到 Schema、IPC、Worker Protocol、Migration、Provider Interface、Navigation 或 Global Design Token 缺失/冲突时，停止相关实现并提交契约或 ADR 提案，不得自行创造第二套规则。

禁止引入未批准的框架、状态库、数据库、队列或 Agent Framework。禁止使用真实 API Key 或真实 Provider。测试只使用 Mock 和 Fixture。禁止把 private/、本地对话、个人计划、数据库、Cache、日志或 Secret 加入 Git。

完成后运行任务指定检查、git diff --check 和 scripts/check-public-boundary.ps1，审查变更文件中是否混入无关内容。不要自行发布 Release。

最后按以下格式返回：
完成任务：<任务 ID>
结果：<一句话>
修改文件：<路径>
执行检查：<命令和结果>
契约/文档更新：<路径或无>
已知限制：<无或列表>
建议的下一任务：<任务 ID 或无>
```

### W0 契约与仓库基线

#### `W0-01`：仓库所有权图和模块边界

```text
执行 W0-01。专项阅读 docs/architecture/REPOSITORY.md、docs/architecture/MODULE_BOUNDARIES.md、docs/ARCHITECTURE_INVARIANTS.md 和 docs/development/PROJECT_SETUP.md。

目标：核对并统一 Frontend、Tauri Rust Core、Python Worker、Shared Schema、Prompt、Provider、Test、Documentation 的目录归属、依赖方向和禁止跨层行为。

允许修改：上述架构/仓库说明文档和必要的目录占位文件。禁止添加生产代码、依赖、Schema 字段或新技术决策。

验收：目录树与模块边界互相一致；每个目录有唯一责任；UI→Rust→Worker 依赖方向明确；SQLite、Secrets、Filesystem、Vault 权限归属无冲突；文档链接有效。
```

#### `W0-02`：统一 Schema 包布局

```text
执行 W0-02，依赖 W0-01。专项阅读 docs/DATA_MODEL.md、packages/schemas/MIGRATIONS.md、docs/data/ 下的 Schema 文档和 docs/api/ERRORS.md。

目标：定义 packages/schemas 的目录、命名、版本、JSON Schema $id、兼容性、代码生成输入输出和跨语言校验约定。

允许修改：packages/schemas 的规范/索引文件及直接相关文档。禁止新增未经批准的领域字段、生成运行时代码或修改现有持久化语义。

验收：明确 canonical source、版本升级规则、Zod/Pydantic/Serde 生成边界、Fixture 校验方式和破坏性变更流程；现有 research-config.v1.json 符合约定。
```

#### `W0-03`：版本与兼容性元数据

```text
执行 W0-03，依赖 W0-01。专项阅读 VERSION、docs/development/RELEASE_STRATEGY.md、docs/development/RELEASE.md、packages/schemas/MIGRATIONS.md 和 Worker API 文档。

目标：固定 App Version、Schema Version、Prompt Version、Worker Version、Worker Protocol Version、Vault Schema Version 的来源、格式和兼容性矩阵。

允许修改：版本/发布/兼容性文档和 VERSION 相关校验说明。禁止发布版本、修改产品范围或编造尚不存在的运行时版本同步代码。

验收：每种版本只有一个权威来源；兼容/拒绝/迁移条件明确；README、Cargo、Package、Worker 后续如何读取 VERSION 有清晰规则。
```

#### `W0-04`：质量门禁与离线测试框架

```text
执行 W0-04，依赖 W0-01。专项阅读 docs/TESTING.md、docs/testing/MOCKS.md、.github/workflows/ci.yml 和 docs/development/CODING_GUIDELINES.md。

目标：建立与当前仓库阶段匹配的 CI/本地质量门禁，覆盖文档、私有边界、Schema，以及后续 TypeScript/Rust/Python 测试入口。

允许修改：.github/workflows、测试配置、scripts 和测试文档。禁止添加业务代码、调用真实 Provider、要求本地 Secret 或引入复杂 CI 平台。

验收：当前文档仓库检查可运行；不存在的运行时工具采用条件化或后续占位而不会虚假通过；失败信息可理解；本地命令与 CI 一致。
```

#### `W0-05`：Fixture 与 Golden Result 约定

```text
执行 W0-05，依赖 W0-02 和 W0-04。专项阅读 docs/TESTING.md、docs/testing/MOCKS.md、docs/data/ 下的契约文档和 examples 目录规划。

目标：定义 Fixture ID、目录命名、输入、期望输出、Provenance、Schema Version、Prompt Version、稳定字段和允许变化字段。

允许修改：examples/fixtures 的规范、最小合成 Fixture 和相关测试文档。禁止加入大体积抓取数据、版权不明内容、个人数据或真实 Provider Response。

验收：一个最小离线 Fixture 能通过 Schema 校验；Golden Result 的更新审核规则明确；时间戳、随机 ID 等非确定字段有规范化策略。
```

#### `W0-06`：Monorepo 工具链和启动契约

```text
执行 W0-06，依赖 W0-01。专项阅读 docs/architecture/REPOSITORY.md、docs/DEVELOPMENT.md、docs/development/PROJECT_SETUP.md、docs/TESTING.md 和现有版本文件。

目标：明确 pnpm、Cargo、uv/pytest 的工作区入口、目录清单、格式化/类型检查命令、最小启动命令和 CI 调用方式。

允许修改：根目录工具配置、启动说明、CI 命令映射和必要的空目录占位文件。禁止实现 React、Rust、Python 业务代码；禁止引入新的构建系统或包管理器。

验收：每个命令都有实际存在的目标或明确的后续任务；Windows/CI 使用方式不互相矛盾；根目录依赖边界明确；文档能指导 AI 选择正确工作目录。
```

### W1-A 前端基础后续任务

#### `UI-02`：Design Token 与组件原语

```text
执行 UI-02，依赖 UI-01。专项阅读 docs/frontend/DESIGN_SYSTEM.md、DESIGN_TOKENS.md、UI_COMPONENTS.md、COMPONENT_REGISTRY.md、UX_RULES.md、ACCESSIBILITY.md 和 AI_FRONTEND_RULES.md。

目标：按现有技术栈实现已批准的 Design Token 和首批注册 UI Primitive，并提供组件测试/展示入口。

允许修改：packages/ui 和必要的前端测试文件。禁止修改全局视觉方向、增加新颜色/间距体系、引入第二个 UI Framework、实现业务组件或页面。

验收：Token 无页面硬编码副本；组件 API 类型明确；Keyboard、Focus、Disabled、Loading 基础状态可用；Registry 与实现一致；测试通过。
```

#### `UI-03`：应用布局与导航壳

```text
执行 UI-03，依赖 UI-02。专项阅读 docs/frontend/PAGE_PATTERNS.md、PAGE_SPECIFICATION.md、UX_RULES.md、ACCESSIBILITY.md 和 COMPONENT_REGISTRY.md。

目标：实现多研究项目工具的应用壳、项目切换入口和已批准的核心路由占位状态。

允许修改：apps/desktop 前端的 app/layout/navigation 相关文件和测试。禁止实现业务页面内容、修改导航信息架构、直连后端或重新设计 Token。

验收：项目切换交互清晰；Desktop/Tablet/Mobile 响应规则符合规范；每个路由有 Loading/Empty/Error 占位；Keyboard 与 Focus 顺序通过测试。
```

#### `UI-04`：类型化 IPC/Query 服务边界

```text
执行 UI-04，依赖 UI-01 和 W0-02。专项阅读 docs/API.md、docs/architecture/MODULE_BOUNDARIES.md、docs/frontend/AI_FRONTEND_RULES.md 和批准的 Schema 约定。

目标：建立前端 Service、TanStack Query 和 Tauri Invoke/Event 的类型化边界，并提供 Mock Transport。

允许修改：apps/desktop 前端 services、types、query 和测试文件。禁止实现 Rust Command、访问 SQLite/Filesystem/Secrets/Process、修改 IPC 契约或添加临时 JSON。

验收：组件不直接调用 invoke；Query Key 集中定义；Result/Error 类型来自批准契约；Mock Transport 可测试成功、失败和取消；架构检查通过。
```

#### `UI-05`：上下文 AI Assistant 壳

```text
执行 UI-05，依赖 UI-02 和 UI-03。专项阅读 docs/PRD.md 中 AI Assistant 定位、页面规范、UX/Accessibility 和组件注册表。

目标：实现绑定当前 Project 的紧凑 AI Assistant 浮层，包含解释进度、建议下一任务、检查待审核项、记录决定的 UI 壳和显式保存动作。

允许修改：Assistant Feature、注册业务组件和相关测试。禁止连接真实 LLM、持久化对话、读取 Secret、创建全局聊天产品或改变导航。

验收：切换 Project 会更新并隔离上下文；打开/关闭/Focus/Keyboard 可用；保存动作仅调用 Mock Service；空/加载/错误状态齐全。
```

### W1-B Rust Core 后续任务

#### `RUST-02`：SQLite 与 Migration Runner

```text
执行 RUST-02，依赖 RUST-01 和 W0-03。专项阅读 docs/DATA_MODEL.md、packages/schemas/MIGRATIONS.md、docs/architecture/REPOSITORY.md 和 docs/backend/AI_BACKEND_RULES.md。

目标：建立 SQLite 连接配置、外键/事务默认值、编号 Migration Runner、当前 Schema Version 查询和升级测试。

允许修改：Rust Core 的 database/migrations 模块和测试。禁止实现完整业务 Repository、读取 API Key、把知识 Markdown 当作 SQLite 主资产或直接修改生产数据库。

验收：空库可从头迁移；旧版本可逐步升级；重复执行幂等；失败不会标记成功；Migration 状态有测试；数据库路径不进入 Git。
```

#### `RUST-03`：Repository Transaction 边界

```text
执行 RUST-03，依赖 RUST-02 和 W0-02。专项阅读 docs/DATA_MODEL.md、docs/backend/AI_BACKEND_RULES.md、ARCHITECTURE_INVARIANTS.md 和 Schema 契约。

目标：建立 Domain Service → Repository → SQLite 的最小边界，提供显式事务、外键、幂等和错误转换示例。

允许修改：Rust Repository/Transaction 模块和测试。禁止实现所有业务 Entity、绕过 Repository 写 SQL、让前端直接访问数据库或改变 Schema。

验收：提交/回滚、外键失败、重复 Idempotency Key、结构化 Database Error 均有测试；事务边界不会泄漏到 UI。
```

#### `RUST-04`：OS Keychain 与配置边界

```text
执行 RUST-04，依赖 RUST-01。专项阅读 docs/api/PROVIDERS.md、docs/ARCHITECTURE.md、docs/backend/AI_BACKEND_RULES.md、SECURITY.md 和 Secrets 规则。

目标：建立 Key Reference、应用配置和 Fake Keychain 接口；真实密钥只由 OS Secure Storage 管理。

允许修改：Rust Core 的 secrets/config 模块和测试。禁止把密钥写入 SQLite 普通表、日志、Prompt、Event、Git 或前端状态；禁止连接真实 Provider。

验收：保存/读取/删除引用行为可测；缺失密钥、权限失败、脱敏日志可测；配置导出不包含 Secret Value；错误可区分 Retryable。
```

#### `RUST-05`：Worker Supervisor 生命周期

```text
执行 RUST-05，依赖 RUST-01 和 W0-03。专项阅读 docs/ARCHITECTURE.md、docs/api/ERRORS.md、docs/architecture/MODULE_BOUNDARIES.md 和 Worker Protocol 草案。

目标：根据 Worker Protocol 草案实现 Worker Process 启动、健康检查、版本兼容、有限重启、关闭、取消和 WORKER_NOT_AVAILABLE 错误的 Supervisor 骨架。正式协议字段必须在 W2-02 冻结后核对。

允许修改：Rust Worker Supervisor、协议 Client 和 Fake Worker 测试。禁止实现 Python 研究逻辑、Provider、Task DAG 或绕过协议直接调用脚本。

验收：健康成功、启动失败、协议不兼容、崩溃重启、取消、关闭和重试耗尽均有测试；重启有上限和退避；Event 不重复转发。
```

### W1-C Python Worker 后续任务

#### `PY-02`：健康检查与版本接口

```text
执行 PY-02，依赖 PY-01 和 W0-03。专项阅读 docs/ARCHITECTURE.md、docs/API.md、docs/api/ERRORS.md 和 Worker Protocol 草案。

目标：实现 /health、/version 和基础协议兼容性响应，提供本地测试 Server/Client。字段以 W2-02 最终契约为准，不能自行扩展业务字段。

允许修改：apps/research-worker 的 transport/health 模块和测试。禁止执行研究任务、连接真实 Provider、写 Vault 或处理 API Key Value。

验收：健康响应包含进程状态、Worker Version、Protocol Version；版本不兼容可识别；超时和异常有稳定错误；pytest 通过。
```

#### `PY-03`：JSONL/SSE Event 原语

```text
执行 PY-03，依赖 PY-02 和 W0-03。专项阅读 docs/ARCHITECTURE.md、docs/api/ERRORS.md、Worker Event Envelope 草案和隐私规则。

目标：实现有序、追加式、可重连、可脱敏的 Job Event 编码、游标和 SSE 输出原语。最终字段和错误语义在 W2-02 冻结后做合同测试。

允许修改：Worker transport/events 模块和测试。禁止创建领域状态机、写 SQLite、把原始 LLM Response 或 Secret 放入 Event。

验收：Event ID/序号稳定；断线后可从游标续传；重复 Event 可识别；敏感字段脱敏；格式错误和关闭状态可测。
```

#### `PY-04`：Orchestrator 与 Worker 接口骨架

```text
执行 PY-04，依赖 PY-01 和 W0-02。专项阅读 docs/architecture/RESEARCH_ENGINE.md、docs/PRD.md、docs/data/ 下 Knowledge/Claim/Evidence 文档和 Prompt 规范。

目标：建立 Planner、Search、Extraction、Entity、Relation、Validation、Writer 的轻量接口和 Orchestrator 调度骨架。

允许修改：apps/research-worker 的 domain/application 接口和 Mock 实现。禁止实现真实研究算法、复杂 Multi-Agent、Provider 网络请求或直接持久化。

验收：接口输入输出类型明确；Orchestrator 可按 Task ID 调用 Mock；失败可返回结构化 Error；LLM 输出不能绕过 Parse/Validate/Normalize。
```

#### `PY-05`：Provider 接口与 Mock Adapter

```text
执行 PY-05，依赖 PY-04 和 W0-02。专项阅读 docs/api/PROVIDERS.md、docs/ai/MODEL_ROUTING.md、docs/ai/CACHE_AND_COST.md 和 Mock 规范。

目标：根据 Provider 契约草案实现 Provider-neutral 的 LLMProvider、SearchProvider、EmbeddingProvider 接口及本地 Mock Adapter。W2-03 冻结后必须执行兼容性核对。

允许修改：Worker provider ports、Mock Adapter、Usage 类型和测试。禁止实现具体厂商生产 SDK、保存 API Key、把 Provider 类型泄漏到 Domain 或进行真实网络调用。

验收：Base URL、Key Reference、Model、Timeout、Retry、Token、Duration、Estimated Cost 可表达；超时/认证/无效结构化输出可模拟；依赖注入可测。
```

### W1-D 测试任务

#### `TEST-03`：契约与架构检查

```text
执行 TEST-03，依赖 W0-02 和 W0-04。专项阅读 docs/TESTING.md、docs/ARCHITECTURE_INVARIANTS.md、AGENTS.md 和 scripts 目录。

目标：增加自动检查 Schema Drift、禁止前端直接访问后端资源、私有文件误跟踪、必需文档缺失和 Provider 真实调用。

允许修改：tests/architecture、scripts、CI 和测试文档。禁止通过放宽规则来让失败通过；禁止把私有文件加入白名单。

验收：故意违反规则时检查失败；正常仓库通过；错误信息指向文件和修复方式；CI 与本地脚本行为一致。
```

#### `TEST-04`：Playwright Mock 应用 Harness

```text
执行 TEST-04，依赖 UI-01 和 TEST-02。专项阅读 docs/TESTING.md、docs/testing/MOCKS.md、docs/frontend/ACCESSIBILITY.md 和 Playwright 配置规范。

目标：建立不需要网络、API Key 或真实 Worker 的桌面 UI E2E Harness，支持项目切换、Assistant、Loading/Empty/Error 基础流程。

允许修改：tests/e2e、Playwright 配置、Mock Transport 和测试文档。禁止修改生产业务逻辑、调用真实 Provider 或截图中包含私有内容。

验收：CI 可启动 Harness；测试可稳定运行；失败保留可诊断截图/Trace；测试数据来自 Fixture；测试结束清理临时目录。
```

### W2 跨边界契约任务

#### `W2-01`：Project/Config/Plan/Task Schema

```text
执行 W2-01，依赖 W0-02 和 TEST-01。专项阅读 docs/PRD.md、docs/DATA_MODEL.md、docs/data/KNOWLEDGE_SCHEMA.md、packages/schemas/MIGRATIONS.md 和 Fixture 规范。

目标：冻结 Project、ResearchConfig、ResearchPlan、ResearchSection、ResearchTask、TaskDependency、ResearchRun 的跨语言 Schema。

允许修改：packages/schemas、对应 Zod/Pydantic/Serde 校验入口、契约示例和测试。禁止增加未批准 Entity、修改产品字段含义或直接生成数据库 Migration。

验收：必填/可选/Enum/时间/ID/JSON 边界明确；三端校验结果一致；非法状态和依赖可识别；向后兼容规则有测试。
```

#### `W2-02`：Worker Protocol 与 Event Envelope

```text
执行 W2-02，依赖 W0-03、PY-02、PY-03、RUST-05。专项阅读 docs/ARCHITECTURE.md、docs/API.md、docs/api/ERRORS.md 和 Worker 生命周期规则。

目标：冻结 /health、/version、/jobs、/jobs/{id}、/cancel、/events 的请求、响应、状态、兼容性和错误 Envelope。

允许修改：协议 Schema、示例、Rust/Python 合同测试和协议文档。禁止在本任务实现 Planner、DAG、真实 Process 或业务持久化。

验收：命令与 Event 分离；Event 有序、可重连、可取消、可脱敏；Protocol Version 不兼容时明确拒绝；请求/响应示例通过校验。
```

#### `W2-03`：Provider 接口与用量记录

```text
执行 W2-03，依赖 W0-02 和 PY-05。专项阅读 docs/api/PROVIDERS.md、docs/ai/MODEL_ROUTING.md、docs/ai/CACHE_AND_COST.md、docs/DATA_MODEL.md。

目标：冻结 Provider-neutral 的 LLM/Search/Embedding 接口、配置、Retry Policy、Usage Record 和错误映射。

允许修改：Provider 契约、类型、Mock 合同测试和文档。禁止绑定具体模型名、把厂商字段带入 Domain、保存 Key Value 或实现生产 Adapter。

验收：Provider、Model、Duration、Input/Output Token、Estimated Cost、Cache 命中和 Retry 可记录；认证/超时/限流错误可分类；未来 Model Routing 可扩展。
```

#### `W2-04`：Prompt Metadata 与 Structured Output 契约

```text
执行 W2-04，依赖 W0-02 和 PY-04。专项阅读 docs/ai/PROMPT_ARCHITECTURE.md、docs/data/CLAIM_SCHEMA.md、EVIDENCE_SCHEMA.md、KNOWLEDGE_SCHEMA.md。

目标：冻结 Prompt ID、Version、用途、输入 Schema、输出 Schema、模型要求、Golden Case 和解析流程。

允许修改：packages/prompts 的元数据规范、Schema 示例和测试。禁止把 Prompt 散落到业务代码、允许纯文本直写数据库或绕过 Validate/Normalize。

验收：LLM → Parse → Validate → Normalize → Persist 流程可追踪；输出不合格有稳定错误；Prompt Version 可用于 Cache Key 和回归测试。
```

#### `W2-05`：类型化 Tauri IPC 接入

```text
执行 W2-05，依赖 UI-04、RUST-01、W2-01、W2-02。专项阅读 docs/API.md、docs/architecture/MODULE_BOUNDARIES.md、前端 Service 规则和 Rust Command 规则。

目标：把类型化 Project/Job 查询与操作接入 Tauri IPC，并让前端使用 Mock/真实边界一致的 Service。

允许修改：前端 Service、Rust IPC Adapter、契约测试和必要文档。禁止让 React 直接访问 SQLite、Filesystem、Secrets 或 Worker Process；禁止新增临时 JSON。

验收：请求、响应、Error、取消和 Event 类型一致；前端不依赖 Rust 内部类型；IPC 错误可展示；集成 Mock 测试通过。
```

#### `W2-06`：Knowledge/Claim/Evidence/Relation/Artifact 契约

```text
执行 W2-06，依赖 W0-02 和 TEST-01。专项阅读 docs/DATA_MODEL.md、docs/data/KNOWLEDGE_SCHEMA.md、CLAIM_SCHEMA.md、EVIDENCE_SCHEMA.md、RELATION_SCHEMA.md、VAULT_SCHEMA.md 和 docs/PRD.md。

目标：冻结 KnowledgeNode、Claim、Evidence、Relation、Artifact 的 JSON Schema、关系约束、Provenance、Confidence、Conflict、状态和 Vault 引用。

允许修改：packages/schemas、docs/data/、契约示例和跨语言校验测试。禁止实现 Normalization、Repository、Vault Writer 或 Graph UI；禁止把所有类型压成无边界 JSON。

验收：明确 Source → Evidence → Claim → Knowledge 关系；Claim 不等于 Knowledge；Evidence 必须引用 Source 和定位信息；Conflict 可共存；JSON Schema、Zod、Pydantic、Serde 的校验一致。
```

### W3 研究流程任务

#### `RES-01`：Planner 与 Plan Review

```text
执行 RES-01，依赖 W2-01、W2-04、PY-04。专项阅读 docs/architecture/RESEARCH_ENGINE.md、docs/PRD.md、docs/data/KNOWLEDGE_SCHEMA.md、前端 Page Spec 和 Planner Prompt 契约。

目标：将 ResearchConfig 转换为结构化 ResearchPlan/Section/Task 草案，提供用户批准、修改、重新生成和拒绝状态。

允许修改：Worker Planner、Planner Prompt/Fixture、计划 Service 和对应 UI Feature。禁止直接执行 Search、写 Vault、覆盖用户配置或把自然语言结果直接持久化。

验收：输出通过 Schema、来源目标和研究维度可追踪、Plan 需要用户批准后才能运行；Mock LLM 无效输出可恢复；批准/修改流程有测试。
```

#### `RES-02`：可恢复 Task DAG

```text
执行 RES-02，依赖 W2-01、W2-02、RUST-02。专项阅读 docs/architecture/RESEARCH_ENGINE.md、docs/PRD.md、Task 状态规范和 SQLite 数据模型。

目标：实现 PENDING、PLANNING、RUNNING、PAUSED、VALIDATING、NEEDS_REVIEW、COMPLETED、FAILED、CANCELLED 的合法状态机、依赖和检查点。

允许修改：Orchestrator Scheduler、Rust Task Repository、状态测试和 UI Task 状态映射。禁止把所有任务改成串行、绕过 Orchestrator 改状态或添加分布式队列。

验收：DAG 可并行 Fan-out/Fan-in；循环依赖被拒绝；暂停/取消/重试/崩溃恢复可测；只有 Orchestrator 转移状态；Idempotency Key 防止重复执行。
```

#### `RES-03`：Search Adapter 与 Source 去重

```text
执行 RES-03，依赖 W2-03、W2-02、TEST-02。专项阅读 docs/architecture/RESEARCH_ENGINE.md、docs/api/PROVIDERS.md、docs/data/EVIDENCE_SCHEMA.md、缓存规则。

目标：实现 SearchProvider Adapter 的领域边界、Source 标准化、稳定去重 Key、缓存读取和可重试错误。

允许修改：Worker Search Adapter、Source Normalizer、Cache Key、Mock 测试和相关契约文档。禁止调用真实网络、抓取内容写入 Vault、丢弃来源 URL 或把 Provider 类型暴露给 Domain。

验收：相同 URL/规范化 URL/内容指纹的去重行为明确；来源保留标题、URL、类型、时间和质量待评估字段；Cache Hit 不重复消耗 Provider。
```

#### `RES-04`：Source Evaluation 与 Content Extraction

```text
执行 RES-04，依赖 RES-03 和 W2-04。专项阅读 docs/architecture/RESEARCH_ENGINE.md、docs/data/EVIDENCE_SCHEMA.md、docs/ai/PROMPT_ARCHITECTURE.md 和错误规范。

目标：从标准 Source 获取可缓存的 SourceContent，提取正文/元数据并生成来源质量评估，不把质量评分当作事实真伪。

允许修改：Worker Extraction/Source Evaluation、Mock Content Fixture、Prompt 和测试。禁止实现 PDF 专属复杂管线、直接创建 Knowledge Node 或覆盖原始 Source。

验收：解析失败可重试/标记失败；内容和定位信息可追溯；质量维度可解释；重复执行使用 Cache；结构化输出经过解析和校验。
```

#### `RES-05`：Knowledge/Entity/Relation Normalization

```text
执行 RES-05，依赖 W2-01、W2-04、TEST-01。专项阅读 docs/data/KNOWLEDGE_SCHEMA.md、RELATION_SCHEMA.md、EVIDENCE_SCHEMA.md、docs/architecture/RESEARCH_ENGINE.md。

目标：从已校验的 Extraction Result 标准化 KnowledgeNode、Entity、Relation、Alias、Confidence 和 Provenance。

允许修改：Worker Normalization、Entity/Relation Prompt、Dedup 规则、Fixture 和测试。禁止把 Claim 当作 Knowledge、删除冲突结论、无 Evidence 创建重要结论或直接写 Markdown。

验收：类型、ID、Alias、状态、Confidence、Source/Claim 引用稳定；重复实体可合并但保留 Provenance；冲突数据并存；LLM 输出不能直接持久化。
```

#### `RES-06`：Claim 与 Evidence 持久化

```text
执行 RES-06，依赖 RES-05 和 W2-01。专项阅读 docs/data/CLAIM_SCHEMA.md、EVIDENCE_SCHEMA.md、RELATION_SCHEMA.md、docs/PRD.md 和冲突规范。

目标：实现 Source → Evidence → Claim → Knowledge 的结构化持久化，支持 support/contradict、Confidence 和 review 状态。

允许修改：Claim/Evidence Domain、Repository、校验器、Mock Fixture 和测试。禁止用后来的 Claim 覆盖旧 Claim、把 Evidence 直接当 Source、没有定位信息就标记 Confirmed。

验收：Claim 与 Evidence 可独立查询；每个重要 Claim 有 Evidence Metadata；相互矛盾 Claim 共存并可进入 NEEDS_REVIEW；幂等和外键测试通过。
```

#### `RES-07`：Markdown/Obsidian Vault Writer

```text
执行 RES-07，依赖 RES-05、RES-06、RUST-03。专项阅读 docs/data/VAULT_SCHEMA.md、docs/architecture/INCREMENTAL_RESEARCH.md、DO_NOT_BREAK.md 和文件写入边界。

目标：把标准化 Knowledge/Claim/Evidence 生成 Obsidian-compatible Markdown Vault，使用 Frontmatter、wikilink、Source/Claim 引用和原子写入。

允许修改：Rust Vault Service、Markdown Renderer、合并检测、Fixture 和测试。禁止让 AI 直接覆盖用户修改、把 SQLite 当作唯一知识资产或在 Writer 内调用 LLM。

验收：目录、Slug、Node ID、Frontmatter、Links 稳定；临时文件+原子 Rename；用户修改触发 Merge Proposal/Conflict；Vault 删除应用后仍可被 Obsidian 使用。
```

#### `RES-08`：Graph Projection 与 D3 View

```text
执行 RES-08，依赖 RES-05、UI-03、UI-04。专项阅读 docs/frontend/DESIGN_SYSTEM.md、docs/frontend/PAGE_PATTERNS.md、docs/architecture/RESEARCH_ENGINE.md 和 Graph 规范。

目标：把 KnowledgeNode/Relation 投影成 D3 2D Graph，提供搜索、过滤、选择、聚类和 Inspector。

允许修改：Graph Feature、Graph Selector/Projection、D3 Renderer、注册业务组件和测试。禁止引入 3D、Vector Database、页面内硬编码 Token 或让 Graph 直接查询 SQLite。

验收：100 Node Fixture 可交互；500 Node 有过滤/增量更新策略；大规模数据有聚合/列表降级说明；键盘、空、加载、错误和选择状态通过测试。
```

#### `RES-10`：Timeline、Coverage 与 Gap 视图

```text
执行 RES-10，依赖 RES-02、RES-05、RES-06、W2-06、UI-03 和 UI-04。专项阅读 docs/PRD.md 的 Coverage、Gap、Views 和 Delivery Phases，docs/architecture/RESEARCH_ENGINE.md、docs/DATA_MODEL.md、相关 Page Spec、docs/frontend/PAGE_PATTERNS.md 和 docs/frontend/AI_FRONTEND_RULES.md。

目标：实现项目级 Timeline、Coverage 和 Gap 的最小可用投影。Coverage 必须使用 PRD V0.1 公式：0.4 任务完成度 + 0.3 知识广度 + 0.2 证据密度 + 0.1 来源多样性；质量、来源新鲜度、置信度和交叉验证作为解释字段，不得伪装成精确科学评分。Gap 至少支持“研究维度低于 0.6”或“少于两个独立高质量来源”的可解释判定，并提供由用户批准后创建后续 ResearchTask 的动作。

允许修改：Coverage/Gap/Timeline Domain Projection、类型化 Query Service、对应 Feature 页面、注册业务组件、Fixture 和测试。禁止修改原始 Task/Knowledge/Claim 语义、直接查询 SQLite、自动创建未经用户批准的任务、引入图表框架或把覆盖度结果写成不可追溯的结论。

验收：Timeline 能按事件/来源/Claim 显示时间顺序；Coverage 展示公式各项、输入数据、更新时间和缺失原因；Gap 显示触发规则、涉及维度和建议任务；用户批准前建议保持只读；Loading、Empty、Error、Keyboard、Responsive 状态有测试；100/500 节点或任务 Fixture 不阻塞基础页面；无真实 Provider、网络或 API Key。

如果 PRD 或数据契约缺少计算字段，停止实现并提出契约提案，不要在前端临时计算第二套指标。
```

#### `RES-09`：第一条完整研究旅程

```text
执行 RES-09，依赖 RES-01 至 RES-08 以及 RES-10 全部完成。专项阅读 docs/PRD.md、docs/ARCHITECTURE.md、docs/TESTING.md、所有相关 Feature/Page/Data Spec 和已完成任务交接记录。

目标：串联创建 Project → 配置 Research → 生成并批准 Plan → 执行 Mock Task DAG → 检查 Sources/Knowledge/Claims → 导出 Vault → 打开 Graph/Timeline/Coverage/Gap 的最小完整流程。

允许修改：集成层、必要的 Adapter 连接、E2E Fixture、流程文档和集成测试。禁止在集成任务中新增领域架构、绕过契约、使用真实 Provider 或掩盖子任务失败。

验收：离线环境完成完整流程；失败、暂停、恢复和取消可展示；关键 Claim 可追溯到 Evidence；Vault 不覆盖用户文件；Graph、Timeline、Coverage、Gap 与 Vault/SQLite 索引一致；Gap 建议在用户批准后才能转为新任务。
```

### W4 发布加固任务

#### `REL-01`：离线端到端质量门禁

```text
执行 REL-01，依赖 RES-09 和 TEST-04。专项阅读 docs/TESTING.md、.github/workflows/ci.yml、各语言测试规范和 AI 开发规则。

目标：运行并修正完整离线质量门禁：Format、Lint、Typecheck、Rust/Python/Frontend Unit、Schema Contract、Migration、Architecture、Playwright。

允许修改：测试配置、测试 Harness、明确的阻塞修复和质量文档。禁止为了通过检查而删除测试、放宽安全规则或加入真实 Provider。

验收：所有配置好的检查通过；失败有可复现命令；测试不需要 API Key/网络；报告覆盖未执行项目和已知限制。
```

#### `REL-02`：文档和示例同步

```text
执行 REL-02，依赖 REL-01。专项阅读 README.md、README.zh-CN.md、docs/PRD.md、docs/ARCHITECTURE.md、ROADMAP.md、CHANGELOG.md 和 docs/development/DOCUMENTATION_MAINTENANCE.md。

目标：让公开文档准确描述当前已完成的用户流程、安装方式、限制、Fixture、截图/Demo 和下一步。

允许修改：README、双语文档、Quick Start、示例说明、CHANGELOG、相关 Feature/Architecture 文档。禁止宣传尚未实现的功能或改变产品承诺。

验收：中英文 README 章节同步；链接有效；Quick Start 与实际命令一致；版本、Status、已知问题和 Demo 与代码一致；三组 Golden Fixture 均可离线校验，缺失时必须公开记录而不得声称已完成。
```

#### `REL-03`：隐私和公共边界审计

```text
执行 REL-03，依赖 REL-01 和 REL-02。专项阅读 AGENTS.md、DO_NOT_BREAK.md、private/LOCAL_AI_EXECUTION_RULES.md、SECURITY.md、.gitignore 和公共边界脚本。

目标：审计暂存区、提交内容和公开文档，确认没有 Secret、private/ 本地规则、对话、个人研究内容、数据库、Cache、日志或未脱敏 Provider Response。

允许修改：审计脚本、.gitignore、公开隐私文档和明确误纳入的公开文件。禁止把私有文件加入白名单或将个人内容复制到公共文档。

验收：scripts/check-public-boundary.ps1 通过；git ls-files private 只包含允许的占位文件；git diff --cached --name-only 不含私有内容；Secret 扫描和人工抽查通过。
```

#### `REL-04`：人工发布审查

```text
执行 REL-04，依赖 REL-03。专项阅读 docs/development/RELEASE_STRATEGY.md、CHANGELOG.md、ROADMAP.md、README、完整质量报告和所有 W3 集成交接。

目标：准备一个可审查的 Release Candidate，说明本次真实完成的能力、截图/Demo、已知问题、兼容性、限制和下一步。

允许修改：Release Notes、CHANGELOG、版本元数据和发布审查记录。禁止自动发布、夸大能力、隐藏失败测试或改变未批准的版本策略。

验收：维护者明确批准范围；版本来源一致；Release Notes 能说明用户为什么值得尝试；所有阻塞问题已处理或公开记录；发布动作由维护者最终执行。
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
