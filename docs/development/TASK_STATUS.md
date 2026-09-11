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
| `UI-01` | `Planned` | — | — | — |
| `UI-02` | `Planned` | — | — | — |
| `UI-03` | `Planned` | — | — | — |
| `UI-04` | `Planned` | — | — | — |
| `UI-05` | `Planned` | — | — | — |
| `RUST-01` | `Review` | — | 21 unit tests: typed command results serialize per `docs/API.md` envelope; stable error codes with safe user message, redacted detail, retryable flag, UUIDv7 correlation id | IPC/事件字段名为草案，待 W2-02/W2-05 冻结后核对 |
| `RUST-02` | `Review` | — | 空库迁移、逐步升级、幂等重跑、失败回滚不落版本、WAL+外键默认值均有测试（含文件级集成测试） | 001 列结构按 DATA_MODEL 推导，待 W2 契约核对；后续迁移只允许新编号文件 |
| `RUST-03` | `Review` | — | 提交/回滚、外键失败、重复 Idempotency Key 整体拒绝、结构化 DATABASE_ERROR（busy/locked 可重试）均有测试 | 事务边界仅在 Service/Repository 层；RES-02 将补全状态机 |
| `RUST-04` | `Review` | — | FakeKeychain 读写删、缺失/拒绝/不可用错误可区分 Retryable、错误与 Debug 输出不含密钥值、配置导出仅含 SecretRef | 错误码复用 PROVIDER_AUTH_FAILED，已提交 KEYCHAIN 专用码契约提案；真实 OS Keychain 适配待后续任务 |
| `RUST-05` | `Review` | — | Fake Worker 测试：健康启动+临时会话令牌、协议不兼容显式拒绝、崩溃重启退避有上限、耗尽报 WORKER_NOT_AVAILABLE、取消走协议、事件去重不重复转发 | 协议端点为 docs/API.md 草案；真实 HTTP Transport 待 W2-02 冻结后接入 |
| `PY-01` | `Planned` | — | — | — |
| `PY-02` | `Planned` | — | — | — |
| `PY-03` | `Planned` | — | — | — |
| `PY-04` | `Planned` | — | — | — |
| `PY-05` | `Planned` | — | — | — |
| `TEST-01` | `Planned` | — | — | — |
| `TEST-02` | `Planned` | — | — | — |
| `TEST-03` | `Planned` | — | — | — |
| `TEST-04` | `Planned` | — | — | — |
| **W2** |  |  |  |  |
| `W2-01` | `Review` | — | Project/ResearchConfig/Plan/Section/Task/TaskDependency/Run v1.0 冻结；同一语料下 ajv+Zod（108 测试）、jsonschema+Pydantic（56 测试）、Serde（corpus 3 套件）接受/拒绝一致 | 实现在 workgroup-a 分支；语料修正了 4 处三端漂移（Pydantic 宽松强转、数值范围缺失等） |
| `W2-02` | `Review` | — | worker-health/version/job-request/job-response/job-status/cancel/event/error v1.0 冻结（闭合信封）；`docs/api/WORKER_PROTOCOL.md` 定义会话令牌、协议兼容拒绝、SSE 序号/重连/脱敏/终止语义 | 同上；C 组 RUST-05 草案需对齐：protocol 1.0、`seq` 字段、事件枚举与闭合信封 |
| `W2-03` | `Review` | — | provider-config/usage-record v1.0 冻结；Token/Duration/Estimated Cost/CacheHit/Retries 可记录；`docs/api/PROVIDERS.md` 固化 key 引用、错误映射与路由规则 | 同上；Key 值仅经 Rust 注入进程环境 |
| `W2-04` | `Review` | — | prompt-metadata.v1 冻结：prompt_id/stage/SemVer、输入输出 schema 引用、模型能力提示、必填 golden cases；`packages/prompts/README.md` 固化版本纪律与 Cache Key 参与 | 同上；Prompt 资产由 D 组按规范落盘 |
| `W2-05` | `Planned` | — | — | — |
| `W2-06` | `Review` | — | source/source-content/knowledge-node/claim/evidence/relation/artifact v1.0 冻结；Source→Evidence→Claim→Knowledge 链与冲突共存语义写入 schema 及 `docs/data/*` | 同上；Claim≠Knowledge、Evidence 必须引用 Source+locator |
| **W3** |  |  |  |  |
| `RES-01` | `Planned` | — | — | — |
| `RES-02` | `Planned` | — | — | — |
| `RES-03` | `Planned` | — | — | — |
| `RES-04` | `Planned` | — | — | — |
| `RES-05` | `Planned` | — | — | — |
| `RES-06` | `Planned` | — | — | — |
| `RES-07` | `Planned` | — | — | — |
| `RES-08` | `Planned` | — | — | — |
| `RES-09` | `Planned` | — | — | — |
| `RES-10` | `Planned` | — | — | — |
| **W4** |  |  |  |  |
| `REL-01` | `Planned` | — | — | — |
| `REL-02` | `Planned` | — | — | — |
| `REL-03` | `Planned` | — | — | — |
| `REL-04` | `Planned` | — | — | — |
