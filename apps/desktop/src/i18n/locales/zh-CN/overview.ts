/**
 * zh-CN overview resources (ADR-023): the overview dashboard. Values are the
 * exact strings the view rendered before i18n extraction, byte-identical
 * (including the single spaces JSX collapsed out of multi-line text).
 */
const overview = {
  kicker: "研究项目 / {{status}}",
  notStarted: "未开始",
  fallbackTitle: "概览",
  editConfig: "编辑配置",
  viewTasks: "查看任务 →",
  planDraftTitle: "先到研究计划页批准计划",
  continueResearch: "继续研究 →",
  empty: {
    title: "还没有选择项目",
    description: "先在「我的研究」页选择或创建一个研究项目，这里会展示它的研究概览。",
    action: "去我的研究",
  },
  metrics: {
    coverage: "研究覆盖度",
    coverageMeta: "核心维度已完成 {{done}} / {{total}}",
    sources: "来源",
    sourcesMeta: "高质量 {{total}} 个",
    knowledge: "知识节点",
    knowledgeMeta: "{{total}} 种类型",
    reviews: "待审核结论",
    reviewsMeta: "{{total}} 个存在冲突",
    coverageProgressAria: "覆盖度进度",
  },
  path: {
    kicker: "研究进度",
    title: "当前研究路径",
    viewAll: "查看全部 →",
    empty: "还没有可执行任务；批准计划并开始运行后，任务会按依赖顺序出现在这里。",
    executing: "正在执行",
    waitingPredecessor: "等待前置任务",
    progressAria: "任务完成进度",
    stateDone: "完成",
    stateReview: "待审核",
    stateWaiting: "等待",
  },
  activity: {
    kicker: "研究活动",
    title: "刚刚发生",
    live: "实时",
    empty: "还没有活动事件；开始研究运行后，来源、论断与知识节点会按时间出现在这里。",
  },
  dimensions: {
    kicker: "覆盖度",
    title: "研究维度",
    viewKnowledge: "查看知识 →",
    progressAria: "{{dimension}}覆盖度进度",
  },
  coverage: {
    why: "为什么是这个分数？",
    taskCompletion: "任务完成度 {{score}}（权重 {{weight}}）：{{done}}/{{total}} 个任务完成",
    knowledgeBreadth: "知识广度 {{score}}（权重 {{weight}}）：{{total}} 个节点",
    evidenceDensity: "证据密度 {{score}}（权重 {{weight}}）：{{total}} 条证据",
    sourceDiversity: "来源多样性 {{score}}（权重 {{weight}}）：{{total}} 个独立高质量来源",
  },
  next: {
    kicker: "下一步",
    title: "建议继续研究",
    triggerCoverage: "低覆盖",
    triggerSources: "来源不足",
    createdTask: "已创建任务「{{title}}」。",
    createdTaskHint: "新任务出现在「任务」页，可随时暂停或重试。",
    createTask: "创建研究任务 →",
    dismissAria: "忽略该建议",
    dismiss: "忽略",
    empty: "暂无缺口建议，当前覆盖良好。",
  },
};

export default overview;
