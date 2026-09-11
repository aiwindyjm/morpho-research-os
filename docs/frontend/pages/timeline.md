# Page Specification: 时间线（Timeline）

Page: 时间线（Timeline）
Purpose: 按时间倒序展示运行、来源、论断与知识事件（RES-10）。
Pattern: List（时间轴）
Layout: PageShell；垂直时间轴
Navigation: 侧边栏「时间线」
Sections: 时间轴条目（类型徽章、UTC 时间、标题、详情）；上限 100 条
Components: Card, Badge, PageStates
States: 事件随运行揭示逐步出现
Interactions: 无（只读投影）
Empty State: 「时间线还没有事件」
Loading State: PageLoading
Error State: PageError + 重试
Responsive: 单列流式
Analytics/Events: 无
