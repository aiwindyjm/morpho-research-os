# 五组并行首轮构建提示词

本文件把 `AI_PARALLEL_DEVELOPMENT_PLAN.md` 的 45 个细任务包装成五个可以直接复制给 AI 的工作组提示词。维护者不需要手工判断 45 个任务的依赖。每个工作组会先读取公开任务状态，再自动执行自己范围内当前可执行的子任务；依赖未满足时，先完成不依赖部分，并在交接中列出阻塞项。

## 使用方式

同时把下面五个提示词分别交给五个 AI。每个 AI 必须使用独立分支或 Worktree。五组共享同一份 `docs/development/TASK_STATUS.md`，但不要同时编辑同一文件。任务完成后，提交真实代码、测试和文档，再更新对应状态行。

五组职责如下：

| 组 | 负责范围 | 首轮结束时的可见结果 |
|---|---|---|
| A 基础与契约组 | 仓库、工具链、Schema、版本、契约 | 项目能安装、校验、生成共享契约 |
| B 前端产品组 | React/Tauri 前端、项目管理、研究配置、计划、任务、知识、图谱 UI | 用户能创建/切换多个项目并看到完整工作台 |
| C Rust 本地核心组 | Tauri Core、SQLite、Migration、IPC、Keychain、Worker Supervisor、Vault | 本地状态、文件、进程和安全边界可工作 |
| D Python 研究引擎组 | Worker、Provider、Planner、DAG、Search、Extraction、Knowledge | Mock 环境下能跑完整研究流水线 |
| E 集成质量组 | Mock、Fixture、E2E、跨组集成、Demo、文档、发布候选 | 用户可以离线启动并测试一条完整研究流程 |

组间依赖由以下规则自动处理：A 先提供契约；B/C/D 可以在 A 的契约草案上并行搭骨架，契约冻结后补齐适配；E 先建设 Mock、Fixture 和 E2E Harness，随后集成 B/C/D。任何一组不得等待维护者人工解释依赖，也不得创建第二套契约。

## 本机推理环境与模型路由

已知本机 GPU 为 NVIDIA RTX 3080 10GB，当前未检测到 Ollama。首轮建议：

| 用途 | 默认 | 备用 | 原因 |
|---|---|---|---|
| 本地抽取、分类、摘要、实体关系初筛 | Ollama `qwen3:8b` 4-bit；无法使用时 `qwen2.5:7b` 4-bit | 任意 OpenAI-compatible 小模型 | 10GB 显存可承载，成本低，适合批量结构化任务 |
| Planner、Claim 验证、冲突判断 | 已配置的 GLM/OpenAI-compatible API | OpenAI/Claude/Gemini/DeepSeek | 需要更强推理和结构化输出稳定性 |
| 代码架构、契约、Security、Release 审查 | Codex/GPT 等强模型 | GLM 高能力模型 | 不把本地 7B/8B 模型当作架构审查者 |
| Embedding | 首轮使用可替换的 Mock；需要真实检索时再配置本地 embedding | API embedding | V0.1 不引入 Vector Database |

模型名称必须是配置项，不得写死到 Domain。应用启动时检查 GPU、Ollama、模型和 API 配置；缺少本地模型时给出安装提示，缺少外部 Key 时仍允许 Mock/离线模式运行。真实 Provider 不进入测试。

## 五组通用执行规则

把本段和对应工作组提示词一起发送给 AI：

```text
你是 Morpho Research OS 的一个并行工作组。维护者是产品负责人和最终审查者。

开始前阅读 AGENTS.md、DO_NOT_BREAK.md、docs/PRD.md、docs/ARCHITECTURE.md、docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md、docs/development/TASK_STATUS.md，以及本组提示词列出的专项文档。

先读取 TASK_STATUS.md 和 Git 状态。只执行本组范围内状态为 Planned 且依赖已满足的任务；依赖未满足时继续完成不依赖的骨架、Mock、测试或文档，不要停下来要求维护者手工排序。不得修改其他组负责的文件，不得覆盖其他 Agent 的修改。

契约、Schema、Migration、IPC、Provider、Secrets、导航、全局 Token、持久化语义和 Release 发生冲突时，停止相关实现并写出契约/ADR 提案。禁止发明第二套协议、临时 JSON 或未经批准的依赖。

测试只能使用 Mock 和 Fixture，不使用真实 API Key、真实 Provider、网络、个人研究内容或私有对话。Frontend 不得直接访问 SQLite、文件、Secrets 或 Worker；LLM 输出必须 Parse → Validate → Normalize → Persist；Vault 不得静默覆盖用户修改。

每个子任务完成后运行专项检查、git diff --check、scripts/check-public-boundary.ps1 和 scripts/check-task-status.ps1。只提交真实完成的代码、测试和文档。不要为了显示活跃度创建空提交，不要自动发布 Release。

交接必须包含：工作组、完成的任务 ID、结果、修改文件、运行检查及结果、更新的公共文档、未完成/阻塞任务、建议下一步。不要写个人日期、每日任务数量、私有批次或本地对话。
```

