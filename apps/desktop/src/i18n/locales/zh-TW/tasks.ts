/**
 * zh-TW tasks resources (ADR-023): Traditional Chinese (Taiwan conventions)
 * translation of the tasks view. Glossary: 任務 / 執行（run）/ 待審核
 * （to review）。
 */
const tasks = {
  kicker: "研究任務",
  title: "執行中的工作",
  description: "每個任務都可以暫停、重試，並回到具體來源和結果。",
  continueRun: "繼續執行",
  runStartedToast: {
    title: "研究執行已開始",
    detail: "任務將按依賴順序執行。",
  },
  runBadge: "執行狀態：{{state}}",
  empty: {
    title: "還沒有任務",
    approved: "計畫已核准，點選右上角「繼續執行」建立任務。",
    draft: "先到「研究計畫」頁審查並核准計畫，核准後會建立任務。",
    generic: "先在「研究計畫」頁產生並核准一份計畫。",
  },
  filterAria: "任務狀態篩選",
  tabs: {
    all: "全部",
    active: "執行中",
    review: "待審核",
    done: "已完成",
  },
  lastUpdated: "最後更新 {{date}}",
  col: {
    task: "任務",
    stage: "階段",
    status: "狀態",
  },
  pill: {
    running: "執行中",
    needsReview: "待審核",
    completed: "已完成",
  },
  action: {
    menuAria: "任務操作",
    pause: "暫停",
    resume: "恢復",
    retry: "重試",
    confirmContinue: "確認並繼續",
    cancel: "取消",
    unsupportedTitle: "V0.1 尚不支援",
    unsupportedHint: "單任務控制（暫停/恢復/重試/取消）需要按任務派發，將在後續版本提供；目前可透過「取消執行」停止整個執行。",
  },
  runStartFailedToast: {
    title: "研究執行未能啟動",
  },
};

export default tasks;
