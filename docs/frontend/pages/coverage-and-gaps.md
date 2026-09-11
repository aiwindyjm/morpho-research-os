# Page Specification: 覆盖与缺口（Coverage & Gaps）

Page: 覆盖与缺口（Coverage & Gaps）
Purpose: 按维度展示可解释覆盖度（PRD V0.1 公式：0.4 任务完成度 + 0.3 知识广度 + 0.2 证据密度 + 0.1 来源多样性）与缺口建议；建议批准前只读（RES-10）。
Pattern: Dashboard（分区区块）
Layout: PageShell；总体覆盖卡 + CoveragePanel 网格 + GapCard 网格
Navigation: 侧边栏「覆盖与缺口」
Sections: 总体覆盖度（含公式说明与计算时间）、维度面板（四项分量、权重、原始输入、原因明细）、缺口卡（触发规则、详情、建议任务、批准/忽略）
Components: CoveragePanel, GapCard, Progress, Badge, Button, Card, Alert, PageStates
States: 建议三态（pending_approval 只读 / approved 已创建任务 / dismissed 隐藏）；无运行时整体空状态
Interactions: 批准并创建任务（显式用户动作，成功 Toast）；忽略建议
Empty State: 「还没有覆盖度数据」
Loading State: PageLoading（两个查询合并）
Error State: PageError + 重试
Responsive: 面板 1 列（<1024）/ 2 列（≥1024）
Analytics/Events: 无
