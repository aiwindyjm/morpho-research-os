# Page Specification: 研究配置（Research Configuration）

Page: 研究配置（Research Configuration）
Purpose: 以结构化配置（docs/PRD.md §5，校验对齐 packages/schemas/research-config.v1.json）定义项目研究问题的边界。
Pattern: Form
Layout: PageShell；双列表单（<768 单列）
Navigation: 侧边栏「研究配置」
Sections: 01 研究主题（领域/主题/目的/读者）、02 研究范围（深度分段控件、时间范围、语言、地理范围）、03 研究维度（chips 多选）、04 来源偏好（来源类型卡片复选）
Components: Input, Checkbox, Card, Button, Alert, PageShell, PageStates, PurposeSelect
States: 未修改时保存按钮禁用；修改后「放弃修改」可用；校验失败显示错误 Alert 与字段错误
Interactions: 保存（Parse → Validate → Persist，服务端校验失败显示 user_message）；放弃修改回滚草稿
Empty State: 无选中项目时提示先选择/创建项目
Loading State: PageLoading
Error State: PageError + 重试；保存错误以 Alert 呈现
Responsive: md 以下单列；保存/放弃按钮固定在页头
Analytics/Events: 无

## Prototype alignment (ADR-013)

已实施（实施计划 Task 9）：单面板内 01–04 编号分区——01 研究主题（领域/主题/目的/受众）、02 研究范围（深度 1–5 分段控件 + 时间范围 + 语言复选 + 地域范围）、03 研究维度（chips 多选，`aria-pressed`；「＋ 自定义维度」V0.1 禁用，title「桌面版提供」）、04 来源偏好（卡片式复选）。字段全部映射现有 `ResearchConfig` 契约，保存走 `useUpdateConfig`，无新增字段；保存/放弃与错误 Alert 逻辑不变。
