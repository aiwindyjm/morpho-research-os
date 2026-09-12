# Page Specification: 来源（Sources）

Page: 来源（Sources）
Purpose: 查看检索与评估过的独立来源及其质量元数据；来源质量描述权威性与适配度，不代表真伪。
Pattern: List（卡片网格）
Layout: PageShell；1/2 列卡片
Navigation: 侧边栏「来源」
Sections: SourceCard（标题、URL、类型、状态、维度、质量评分与理由）
Components: SourceCard, Card, Badge, PageStates
States: reveal 门控——运行产生来源前为空状态
Interactions: URL 新窗口打开（rel=noreferrer）
Empty State: 「还没有来源」+ 引导
Loading State: PageLoading
Error State: PageError + 重试
Responsive: 1 列（<1024）/ 2 列（≥1024）
Analytics/Events: 无

## Prototype alignment (ADR-013)

已实施（实施计划 Task 12）：顶部 4 块质量汇总（`source-summary`：全部 / 高质量 / 中等 / 待审核，按 quality 字段计数着色）；工具条为搜索框（aria-label「搜索来源或关键词」）+ 类型筛选 chips。来源由卡片改为行式列表：`badge-mono` 类型徽章（PAPER 紫 / OFFICIAL 蓝 / 其它灰）+ 标题 + 域名/状态元信息 + 质量标签 + 分数（mono）+ 外链 ↗（`rel="noreferrer"` 保留）。

有意简化（V0.1）：时间筛选 chips 有意省略，仅保留类型筛选 chips。
