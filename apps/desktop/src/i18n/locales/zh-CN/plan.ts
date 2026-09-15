/**
 * zh-CN plan resources (ADR-023): the plan review view. Values are the exact
 * strings the view rendered before i18n extraction, byte-identical
 * (including the pre-existing English fragment "tasks" and the single space
 * JSX collapsed inside the run-alert copy).
 */
const plan = {
  kicker: "研究计划 / {{status}}",
  statusDraft: "待确认",
  fallbackTitle: "研究计划",
  noPlanDescription: "Planner 只生成待审查的计划草案；批准之后才会创建可运行的任务。",
  regenerate: "重新生成",
  reject: "拒绝计划",
  approveAria: "批准计划",
  approve: "确认并开始",
  startRun: "开始运行",
  runStartedToast: {
    title: "研究运行已开始",
    detail: "到「任务」页查看实时进度。",
  },
  runStartFailed: "启动运行失败。",
  regenerateApproved: "重新生成计划",
  generate: "生成研究计划",
  actionError: {
    title: "操作未完成",
    fallback: "操作失败，请重试。",
  },
  runAlert: {
    title: "运行状态：{{state}}",
    detail: "计划已进入执行阶段（共 {{total}} 个任务）；如需调整计划， 请到「任务」页暂停或等待本轮运行结束。",
  },
  empty: {
    title: "还没有研究计划",
    description: "先完善研究配置，然后点击「生成研究计划」。计划会按维度列出检索与提取任务，等待你的审查。",
  },
  summary: {
    tasks: "预计任务",
    sources: "来源",
    dimensions: "研究维度",
    reviews: "需要审核",
  },
  group: {
    expandAria: "展开分组",
    collapseAria: "折叠分组",
    taskCount: "{{total}} tasks",
  },
  task: {
    edit: "编辑任务",
  },
  locked: {
    title: "计划已锁定",
    detail: "本轮运行已创建，计划内容不再修改；可以暂停任务或在运行结束后重新生成计划。",
  },
  editDialog: {
    title: "编辑计划任务",
    description: "只修改标题与描述；任务类型与执行顺序由 Orchestrator 决定。",
    titleLabel: "任务标题",
    descriptionLabel: "任务描述",
    cancel: "取消",
    save: "保存修改",
    saveFailed: "保存修改失败。",
  },
};

export default plan;
