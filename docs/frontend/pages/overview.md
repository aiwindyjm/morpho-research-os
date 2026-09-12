# Page Specification: 概览（Overview）

Page: 概览（Overview）
Purpose: 项目研究仪表盘：集中展示覆盖度/来源/知识/待审核四项指标、研究路径、研究活动、维度覆盖与下一步建议；吸收原时间线（Timeline）与覆盖与缺口（Coverage & Gaps）两个视图的内容（ADR-013），数据全部复用现有 queries，不发新请求类型。
Pattern: Dashboard（指标卡 + 分区面板）
Layout: PageShell（kicker「研究项目 / {运行状态}」+ h1 项目名 + lede 描述 + 页头动作）；指标卡行（1/2/4 列）+ 纵向面板区（研究路径 / 研究活动 / 维度覆盖 / 下一步）
Navigation: 侧边栏「概览」；「编辑配置」→ 研究配置；「查看全部 →」→ 任务；「查看知识 →」→ 知识
Sections: 指标卡×4（研究覆盖度、来源、知识节点、待审核结论）、研究路径面板、研究活动面板、维度覆盖面板、下一步建议面板
Components: Card, Button, Badge, Progress, Skeleton, PageStates, PageShell（kicker）；prototype.css 效果类（metric-accent、progress-track/progress-fill、pill、timeline-connector、kicker）
States: 数据来自 useCoverage / useSources / useKnowledge / useClaims / useTimeline / useTasks / useGaps / useProjects / useRun；加载中任一核心查询（coverage 或 tasks）即整页加载态；错误透传 refetch
Interactions: 「继续研究 →」（useRunActions().start）/「查看任务 →」（run 运行中）/「创建研究任务 →」（gap approve）/「忽略」（gap dismiss）
Empty State: 无选中项目时引导先在「我的研究」选择或创建项目；无 pending gap 提案时下一步面板置灰显示「暂无缺口建议，当前覆盖良好。」
Loading State: PageStates（coverage 或 tasks 查询加载中）
Error State: PageStates + 重试
Responsive: 指标卡 1 列（<768）/ 2 列（≥768）/ 4 列（≥1280）；面板区纵向堆叠
Analytics/Events: 无

## 页头动作

- 「编辑配置」（secondary）→ `setActiveView("config")`。
- 运行按钮按 run 状态切换：
  - 无运行（计划已批准）→「继续研究 →」，接 `useRunActions().start`；
  - 计划为 draft → 按钮禁用，title 提示「先到研究计划页批准计划」；
  - run 运行中 →「查看任务 →」跳任务页（V0.1 不新增 run 级暂停）。

## 内容组与数据映射（五组）

1. **指标卡×4**（`metric-coverage` / `metric-sources` / `metric-knowledge` / `metric-reviews`）
   - 研究覆盖度：accent 卡（`metric-accent`），`Math.round(coverage.overall × 100)%` 大数字，meta「核心维度已完成 N / M」（覆盖度达标的维度数/总维度数），`progress-track`/`progress-fill` 进度条；来源 `useCoverage`。
   - 来源：来源总数，meta「高质量 N 个」（`quality && authority ≥ 0.7 && fitness ≥ 0.7`，阈值常量 `QUALITY_SOURCE_THRESHOLD`）；来源 `useSources`。
   - 知识节点：节点总数，meta「N 种类型」；来源 `useKnowledge`。
   - 待审核结论：无验证通过的证据状态计数（口径沿用原 GapsPage），meta「N 个存在冲突」（`status === "conflicting"`，warning 色）；来源 `useClaims`。
2. **研究路径 · 当前研究路径**（`overview-path`）：由 `useTasks` 推导行（`useTimeline` 补充事件）。行状态：已完成 ✓（绿）/ 当前 →（蓝，脉冲动画，附 mini 进度条）/ 等待 ○「等待前置任务」。行容器 `relative timeline-connector`（虚线连接线，最后一行不加）。面板头「查看全部 →」→ tasks。
3. **研究活动 · 刚刚发生**（`overview-activity`）：`useTimeline` 按 timestamp 倒序取前 5 条。kind → 图标/颜色映射：source 蓝 ⌕ / knowledge 紫 ◇ / claim 橙 ! / run 绿 ↗ / task 灰 ✓；面板头右侧「实时」标签（绿点）。
4. **覆盖度 · 研究维度**（`overview-dimensions`）：`useCoverage` 的 `dimensions` 逐行渲染 label + 百分比 + 细进度条（复用 `progress-track`/`progress-fill`）。每行可展开明细（details disclosure），携带该维度的分量原因（reasons）与权重分量 `COVERAGE_WEIGHTS`（task_completion 0.4 / knowledge_breadth 0.3 / evidence_density 0.2 / source_diversity 0.1，即 PRD V0.1 公式）。面板头「查看知识 →」→ knowledge。
5. **下一步 · 建议继续研究**（`overview-next`）：`useGaps` 取 `proposal_status === "pending_approval"` 的提案。有提案：`pill-warning`「低覆盖」标签 + `gap.detail` 建议文案 +「创建研究任务 →」（`useGapActions().approve`，成功后显示「已创建任务」）与「忽略」（dismiss）。无提案：整卡置灰，显示「暂无缺口建议，当前覆盖良好。」

## Testids

`overview-page`（页面根容器）、`metric-coverage`、`metric-sources`、`metric-knowledge`、`metric-reviews`（四张指标卡）、`overview-path`、`overview-activity`、`overview-dimensions`、`overview-next`（四个内容面板）。
