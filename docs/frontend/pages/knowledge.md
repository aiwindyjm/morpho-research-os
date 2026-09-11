# Page Specification: 知识库（Knowledge）

Page: 知识库（Knowledge）
Purpose: 查看知识节点与论断；论断与证据分层，冲突论断共存并可展开证据定位。
Pattern: Split View（Tabs）
Layout: PageShell；Tabs「知识节点 / 论断与证据」
Navigation: 侧边栏「知识库」
Sections: 搜索与类型过滤、KnowledgeCard 网格、ClaimCard + EvidenceList
Components: Tabs, Input, Select, KnowledgeCard, ClaimCard, EvidenceList, Card, Badge, PageStates
States: 节点/论断都为空时整页空状态；证据按需加载（展开时查询）；冲突论断有警示条
Interactions: 搜索（标题/摘要/别名）、类型过滤、展开/收起证据
Empty State: 「知识库还是空的」
Loading State: PageLoading（两个查询合并）
Error State: PageError + 重试
Responsive: 卡片 1 列（<1024）/ 2 列（≥1024）
Analytics/Events: 无
