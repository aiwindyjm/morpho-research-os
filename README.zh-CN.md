<div align="center">
  <img src="docs/assets/brand/morpho-icon.png" width="128" alt="Morpho Research OS 标志" />
</div>

# Morpho Research OS

> 将一个研究问题转化为可持续演进的知识库。

[English](README.md) | [简体中文](README.zh-CN.md)

Morpho 是一个 Local-first、AI 驱动、兼容 Obsidian 的研究工作台。它把研究问题转化为有来源、可关联、可持续更新的个人知识库。

**为什么是 Morpho？** 普通聊天工具主要给出一次性答案；Morpho 保存完整研究过程：计划 → 任务 → 来源 → 证据 → Claims → 关系 → Markdown 资产。

## 当前状态

🚧 早期开发中 — 工程内测（engineering alpha）。离线 V0.1 研究闭环已端到端打通（计划批准 → 执行 → 知识持久化 → Vault 导出 → 重启读回，由离线真实进程 smoke 验证）；真实 Provider、按任务派发与安装包仍在推进 — 见 CHANGELOG 与 docs/testing/REAL_WORKER_SMOKE.md。

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

### Docker 预览

无需安装 Node 或 Rust，即可启动当前基于 Mock 的 Web 工作台：

```bash
docker compose up --build -d
```

打开 `http://localhost:1420`。当前是静态 Web 预览，Docker 尚未接入完整 Rust Core 和 Python Research Worker。详见 [Docker 部署](docs/deployment/DOCKER.md)。

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

代码与文档以 **Apache-2.0** 授权（见 [LICENSE](LICENSE)）。

**Morpho 名称、Logo 与图标集**是本项目的视觉品牌，**不在 Apache-2.0 授权范围内**，
由维护者保留权利。Fork 或再分发版本必须使用自己的名称与图标。允许的用法
（文章、评测、未修改截图等对本项目的指称性使用）见
[TRADEMARKS.md](TRADEMARKS.md)。
