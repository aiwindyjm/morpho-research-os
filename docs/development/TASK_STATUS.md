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
| `W0-01` | `Planned` | — | — | — |
| `W0-02` | `Planned` | — | — | — |
| `W0-03` | `Planned` | — | — | — |
| `W0-04` | `Planned` | — | — | — |
| `W0-05` | `Planned` | — | — | — |
| `W0-06` | `Planned` | — | — | — |
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
| `TEST-01` | `Review` | `f878c6c` | 三组 Golden Fixture（quantum-entanglement / brain-computer-interface / large-language-model）输入侧通过 Node/Python/Rust 三语言 Loader 离线校验，summary 一致；7 组非法用例按规则码明确失败 | expected_outputs 待 W2-01/W2-06 冻结后补充；envelope 契约见 examples/fixtures/README.md |
| `TEST-02` | `Planned` | — | — | — |
| `TEST-03` | `Review` | `9c6e3ac` | check-contracts/check-architecture 本地全绿；红灯验证确认前端越界、真实 Provider、fixture 漂移均可发现；检测器自测 9 用例通过 | contracts.yml 已加入，首次 CI 运行待合并推送后确认 |
| `TEST-04` | `Planned` | — | — | — |
| **W2** |  |  |  |  |
| `W2-01` | `Planned` | — | — | — |
| `W2-02` | `Planned` | — | — | — |
| `W2-03` | `Planned` | — | — | — |
| `W2-04` | `Planned` | — | — | — |
| `W2-05` | `Planned` | — | — | — |
| `W2-06` | `Planned` | — | — | — |
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
