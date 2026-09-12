# Page Specification: 对话日志（Journal）

Page: 对话日志（Journal）
Purpose: 只属于用户的本机私有工作日志：按本地日期记录产品/架构讨论与决定，需要时显式下载导出。日志仅存浏览器 localStorage，不进入研究 Vault、不上传（DO_NOT_BREAK #11/#12）。
Pattern: Split View（日志面板 + 保存规则侧卡）
Layout: PageShell（kicker「私有工作日志」+ 页头动作「下载 JSON」「下载今日 Markdown」）；左面板日志卡 + 右侧「保存规则」卡（≥1024 双列，<1024 堆叠）
Navigation: 侧边栏「对话日志」；设置页「打开日志 →」与助手页脚「记录对话」跳入本页
Sections: meta 条（日期 pill +「N 条记录」+「仅本机」绿标）、条目列表（时间 mono + 作者着色：用户蓝 / Morpho 紫）、录入表单（Textarea +「保存记录」+「保存到浏览器本地存储」说明）、保存规则卡（✓ 规则列表 + 当前版本限制说明）
Components: Card, Button, Textarea, PageShell（kicker）；服务层 `services/journal.ts` + `types/journal.ts`
States: 条目以 localStorage 为准（提交前重读存储，防止并发丢失）；空内容提交显示行内错误（role=alert）
Interactions: 添加条目；下载 Markdown；下载 JSON（均为显式 Blob 下载，无自动上传）
Empty State: 「还没有记录。写下今天的产品决定、问题或下一步。」
Loading State: 不适用（同步读取 localStorage）
Error State: 不适用（存储读取失败按空列表处理；提交校验错误行内展示）
Responsive: 双列（≥1024）/ 单列堆叠（<1024）
Analytics/Events: 无（不发任何网络请求）

## 存储

- localStorage key：`morpho.journal.<YYYY-MM-DD>`（本地时区日期，`todayIso()` 生成；按日隔离）。
- 条目结构：`{ id, time: "HH:mm", author: "user" | "morpho", content }`。

## 服务接口（`services/journal.ts`）

- `todayIso()`：本地 `YYYY-MM-DD` 日期。
- `listEntries(date)`：按日期读取条目（解析失败返回空列表）。
- `addEntry(date, author, content)`：追加条目（trim 后空内容抛错；`time` 取本地 HH:mm，`id` 用 `crypto.randomUUID()`）。
- `buildMarkdown(date, entries)` / `buildJson(date, entries)`：构造导出内容（Markdown 含日期头、每条「HH:mm · 用户/Morpho」行，尾部提示可放入 `private/conversations/`；JSON 为 `{ date, entries }`）。
- `downloadMarkdown(date)` / `downloadJson(date)`：Blob 显式下载，文件名 `morpho-journal-<date>.md` / `morpho-journal-<date>.json`。

## 隐私不变量

- 仅本机：只写浏览器 localStorage；不进入研究 Vault；不上传、不发任何网络请求。
- DO_NOT_BREAK #11：对话日志是本地私有数据，绝不进入 Git（导出文件仅供用户手动放入已被 Git 忽略的 `private/conversations/`）。
- DO_NOT_BREAK #12：对话捕获必须显式——只有用户点「保存记录」才写入；导出只在用户点下载按钮时发生。

## 保存规则 aside

右侧「保存规则」卡：✓ 列表（按本地日期分组 / 不上传、不进入 Git / 需要时显式下载 Markdown / 可以手动放入 private/conversations/）+「当前版本限制」说明：Web 预览无法直接写入工作区。

## 生产形态

正式 Tauri 桌面版将由 Rust Core 按日追加本地对话文件，替代浏览器 localStorage；当前 localStorage + 显式导出属原型阶段的许可实现（AGENTS.md 原型许可，ADR-013）。

## Testids

`journal-panel`（日志卡）、`journal-count`（「N 条记录」）、`journal-list`（条目列表）。