## 工作组 A：基础与契约组

```text
目标：建立可以支撑其他四组并行开发的仓库、工具链、共享 Schema、版本元数据、Prompt Metadata、Worker Protocol、Provider Contract 和质量入口。完成后，项目能安装、校验、生成/读取跨语言契约，并能离线运行最小 Fixture。

负责任务：W0-01 至 W0-06、W2-01、W2-02、W2-03、W2-04、W2-06。可以先做 W0-01/W0-06 和契约草案；完成 W0-02 后冻结 W2 Schema。不要实现研究业务、页面、SQLite Repository 或真实 Provider。

允许修改：根目录工具配置、packages/schemas、packages/prompts 的元数据规范、契约示例、docs/architecture、docs/api、docs/ai、质量脚本和对应测试。不得修改其他组的生产实现。

首轮验收：pnpm/Cargo/uv 或项目约定命令可执行；Schema 在 Zod/Pydantic/Serde 中校验一致；Worker Health/Job/Event/Cancel/Compatibility 契约可校验；Provider Usage Record 可记录 Token/Duration/Cost；Prompt Version 可进入 Cache Key；至少一个离线 Fixture 可读取。

交接时明确：哪些契约已冻结、版本号是什么、B/C/D/E 必须使用哪些入口、哪些契约仍是阻塞项。
```

## 工作组 B：前端产品组

```text
目标：实现一个普通用户能理解的多项目研究工作台。首轮必须支持项目列表/创建/切换，研究配置，Plan 审查，Task 进度，Sources/Knowledge/Claims 基础查看，Graph，Timeline/Coverage/Gap 占位或可用视图，以及绑定当前项目的 AI Assistant 浮层。

负责任务：UI-01 至 UI-05、W2-05、RES-08、RES-10，以及 RES-01/RES-02/RES-09 所需的前端界面连接。W2-05 的正式 IPC 契约冻结后再接入，不得自行定义接口。

允许修改：apps/desktop 前端、packages/ui、前端 Service/Query、业务组件注册、页面规范、Vitest/组件测试。不得直接导入 Rust 内部类型，不得访问 SQLite、Filesystem、Secrets 或 Worker Process，不得新增 UI Framework、状态库或全局 Token。

首轮用户验收：用户可以创建多个彼此隔离的 Project；切换项目后配置、计划、任务、Assistant 上下文不串项目；可以编辑并批准/拒绝 Research Plan；可以查看任务运行状态、来源、知识节点和基础图谱；Coverage/Gap 只提供可解释结果，Gap 建议必须由用户批准；Assistant 只执行解释进度、建议下一任务、查看待审核项、显式保存决定四类动作。

必须为所有核心页面提供 Loading、Empty、Error、Keyboard、Responsive 状态。使用 Fixture/Mock Service，不能为了演示写死一套与 Schema 不一致的 JSON。
```

## 工作组 C：Rust 本地核心组

```text
目标：建立 Tauri Rust Core，使前端通过类型化 IPC 使用本地数据库、文件、Keychain、配置和 Worker 生命周期。完成后应用可以在本机安全保存 Runtime/Index/State，并管理 Worker，不暴露 Secrets。

负责任务：RUST-01 至 RUST-05、RUST-02/03/04 的 Migration/Repository/Keychain 实现，以及 RES-07 的 Vault Writer 基础。Worker Protocol 使用 A 组冻结的契约；在契约冻结前只能使用明确标注的草案和 Fake Worker。

允许修改：apps/desktop/src-tauri、SQLite migrations、Repository/Service、IPC Adapter、Vault Writer、Fake Keychain/Fake Worker 测试。不得实现 Python 研究逻辑、前端业务组件、真实 Provider 或在 SQLite 中保存原始 API Key。

首轮验收：空数据库可迁移、升级、回滚失败安全；Project/Config/Plan/Task/Source/Knowledge 等 Runtime/Index 状态可通过 Repository 事务持久化；Keychain 只保存 Secret Reference；Worker 可启动、健康检查、重启、取消、关闭和崩溃恢复；Vault 使用原子写入、稳定 Node ID，并检测用户修改后提出合并而不是覆盖。

所有 Command 返回统一 Error Model，事件只通过协议转发。完成前运行 Rust Format/Check/Test、Migration Test、IPC Test、Fake Worker Test 和公共边界检查。
```

