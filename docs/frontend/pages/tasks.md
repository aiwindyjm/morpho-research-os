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

## Prototype alignment (ADR-013)

目标设计（实施计划 Task 11，进行中，以计划与原型为准）：工具条改为计数 tab（全部 / 执行中 / 待审核 / 已完成，状态过滤）+「最后更新」时间 +「继续运行」。任务行改为：标题 + 所属维度 | 阶段标签 | 状态 pill（执行中蓝 / 待审核橙 / 已完成绿 / 其余灰）| 行操作（现有暂停/继续/重试逻辑）。`task-row` testid 与 `data-state` 属性保留；空态（draft → 引导去研究计划）沿用现状。
