# Morpho Research OS

> 将一个研究问题转化为可持续演进的知识库。

[English](README.md) | [简体中文](README.zh-CN.md)

Morpho 是一个 Local-first、AI 驱动、兼容 Obsidian 的研究工作台。它把研究问题转化为有来源、可关联、可持续更新的个人知识库。

**为什么是 Morpho？** 普通聊天工具主要给出一次性答案；Morpho 保存完整研究过程：计划 → 任务 → 来源 → 证据 → Claims → 关系 → Markdown 资产。

## 当前状态

🚧 早期开发中 — 当前处于 Architecture Phase。正在公开建设协议、架构与治理体系，下一步是仓库基础和 Research Planner。

## 核心能力

- 本地优先的 Tauri 桌面应用
- 可暂停、恢复的 DAG 研究任务
- OpenAI-compatible Provider 架构
- 带来源追溯的 Claim 与 Evidence
- Markdown 与 Obsidian 导出
- D3 2D 知识图谱

## 快速开始

当前先提供统一的产品与技术规格，运行时尚未发布。请阅读 [产品与技术总纲](docs/PRD.md) 和 [公开开发计划](docs/development/OPEN_DEVELOPMENT.md)。基础设施完成后：

```bash
pnpm install
pnpm test
pnpm tauri dev
```

## 架构

React/Vite → Tauri IPC → Rust Core → Python Research Worker → SQLite 索引 + Markdown Vault。详见 [架构说明](docs/ARCHITECTURE.md) 和 [产品与技术总纲](docs/PRD.md)。

## 示例

首个可复现 Fixture 计划放在 `examples/fixtures/brain-computer-interface/`，会从研究配置逐步扩展到计划、来源、知识和图谱快照。

## 路线图

架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，路线图见 [ROADMAP.md](ROADMAP.md)。每次发布都对应真实成果，不人为制造活跃度。

开发任务拆分、并行泳道、依赖关系和 AI 交接格式见 [AI 并行开发计划](docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md)。

## 参与贡献与社区

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，然后通过 Issue 或 Discussion 参与。

## 许可证

Apache-2.0，详见 [LICENSE](LICENSE)。
