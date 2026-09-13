# Page Specification: 研究计划（Plan Review）

Page: 研究计划（Plan Review）
Purpose: 审查 Planner 生成的计划草案；用户可编辑任务、批准、拒绝、重新生成；批准后启动运行（RES-01 前端）。
Pattern: Detail + Inspector（无侧栏时全宽）
Layout: PageShell；计划汇总条（`plan-summary` 四格）+ 分组计划树
Navigation: 侧边栏「研究计划」
Sections: 计划标题/理由/状态徽章、汇总条（预计任务/来源/研究维度/需要审核）、分组计划树（编号分组头 + 任务行 + 折叠）、运行状态提示
Components: ResearchStatusBadge, Card, Button, Dialog, Input, Textarea, Alert, PageShell, PageStates
States: draft（可编辑）/ approved（可开始运行）/ rejected（可重新生成）；运行存在时锁定编辑并提示
Interactions: 编辑任务（Dialog，仅 draft）；批准；拒绝；重新生成；开始运行（成功 Toast 引导到任务页）
Empty State: 「还没有研究计划」+ 生成按钮
Loading State: PageLoading
Error State: PageError + 重试；操作失败以 Alert 呈现（含 MorphoError user_message）
Responsive: 操作按钮在页头自动换行；树列表单列流式；汇总条 <md 为 2×2，任务行的类型标签 <md 折行到标题下方
Analytics/Events: 无

## Prototype alignment (ADR-013)

已实施（实施计划 Task 10）：页头 kicker「研究计划 / 待确认|已批准」+「重新生成」与「确认并开始」（后者 aria-label 保留「批准计划」，App.test 依赖）。新增汇总条（`plan-summary`）四格：预计任务（plan 任务数）/ 来源（当前来源数）/ 研究维度（config 维度数）/ 需要审核（待审核 claims 数），全部真实数据。计划树改为分组头（编号 + 标题 + 描述 + 任务数 + 折叠按钮）→ 任务行（序号 + 标题 + 类型标签）；现有编辑/批准/拒绝/重新生成交互全部保留。