## 工作组 D：Python 研究引擎组

```text
目标：实现本地 Research Worker 的最小完整研究流水线。首轮使用 Mock Provider 或用户明确配置的单一 Provider，不能把 Provider 细节泄漏到 Domain。

负责任务：PY-01 至 PY-05、RES-01 至 RES-06、RES-03/04/05/06 的 Worker 部分。研究链路必须是 ResearchConfig → Planner → Plan Review → Task DAG → Search → Source Evaluation/Extraction → Entity/Relation Normalization → Claim/Evidence → Validation Result。

允许修改：apps/research-worker、packages/prompts、Provider/Search/Extraction/Normalization/Validation 模块、Worker Mock 和 Python 测试。不得写 Vault、直接写 SQLite、修改 UI 状态、绕过 Rust 持久化或调用真实网络测试。

首轮验收：Planner 只生成待审查 Plan；用户批准前不执行 DAG；DAG 支持并行依赖、暂停、取消、重试、Checkpoint、幂等和崩溃恢复；Source/Evidence/Claim/Knowledge/Relation 严格分层；LLM 输出经过 Parse → Validate → Normalize → Persist；冲突 Claim 共存；Cache 命中不重复消耗 Provider；Usage Record 可追踪。

使用本机模型时，抽取/分类/摘要默认走 Ollama qwen3:8b 4-bit 或 qwen2.5:7b 备用；Planner/Validation 通过 OpenAI-compatible 配置走 GLM 或其他强模型。模型不可用时必须返回明确错误并允许 Mock 离线流程继续。
```

## 工作组 E：集成质量与可测试发布组

```text
目标：让维护者在不配置真实 API Key 的情况下启动项目并验证第一轮产品是否符合 PRD。先建设测试基础，随后接入其他四组已完成的真实边界。

负责任务：TEST-01 至 TEST-04、RES-09、REL-01 至 REL-04，并负责跨组集成、examples/fixtures、离线 Demo、README/CHANGELOG/任务状态同步。不要重新实现 A-D 组的 Domain、Schema 或 UI。

允许修改：tests、tests/e2e、examples/fixtures、Playwright Harness、CI、集成适配、Demo 文档、公开状态文件和 Release Candidate 文档。不得删除失败测试、放宽安全规则或把真实 Provider 放进 CI。

首轮验收：不联网、不配置 API Key 也能完成 Create Project → Configure Research → Generate Plan → Approve Plan → Run Mock DAG → View Sources/Knowledge/Claims → Export Vault → View Graph/Timeline/Coverage/Gap → Open Assistant；失败、暂停、恢复、取消和用户修改保护可观察；三组 Golden Fixture 可离线校验；README Quick Start 与实际命令一致；所有任务状态和公开提交链接准确。

若 A-D 组接口不一致，建立最小集成修复或契约提案，不在 E 组偷偷兼容第二套协议。最终只由维护者决定是否创建 Release。
```

## 首轮结束定义

五组完成后，不能只看“代码编译成功”。必须同时满足：

1. `scripts/check-task-status.ps1` 显示所有首轮任务状态真实可追踪。
2. `scripts/check-public-boundary.ps1` 通过，`private/`、对话、密钥、数据库和缓存未进入 Git。
3. Mock/Fixture 流程可离线完成一次端到端研究。
4. 多 Project 隔离、Plan 审查、DAG 恢复、Evidence 追溯、Vault 保护和 Graph/Gap 视图均有测试或明确限制。
5. README、CHANGELOG、Roadmap、任务状态与实际能力一致。

任何一项不满足，都只能标记为 `Review` 或 `Blocked`，不能宣称首轮构建完成。
