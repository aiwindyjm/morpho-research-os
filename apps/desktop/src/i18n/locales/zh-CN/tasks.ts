/**
 * zh-CN tasks resources (ADR-023): the tasks view. Values are the exact
 * strings the view rendered before i18n extraction, byte-identical. The tab
 * and pill labels ("执行中"/"待审核"/"已完成") intentionally differ from the
 * canonical vocab.taskState labels ("运行中"/"需要审核") — they are the
 * prototype's tab/pill copy and are kept verbatim.
 */
const tasks = {
  kicker: "研究任务",
  title: "执行中的工作",
  description: "每个任务都可以暂停、重试，并回到具体来源和结果。",
  continueRun: "继续运行",
  runStartedToast: {
    title: "研究运行已开始",
    detail: "任务将按依赖顺序执行。",
  },
  runBadge: "运行状态：{{state}}",
  runDeliveryPending: "执行完成，结果交付中",
  runDeliveryFailed: "执行完成，结果未交付",
  empty: {
    title: "还没有任务",
    approved: "计划已批准，点击右上角「继续运行」创建任务。",
    draft: "先到「研究计划」页审查并批准计划，批准后会创建任务。",
    generic: "先在「研究计划」页生成并批准一份计划。",
  },
  filterAria: "任务状态筛选",
  tabs: {
    all: "全部",
    active: "执行中",
    review: "待审核",
    done: "已完成",
  },
  lastUpdated: "最后更新 {{date}}",
  col: {
    task: "任务",
    stage: "阶段",
    status: "状态",
  },
  pill: {
    running: "执行中",
    needsReview: "待审核",
    completed: "已完成",
  },
  action: {
    menuAria: "任务操作",
    pause: "暂停",
    resume: "恢复",
    retry: "重试",
    confirmContinue: "确认并继续",
    cancel: "取消",
    unsupportedTitle: "V0.1 暂不支持",
    unsupportedHint: "单任务控制（暂停/恢复/重试/取消）需要按任务派发，将在后续版本提供；目前可以通过「取消运行」停止整个运行。",
  },
  runStartFailedToast: {
    title: "研究运行未能启动",
  },
};

export default tasks;
