# 任务状态追踪

本文件是公开的任务完成状态索引，与 `docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md` 的任务 ID 一一对应。它只记录真实公开工作结果，不记录个人日期、每日配额、私有批次或本地执行笔记。计划外的收尾批次条目以文字标签记录在表末，不占用计划任务 ID。

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
| `W2-05` | `Review` | `38c5ee3` | 真实 Tauri IPC Transport 落地：`tauriTransport.ts` 检测到 `window.__TAURI__` 时自动启用，Web 预览/vitest/E2E 自动回退 Mock；在 `transportProvider.ts` 完成注册（满足原解除条件）；请求/响应信封、错误、取消与事件类型 Mock/真实一致，`tauriTransport.test.ts` 覆盖命令映射、错误映射与回退行为 | CHANGELOG「Unreleased」已记录；仅自动化验证，待维护者验收 |
| `W2-06` | `Review` | — | source/source-content/knowledge-node/claim/evidence/relation/artifact v1.0 冻结；Source→Evidence→Claim→Knowledge 链与冲突共存语义写入 schema 及 `docs/data/*` | 同上；Claim≠Knowledge、Evidence 必须引用 Source+locator |
| **W3** |  |  |  |  |
| `RES-01` | `Review` | `acb2819` | pytest 105 passed: Planner 仅生成 pending_review 草案；非法 Mock LLM 输出可恢复、永久失败无部分产物；维度回填与稳定 ID；PlanStore 审批门禁 require_approved | 批准前不执行 DAG（RES-02/集成测试再证） |
| `RES-02` | `Review` | `5c65a32` | pytest 16 项 DAG 测试通过：合法状态机、环/未知依赖拒绝、并行 fan-out/fan-in、暂停/恢复/取消、有界重试+退避、Checkpoint 崩溃恢复幂等、幂等键去重、依赖失败级联；73cdc7d 完成 Orchestrator 集成 | 状态经存储端口持久化，Worker 不写 SQLite |
| `RES-03` | `Review` | `eaf0c36` | 10 项 Search 测试通过：URL 规范化与跨运行稳定去重键、批内去重、缓存命中不重复消耗 Provider、搜索 Usage 可追踪、Provider 失败结构化传播 | 同 URL/规范化 URL 行为明确 |
| `RES-04` | `Review` | `ac84ff3` | 10 项抽取测试通过：内容指纹级去重（同内容一次抽取）、来源质量可解释四维评估、空白内容 SOURCE_PARSE_FAILED、非法输出重试后无部分产物 | 质量非真伪判定，note 字段固化 |
| `RES-05` | `Review` | `9a00791` | 7 项归一化测试通过：别名合并、跨运行稳定节点/关系 ID、Provenance 并集、确定性排序、冲突不落入节点摘要、不可解析关系确定性丢弃 | Claim 不等于 Knowledge |
| `RES-06` | `Review` | `fa4e923` | 7 项 Claim 测试通过：确定性 Claim ID 合并共存、Evidence 定位与 support 方向、无定位不可 confirmed、丢弃记录带原因、冲突共存进入 NEEDS_REVIEW、验证报告可校验 | 后 Claim 不覆盖前 Claim |
| `RES-07` | `Review` | `39cab0e` | Vault Writer 落地：15 个 PRD Vault 目录与全部笔记类型（含 Sources/Claims/Maps MOC）、稳定 slug/frontmatter、幂等 wikilink、临时文件+原子改名写入、用户修改返回 Merge Proposal 而非覆盖；`vault.rs` 13 项单测 + `vault_sqlite.rs` 集成测试通过；`6f15d45` 接入 Map 导出与 orchestrator pump | 仅自动化验证（CHANGELOG「Unreleased」）；待维护者验收 |
| `RES-08` | `Review` | `8082dc7` | 前端交付：D3 2D 力导向图谱（SVG）、搜索/类型/维度过滤、节点键盘选择与 GraphNodeInspector、无障碍列表降级；14 节点 Fixture 有测试（5 个 GraphPage 测试） | 图谱数据投影为 Mock 实现；接入真实 Knowledge/Relation 投影待 W2-06 与 RES-05 合并后完成 |
| `RES-09` | `Review` | `20c7064` | Playwright 首条完整旅程套件：项目 → 研究配置 → 草案 Plan 批准并启动 Run → Sources → Knowledge/Claims/Evidence → Graph → Reports（含覆盖度指标）；`journey.spec.ts` 7 项、全套 11 specs 在 CI frontend-e2e 门禁对 Mock Transport 全绿 | 按 PRD 定义以 Mock 执行；Timeline/Gap 视图走查、Vault 导出与真实 worker 冒烟未含（见收尾批次条目） |
| `RES-10` | `Review` | `8082dc7` | 前端交付：Timeline（倒序事件投影）、Coverage 面板逐维展示 PRD 公式分量/权重/原始输入/原因、Gap 卡（覆盖率<0.6 或独立高质量来源<2 的可解释判定）；建议批准前只读、批准后才创建任务（GapsPage 3 测试 + 后端投影测试） | 覆盖度/缺口投影当前由 Mock 服务按 PRD §14 公式实现；真实投影接入待 RES-02/RES-05/RES-06 与 W2-06 合并后完成 |
| **分支集成与本地计算闭环** |  |  |  |  |
| `INT-01` | `Review` | `94ab7aa` | 三组工作区分支串行合入 main：Fixture 工具链与边界检查（contracts.yml CI、check-contracts/check-architecture、TS Fixture Loader）、v1.0 契约与 Fixture 语料（packages/schemas、packages/prompts、ci.yml、WORKER_PROTOCOL.md 等，合并提交 `86d7c30`）、Python 研究引擎（合并时 160 项 pytest 通过，合并提交 `826abd4`）；`277f9c7` 对齐 golden fixture 与 research-config v1 并隔离 rust-loader；`3946720` 移除复活的前端视图并对齐 mock 配置 | 集成任务串行执行；合并后契约/架构/边界检查与各语言测试全绿 |
| `PY-06` | `Review` | `0f981f8` | pytest 164 passed：default/local/offline 三 profile 预设仅改角色路由与 offline_mock，不新增 Provider；显式 `MORPHO_ROLE_*` 覆盖优先于 `MORPHO_PROFILE`；未知 profile 明确报错 | `local` 路由 8B 本地规划模型的质量取舍见 docs/ai/MODEL_ROUTING.md |
| `PY-07` | `Review` | `cb7f912` | pytest 185 passed：SearXNG JSON API 适配器仅经 `search_for(search_provider_id=...)` 显式启用，默认仍为 mock；https/环回 http 端点构造期校验、不跟随重定向；超时/连接/429/5xx 可重试 SEARCH_FAILED，其余 4xx 与不可读载荷不可重试；URL 规范化去重与 time_range 桶映射；测试注入 transport 零真实网络 | 无凭据需求；未知 id 或非 search kind 为结构化 PROVIDER_UNAVAILABLE，不做静默 mock 回退 |
| `PY-08` | `Review` | `6a68d1d` | pytest 190 passed（`c6c05e7` 修正后 192）：无 `--approve` 仅落 plan.json 且不执行 DAG；`--approve` 后只写白名单 8 个结果文件；退出码 0/1/2 语义与 provider 误配置清晰报错有测试 | CLI 不能绕过 PlanStore 审批门禁；`--profile` 默认 offline（零网络零凭据） |
| **W4** |  |  |  |  |
| `REL-01` | `Planned` | — | — | — |
| `REL-02` | `Planned` | — | — | — |
| `REL-03` | `Planned` | — | — | — |
| `REL-04` | `Planned` | — | — | — |
| **收尾批次（计划外条目，不占用计划任务 ID）** |  |  |  |  |
| 收尾·品牌资产 | `Review` | `0541100` | 桌面图标全套（icns/ico/多尺寸 png）与 Web favicon 替换；`docs/assets/brand/` 预留品牌资产及说明；`tauri.conf.json` 图标配置同步 | 资产与配置变更，无行为门禁；待维护者验收 |
| 收尾·法律采用 | `Review` | `cab14ea` | Apache-2.0 全文 LICENSE、NOTICE 与 TRADEMARKS.md 预留商标政策落盘；根与各包 license 字段统一为 Apache-2.0 | 文档与包元数据变更；待维护者验收 |
| 收尾·会话失效 | `Review` | `65b39b7` | `sessionState.ts` 主动会话失效服务接入 workspaceStore（项目锁定/权限收回/版本失效清理），配套测试覆盖失效路径 | 仅自动化验证；待维护者验收 |
| 收尾·Token与a11y | `Review` | `1414d43` | 语义 Token 与效果层扩充、a11y 加固与原型整改；`DESIGN_TOKENS.md`/`COMPONENT_REGISTRY.md` 同步；App/Config/Overview/Tasks 页与 `packages/ui` overlays 测试扩充 | 仅自动化验证（vitest）；待维护者验收 |
| 收尾·ADR-014提案 | `Review` | `74c64f8` | ADR-014（shadcn/ui + React Router）提案落盘（Proposed）；TECH_STACK 与 AGENTS 基线同步 | 提案文档；批准事项见下方延期条目 |
| 收尾·Docker修复 | `Review` | `55a89da` | web 镜像 registry-mirror build arg 与缺失的 schemas 拷贝修复；`docs/deployment/DOCKER.md` 同步 | 构建配置修复；待维护者验收 |
| 收尾·批次一前端接线 | `Review` | `0ef7189` | run.get/run.cancel 接真实通道（会话级 job 注册表桥接 worker job_id）；Command Map 32→39，新增 run.cancel、secrets.setProviderKey、secrets.listProviders、vault.exportProject、project.archive、core.info、core.ping；SettingsPage 真实化（core.info 连接状态 + 密钥环读写）；Knowledge Vault 导出启用；SSE→Query 失效桥接 + sessionState 失效调用点；ProjectsPage「打开项目」导航修复。注：config.get/update 实际映射到批次二的 research_config_get/put（Rust `config_get/put` 为应用配置而非研究配置，见 ADR-020）。vitest 146→177 全绿 + typecheck 干净 | 仅自动化验证；待维护者验收 |
| 收尾·批次二Rust命令 | `Review` | `353435f` + `c14e1cd` | 经 ADR-020（Proposed）新增 9 个 Rust 命令（plan_regenerate、plan_update_task、plan_reject、evidence_list_by_claim、graph_get、gap_approve_proposal、gap_dismiss_proposal、research_config_get、research_config_put）+ 迁移 003（plan 元数据与 gap_decisions 表）；前端 9 命令全部接线，ConfigPage/PlanPage 操作/GraphPage 真数据/Gap 接受驳回/证据展开在桌面端可用。cargo 218+6 测试、clippy -D warnings、fmt 全绿；vitest 189 全绿 | LLM 版 plan 重生成受冻结 worker wire 限制为脚本规划器（ADR-020 记录）；gap 决策读回与 plan 分节读回暂由传输层会话合并/缓存桥接，为核心侧读命令候选；待维护者验收 |
| 收尾·SSE事件消费 | `Review` | `0ef7189` | `src/app/bridges.tsx` 消费 `morpho://events`：事件类型前缀映射到当前项目 Query key 失效（task/plan/source/claim/knowledge/review 域，终态 run 扩大失效范围并刷新项目列表）；轮询保留为自降级兜底；项目切换经 workspaceStore 同步触发 `purgeVolatileSessionState`；事件词汇表无项目锁定/权限收回类事件（已核实），sessionState 文档记录了未来接入配方 | 仅自动化验证（8 项 bridges 测试）；待维护者验收 |
| 收尾·真实worker冒烟 | `Review` | `78531b1` | 首次真实进程端到端冒烟通过：`real_worker_smoke.rs`（`#[ignore]` 门控，CI 保持离线）经真实 Supervisor/WorkerProcess 拉起 `python -m morpho_worker.serve`（offline profile）→ scripted plan 批准 → research_run job → 12/12 worker 任务完成、30 条事件严格单调持久化、run 完成、Vault 导出 Map 笔记（临时目录遏制 + slug 白名单断言）；复跑方式与证据见 `docs/testing/REAL_WORKER_SMOKE.md` | 已知边界（ADR-019 phase 1）：worker 侧任务 id 无法推进核心任务投影、无 source/claim 投影故 knowledge_list 为空、导出仅含 Map 笔记；stdin EOF 会停 worker（冒烟需 `sleep 300 |` 管道）；冷启动可超 15s 由有界重启吸收；待维护者桌面手工验收 |
| 收尾·Settings真实实现 | `Review` | `0ef7189` | 连接卡（core.info：在线/离线/版本/通道）+ 提供商密钥卡（secrets.listProviders 现状徽标、密码输入 autocomplete off、secrets.setProviderKey 保存后即清、值不落任何前端持久层）；加载/空/错误态与 a11y 对齐同侪页面；5 项页面测试 | 仅自动化验证；待维护者验收 |
| 收尾·Vault导出入口 | `Review` | `0ef7189` | KnowledgePage「导出 Vault」一键启用（vault.exportProject）：成功/冲突警示/错误 toast 含计数与 vault_root；成功/失败 2 项交互测试 | 仅自动化验证；待维护者验收 |
| 收尾·延期·任务操作 | `Deferred` | — | — | 延期原因：task.pause/task.resume/task.retry/task.cancel 依赖 ADR-019 phase 2（Rust 侧逐任务派发与任务 id 对齐）；phase 1 投影权威下无对应核心命令 |
| 收尾·延期·助手真实AI | `Deferred` | — | — | 延期原因：assistant.* 真实 AI 交互按产品节奏推迟至 V0.2；当前仅 Mock 服务 |
| 收尾·延期·ADR-014批准 | `Deferred` | — | — | 维护者决定项：ADR-014（shadcn/ui + React Router）现为 Proposed，待批准 |
| 收尾·延期·wire漂移批准 | `Deferred` | — | — | 维护者决定项：docs/API.md 标记的六类 worker wire draft 漂移（协议版本串、job_id 铸造方、状态枚举、取消语义、传输层错误码、ProviderConfig 字段名）待冻结批准 |
