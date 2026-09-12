# ADR-012 Docker Web Deployment

## Context

Morpho 的产品桌面壳是 Tauri 2，当前 React 前端通过 Mock Transport 运行，真实 Rust IPC、Python Worker 和 Web API 尚未完成。用户需要一个可重复的一键部署方式来评审原型和持续集成。

## Decision

第一阶段提供 Docker Web Preview：使用 Node/pnpm 多阶段构建 React/Vite 静态产物，由 Nginx 在端口 1420 提供 SPA 和 `/healthz`。Compose 预留 data、vault、cache 卷，但当前版本不宣称或实现持久化研究能力。

完整容器模式必须新增 Web Host/API Adapter，复用现有类型化契约，并保持 Rust Core 对数据库、文件、密钥和 Worker 的所有权。浏览器不得直接连接 SQLite、文件系统或 Python Worker。

## Alternatives

- 将 Tauri GUI 放进 Docker：Tauri 桌面窗口依赖宿主图形环境，不适合作为通用服务器部署。
- 现在直接实现完整微服务：会在 Web API 和 Worker 契约尚未冻结时引入不可逆复杂度。
- 仅提供本地开发命令：无法满足一键评审和 CI 部署需求。

## Consequences

Docker Preview 可在没有 Rust、Python 或 API Key 的环境运行，镜像小且可健康检查；它只能展示当前 Mock 前端。未来 Web Host 建成后可以保留 Compose 入口和卷命名，但需要新增服务、迁移和安全文档。
