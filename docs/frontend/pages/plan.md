# Page Specification: 研究计划（Plan Review）

Page: 研究计划（Plan Review）
Purpose: 审查 Planner 生成的计划草案；用户可编辑任务、批准、拒绝、重新生成；批准后启动运行（RES-01 前端）。
Pattern: Detail + Inspector（无侧栏时全宽）
Layout: PageShell；计划头部卡片 + ResearchPlanTree 分节列表
Navigation: 侧边栏「研究计划」
Sections: 计划标题/理由/状态徽章、分节目标与任务草案、运行状态提示
Components: ResearchPlanTree, ResearchStatusBadge, Badge, Button, Dialog, Input, Textarea, Alert, PageStates
States: draft（可编辑）/ approved（可开始运行）/ rejected（可重新生成）；运行存在时锁定编辑并提示
Interactions: 编辑任务（Dialog，仅 draft）；批准；拒绝；重新生成；开始运行（成功 Toast 引导到任务页）
Empty State: 「还没有研究计划」+ 生成按钮
Loading State: PageLoading
Error State: PageError + 重试；操作失败以 Alert 呈现（含 MorphoError user_message）
Responsive: 操作按钮在页头自动换行；树列表单列流式
Analytics/Events: 无
