# Page Specification: 图谱（Graph）

Page: 图谱（Graph）
Purpose: 将知识节点与关系投影为 2D 力导向图谱，支持搜索、过滤、选择与详情（RES-08）。
Pattern: Workspace（画布 + Inspector）
Layout: PageShell；工具栏（搜索/类型/维度过滤/计数）+ 画布卡片 + GraphNodeInspector
Navigation: 侧边栏「图谱」；页头按钮切换图形/列表视图
Sections: SVG 画布（节点按置信状态着色、半径随来源数、关系高亮选中邻边）、Inspector（类型/维度/置信、来源与论断计数、关系列表）
Components: GraphCanvas（SVG）, GraphNodeInspector, Input, Select, Button, Card, Badge, PageStates
States: 空（未揭示）/ 加载 / 错误；列表视图为无障碍表格替代（键盘 Enter 选择）
Interactions: 节点点击/键盘选择 → Inspector；搜索与过滤实时收窄并更新计数
Empty State: 「图谱还没有内容」
Loading State: PageLoading
Error State: PageError + 重试
Responsive: Inspector 换行到画布下方（<1280）；画布 SVG 等比缩放
Accessibility: SVG 节点为 role=button + aria-label；列表视图提供语义表格；布局为同步力导向计算（确定性、无动画帧依赖）
Analytics/Events: 无
