# Docker 部署

## 当前支持范围

Docker 当前提供 **Web Preview（Mock 前端预览）**。它构建 `apps/desktop` 的 React/Vite 产物并由 Nginx 提供服务，适合评审页面、演示交互和 CI 冒烟检查。当前前端仍使用 Mock Transport，因此容器不会执行真实研究、访问 SQLite、启动 Python Worker 或写入 Obsidian Vault。

```text
Browser → Nginx → React/Vite preview → Mock Transport
```

这不是 Tauri 桌面应用的替代品。桌面版仍通过 Tauri IPC 使用 Rust Core；Docker 完整模式将在 Web Host/API Adapter 建成后另行交付。

## 一键启动

需要 Docker Engine 24+ 与 Compose v2：

```bash
docker compose up --build -d
```

打开 `http://localhost:1420`。端口可通过未提交的 `.env` 覆盖：

```dotenv
MORPHO_PORT=1420
```

如果所在网络无法访问 Docker Hub，可临时指定兼容的镜像代理（前缀必须以 `/` 结尾）：

```dotenv
MORPHO_DOCKER_REGISTRY=docker.m.daocloud.io/library/
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f web
```

停止并删除容器：

```bash
docker compose down
```

需要同时删除预留卷时使用 `docker compose down -v`，这会删除容器卷中的数据。

## 安全边界

- 不要把 API Key 写入 `Dockerfile`、Compose 文件、镜像层或日志。
- `.env` 已被 Git 忽略；提交前运行 `scripts/check-public-boundary.ps1`。
- 当前预览不读取任何密钥。完整 Web Host 交付时，密钥将通过 Docker secrets 或运行时环境注入，并由服务端转发给 Provider。
- `morpho-data`、`morpho-vault`、`morpho-cache` 是完整容器模式预留卷，当前预览不会写入它们。

## 完整容器模式的边界

完整部署需要增加 Web Host，将浏览器请求映射到已有类型化契约：

```text
Browser → typed HTTP/SSE → Rust Core service host → Python Worker
                                      ├→ SQLite (data volume)
                                      ├→ Markdown Vault (vault volume)
                                      └→ cache (cache volume)
```

这项工作必须先完成对应 API 契约、Worker 生命周期和认证/密钥设计，再替换本文件中的 `preview` 服务；不得让浏览器直接访问 SQLite 或 Worker。
