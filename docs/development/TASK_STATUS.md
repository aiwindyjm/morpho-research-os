# 任务状态追踪

本文件是公开的任务完成状态索引，与 `docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md` 的任务 ID 一一对应。它只记录真实公开工作结果，不记录个人日期、每日配额、私有批次或本地执行笔记。

## 使用规则

- 每个任务只能有一个状态行；任务 ID 不得复用。
- 开始实际工作后改为 `In Progress`；提交 PR 后改为 `Review`；合并并通过验收后改为 `Merged`。
- 阻塞必须写明公开可复现的原因和解除条件；延期必须说明产品或契约依据。
- `Commit / PR` 只填写公开提交或 PR 链接；不填写本地分支、私有路径、个人计划或对话内容。
- 一次提交可以完成一个或多个任务，但提交说明必须列出实际完成的任务 ID。

## 状态定义

| 状态 | 含义 |
|---|---|
| `Planned` | 任务已定义，尚未开始 |
| `In Progress` | 已开始实现，尚未提交可审查结果 |
| `Review` | 已提交 PR，等待审查或修订 |
| `Merged` | 已合并，验收条件已满足 |
| `Blocked` | 依赖、契约或外部条件阻塞 |
| `Deferred` | 经维护者决定暂缓，不能当作完成 |

## 当前状态

