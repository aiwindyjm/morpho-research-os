# Page Specification: 研究配置（Research Configuration）

Page: 研究配置（Research Configuration）
Purpose: 以结构化配置（docs/PRD.md §5，校验对齐 packages/schemas/research-config.v1.json）定义项目研究问题的边界。
Pattern: Form
Layout: PageShell；双列表单（<768 单列）
Navigation: 侧边栏「研究配置」
Sections: 领域/主题、目的、读者、深度（ResearchDepthSelector）、地理范围、维度（ResearchDimensionPicker）、语言、来源类型、更新频率说明
Components: Input, Select, Field, ResearchDepthSelector, ResearchDimensionPicker, Button, Alert, PageStates
States: 未修改时保存按钮禁用；修改后「放弃修改」可用；校验失败显示错误 Alert 与字段错误
Interactions: 保存（Parse → Validate → Persist，服务端校验失败显示 user_message）；放弃修改回滚草稿
Empty State: 无选中项目时提示先选择/创建项目
Loading State: PageLoading
Error State: PageError + 重试；保存错误以 Alert 呈现
Responsive: md 以下单列；保存/放弃按钮固定在页头
Analytics/Events: 无
