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