| 任务 ID | 状态 | Commit / PR | 验收证据 | 备注 |
|---|---|---|---|---|
| **W0** |  |  |  |  |
| `W0-01` | `Review` | — | 目录树与所有权表一致；UI→Rust→Worker 依赖方向、SQLite/Secrets/Filesystem/Vault 权限归属唯一；文档链接有效 | 实现在 workgroup-a 分支待维护者审查 |
| `W0-02` | `Review` | — | `packages/schemas/README.md` 固定 canonical source、命名/$id、minor-enum 版本规则、破坏性变更流程与跨语言校验方式 | 同上；schema_version 为已发布 minor 枚举 |
| `W0-03` | `Review` | — | `docs/development/VERSIONS.md` 固定六类版本唯一来源与兼容/拒绝/迁移矩阵 | 同上；协议版本随 worker-*.v1 冻结为 1.0 |
| `W0-04` | `Review` | — | CI 含 docs/边界/任务状态检查与条件化 TS/Python/Rust 契约门禁；`docs/TESTING.md` 命令与 CI 一致 | 同上；无目标工具链显式跳过不虚过 |
| `W0-05` | `Review` | — | `fixture-envelope.v1.json` + `examples/fixtures/README.md` 规范；最小合成 Fixture 通过 `scripts/validate-fixture.py --all` | 同上；TEST-01 需按此规范实现 Loader |
| `W0-06` | `Review` | — | 根 pnpm/Cargo/uv 工作区与锁文件；`scripts/check-toolchain.ps1` 验证版本；桌面核心 crate 已并入 Cargo workspace 并通过 83 项测试 | 同上；uv/cargo members 随新包追加 |
| **W1** |  |  |  |  |
| `UI-01` | `Review` | `8082dc7` | `pnpm dev` 可启动（HTTP 200 冒烟验证）；`tsc --noEmit` 与 Vite 构建通过；App 挂载冒烟测试通过 | React 19 + Vite + Tailwind 4；仅应用壳，无业务流程 |
| `UI-02` | `Review` | `8082dc7` | `packages/ui` 语义 Token（对齐 docs/frontend/DESIGN_TOKENS.md）+ 16 个注册原语；19 个组件测试通过（键盘/焦点/禁用/加载） | Token 具体色值为 V0.1 提案，待维护者审查 |
| `UI-03` | `Review` | `8082dc7` | 工作区布局 240px 侧栏/自适应画布/320px Inspector；<1024 折叠 Inspector、<768 抽屉侧栏（Escape 关闭）；跳转链接与焦点顺序有测试；每视图 Loading/Empty/Error | 导航为类型化视图注册表，未引入路由依赖 |
| `UI-04` | `Review` | `8082dc7` | 类型化 Command Map + `{schema_version, request_id, data, error}` 信封（docs/API.md）+ docs/api/ERRORS.md 错误模型；查询键集中含 projectId；响应经 Zod 注册表校验；Mock Transport 覆盖成功/失败/取消/故障注入（6 测试） | 组件不直接调用传输层 |
| `UI-05` | `Review` | `8082dc7` | 助手绑定当前项目并显示上下文；四类动作（解释进度/建议下一任务/查看待审核/记录决定）；决定仅显式保存；项目切换上下文隔离有测试 | 仅 Mock 服务，无 Provider 调用与持久化 |
| `RUST-01` | `Review` | — | 21 unit tests: typed command results serialize per `docs/API.md` envelope; stable error codes with safe user message, redacted detail, retryable flag, UUIDv7 correlation id | IPC/事件字段名为草案，待 W2-02/W2-05 冻结后核对 |
| `RUST-02` | `Review` | — | 空库迁移、逐步升级、幂等重跑、失败回滚不落版本、WAL+外键默认值均有测试（含文件级集成测试） | 001 列结构按 DATA_MODEL 推导，待 W2 契约核对；后续迁移只允许新编号文件 |
| `RUST-03` | `Review` | — | 提交/回滚、外键失败、重复 Idempotency Key 整体拒绝、结构化 DATABASE_ERROR（busy/locked 可重试）均有测试 | 事务边界仅在 Service/Repository 层；RES-02 将补全状态机 |
| `RUST-04` | `Review` | — | FakeKeychain 读写删、缺失/拒绝/不可用错误可区分 Retryable、错误与 Debug 输出不含密钥值、配置导出仅含 SecretRef | 错误码复用 PROVIDER_AUTH_FAILED，已提交 KEYCHAIN 专用码契约提案；真实 OS Keychain 适配待后续任务 |
| `RUST-05` | `Review` | — | Fake Worker 测试：健康启动+临时会话令牌、协议不兼容显式拒绝、崩溃重启退避有上限、耗尽报 WORKER_NOT_AVAILABLE、取消走协议、事件去重不重复转发 | 协议端点为 docs/API.md 草案；真实 HTTP Transport 待 W2-02 冻结后接入 |
| `PY-01` | `Review` | `7b68b93` | pytest 23 passed: importable package, key-reference-only config (raw values rejected), env overrides, structured error envelope | Worker 源码包与配置边界 |
| `PY-02` | `Review` | `3cf34e9` | pytest 34 passed: /health 与 /version 契约、协议兼容探测、会话令牌、本地 Server/Client | stdlib 草案传输，正式协议由 W2-02 冻结 |
| `PY-03` | `Review` | `ff1aff5` | pytest 48 passed: research.event.v1 信封、逐 job 序列、游标重连、重复识别、脱敏、JSONL/SSE 编解码、关闭状态 | 有序追加式事件原语 |
| `PY-04` | `Review` | `7fc835b` | pytest 77 passed: 领域模型契约校验、Parse→Validate→Normalize 门禁（缓存命中/重试/失败分类）、阶段端口与幂等 ResultSink、Orchestrator 调度骨架 | LLM 输出无法绕过门禁 |
| `PY-05` | `Review` | `b087fbc` | pytest 96 passed: Mock 场景（超时/认证/不可用/非法输出）、OpenAI-compatible 草案适配器（注入 transport，测试零网络）、工厂角色路由、Usage Record（Token/时长/成本/缓存命中）、有界重试 | 端点安全规则：https 任意主机、http 仅环回 |
| `TEST-01` | `Review` | `f878c6c` | 三组 Golden Fixture（quantum-entanglement / brain-computer-interface / large-language-model）输入侧通过 Node/Python/Rust 三语言 Loader 离线校验，summary 一致；7 组非法用例按规则码明确失败 | expected_outputs 待 W2-01/W2-06 冻结后补充；envelope 契约见 examples/fixtures/README.md |
| `TEST-02` | `Planned` | — | — | — |
| `TEST-03` | `Review` | `9c6e3ac` | check-contracts/check-architecture 本地全绿；红灯验证确认前端越界、真实 Provider、fixture 漂移均可发现；检测器自测 9 用例通过 | contracts.yml 已加入，首次 CI 运行待合并推送后确认 |
| `TEST-04` | `Planned` | — | — | — |
| **W2** |  |  |  |  |
| `W2-01` | `Review` | — | Project/ResearchConfig/Plan/Section/Task/TaskDependency/Run v1.0 冻结；同一语料下 ajv+Zod（108 测试）、jsonschema+Pydantic（56 测试）、Serde（corpus 3 套件）接受/拒绝一致 | 实现在 workgroup-a 分支；语料修正了 4 处三端漂移（Pydantic 宽松强转、数值范围缺失等） |
| `W2-02` | `Review` | — | worker-health/version/job-request/job-response/job-status/cancel/event/error v1.0 冻结（闭合信封）；`docs/api/WORKER_PROTOCOL.md` 定义会话令牌、协议兼容拒绝、SSE 序号/重连/脱敏/终止语义 | 同上；C 组 RUST-05 草案需对齐：protocol 1.0、`seq` 字段、事件枚举与闭合信封 |
| `W2-03` | `Review` | — | provider-config/usage-record v1.0 冻结；Token/Duration/Estimated Cost/CacheHit/Retries 可记录；`docs/api/PROVIDERS.md` 固化 key 引用、错误映射与路由规则 | 同上；Key 值仅经 Rust 注入进程环境 |
| `W2-04` | `Review` | — | prompt-metadata.v1 冻结：prompt_id/stage/SemVer、输入输出 schema 引用、模型能力提示、必填 golden cases；`packages/prompts/README.md` 固化版本纪律与 Cache Key 参与 | 同上；Prompt 资产由 D 组按规范落盘 |
| `W2-05` | `Blocked` | — | 原因：真实 IPC Transport 尚未接入（契约 W2-01/W2-02 已随 workgroup-a 合并入 main，但 `apps/desktop/src/services/transportProvider.ts` 仍默认 Mock）；按规则不得自行定义接口。解除条件：在 `apps/desktop/src/services/transportProvider.ts` 注册真实 Tauri Transport | 前端已预留类型化接入点与 Mock/真实一致的 Service 边界（`8082dc7`） |
| `W2-06` | `Review` | — | source/source-content/knowledge-node/claim/evidence/relation/artifact v1.0 冻结；Source→Evidence→Claim→Knowledge 链与冲突共存语义写入 schema 及 `docs/data/*` | 同上；Claim≠Knowledge、Evidence 必须引用 Source+locator |
| **W3** |  |  |  |  |
| `RES-01` | `Review` | `acb2819` | pytest 105 passed: Planner 仅生成 pending_review 草案；非法 Mock LLM 输出可恢复、永久失败无部分产物；维度回填与稳定 ID；PlanStore 审批门禁 require_approved | 批准前不执行 DAG（RES-02/集成测试再证） |
| `RES-02` | `Review` | `5c65a32` | pytest 16 项 DAG 测试通过：合法状态机、环/未知依赖拒绝、并行 fan-out/fan-in、暂停/恢复/取消、有界重试+退避、Checkpoint 崩溃恢复幂等、幂等键去重、依赖失败级联；73cdc7d 完成 Orchestrator 集成 | 状态经存储端口持久化，Worker 不写 SQLite |
| `RES-03` | `Review` | `eaf0c36` | 10 项 Search 测试通过：URL 规范化与跨运行稳定去重键、批内去重、缓存命中不重复消耗 Provider、搜索 Usage 可追踪、Provider 失败结构化传播 | 同 URL/规范化 URL 行为明确 |
| `RES-04` | `Review` | `ac84ff3` | 10 项抽取测试通过：内容指纹级去重（同内容一次抽取）、来源质量可解释四维评估、空白内容 SOURCE_PARSE_FAILED、非法输出重试后无部分产物 | 质量非真伪判定，note 字段固化 |
| `RES-05` | `Review` | `9a00791` | 7 项归一化测试通过：别名合并、跨运行稳定节点/关系 ID、Provenance 并集、确定性排序、冲突不落入节点摘要、不可解析关系确定性丢弃 | Claim 不等于 Knowledge |
| `RES-06` | `Review` | `fa4e923` | 7 项 Claim 测试通过：确定性 Claim ID 合并共存、Evidence 定位与 support 方向、无定位不可 confirmed、丢弃记录带原因、冲突共存进入 NEEDS_REVIEW、验证报告可校验 | 后 Claim 不覆盖前 Claim |
| `RES-07` | `Planned` | — | — | — |
| `RES-08` | `Review` | `8082dc7` | 前端交付：D3 2D 力导向图谱（SVG）、搜索/类型/维度过滤、节点键盘选择与 GraphNodeInspector、无障碍列表降级；14 节点 Fixture 有测试（5 个 GraphPage 测试） | 图谱数据投影为 Mock 实现；接入真实 Knowledge/Relation 投影待 W2-06 与 RES-05 合并后完成 |
| `RES-09` | `Planned` | — | — | — |
| `RES-10` | `Review` | `8082dc7` | 前端交付：Timeline（倒序事件投影）、Coverage 面板逐维展示 PRD 公式分量/权重/原始输入/原因、Gap 卡（覆盖率<0.6 或独立高质量来源<2 的可解释判定）；建议批准前只读、批准后才创建任务（GapsPage 3 测试 + 后端投影测试） | 覆盖度/缺口投影当前由 Mock 服务按 PRD §14 公式实现；真实投影接入待 RES-02/RES-05/RES-06 与 W2-06 合并后完成 |
| **W4** |  |  |  |  |
| `REL-01` | `Planned` | — | — | — |
| `REL-02` | `Planned` | — | — | — |
| `REL-03` | `Planned` | — | — | — |
| `REL-04` | `Planned` | — | — | — |
