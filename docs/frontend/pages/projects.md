# Page Specification: 项目（Projects）

Page: 项目（Projects）
Purpose: 列出、创建、切换研究项目；展示每个项目的计划状态与任务进度概览。项目是隔离边界。
Pattern: Dashboard（卡片网格）
Layout: PageShell；卡片网格 1/2/3 列响应式
Navigation: 侧边栏「项目」；卡片「进入工作台」切换项目，「研究配置」跳转配置视图
Sections: 项目卡片（名称、描述、计划状态、待审核数、任务进度、更新时间）
Components: Card, Button, Dialog, Input, Textarea, PageShell, PageStates；prototype.css pill / progress-track 类
States: 默认/当前项目高亮；按钮 hover 与 focus-visible
Interactions: 新建项目（ProjectsPage 顶部按钮，成功后自动选中并进入配置视图）；切换项目（替换全部查询键与助手上下文）
Empty State: 「还没有研究项目」+ 创建引导
Loading State: PageLoading（骨架）
Error State: PageError + 重试
Responsive: 1 列（<768）/ 2 列（≥768）/ 3 列（≥1280）；侧边栏 <768 收纳为抽屉
Analytics/Events: 无（V0.1 不引入遥测）

## Prototype alignment (ADR-013)

已实施（实施计划 Task 8）：页头 kicker「我的研究」+「＋ 新建研究」；工具条为客户端搜索框（按名称/描述过滤，aria-label「搜索我的研究」）+「N 个项目」计数。项目改为卡片网格（md 2 列 / xl 3 列）：状态 pill（进行中绿 / 已暂停橙 / 草稿灰，由项目聚合推导）、名称、描述、meta 行（覆盖率 / 来源数 / 更新时间）、卡底 3px 进度条；当前项目卡渐变高亮。末尾虚线「新建一个研究」卡打开现有创建 Dialog；现有「进入工作台 / 研究配置」按钮交互保留。
