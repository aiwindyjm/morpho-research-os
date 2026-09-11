# Page Specification: 任务（Tasks）

Page: 任务（Tasks）
Purpose: 展示可恢复任务 DAG 的实时状态与进度，提供用户控制（暂停/恢复/重试/取消）（RES-02 前端）。
Pattern: List + Toolbar
Layout: PageShell；进度卡（TaskProgress）+ 任务行列表
Navigation: 侧边栏「任务」
Sections: 运行状态徽章、完成度进度、任务行（状态、类型、尝试次数、依赖数、检查点、错误码、幂等键）
Components: TaskRow, ResearchStatusBadge, TaskProgress, Badge, Button, Card, PageStates
States: 运行活动期间每 900ms 轮询刷新；状态驱动操作按钮（RUNNING→暂停；PAUSED→恢复；FAILED→重试；NEEDS_REVIEW→确认并继续）
Interactions: 开始运行（计划已批准且无运行时）；行内任务操作；错误操作静默降级（错误由状态页与助手呈现）
Empty State: 按计划状态给出下一步引导（draft → 去审查计划；approved → 开始运行）
Loading State: PageLoading
Error State: PageError + 重试
Responsive: 任务行纵向堆叠；操作按钮换行
Analytics/Events: 无
