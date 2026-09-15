/**
 * zh-TW plan resources (ADR-023): Traditional Chinese (Taiwan conventions)
 * translation of the plan review view. Glossary: 計畫 / 任務 / 執行（run）/
 * 審查 / 核准；Planner、Orchestrator 維持原文。
 */
const plan = {
  kicker: "研究計畫 / {{status}}",
  statusDraft: "待審查",
  fallbackTitle: "研究計畫",
  noPlanDescription: "Planner 只產出待審查的計畫草案；核准之後才會建立可執行的任務。",
  regenerate: "重新產生",
  reject: "拒絕計畫",
  approveAria: "核准計畫",
  approve: "確認並開始",
  startRun: "開始執行",
  runStartedToast: {
    title: "研究執行已開始",
    detail: "到「任務」頁檢視即時進度。",
  },
  runStartFailed: "啟動執行失敗。",
  regenerateApproved: "重新產生計畫",
  generate: "產生研究計畫",
  actionError: {
    title: "操作未完成",
    fallback: "操作失敗，請重試。",
  },
  runAlert: {
    title: "執行狀態：{{state}}",
    detail: "計畫已進入執行階段（共 {{total}} 個任務）；如需調整計畫， 請到「任務」頁暫停或等待本輪執行結束。",
  },
  empty: {
    title: "還沒有研究計畫",
    description: "先完善研究設定，然後點選「產生研究計畫」。計畫會按維度列出檢索與擷取任務，等待你的審查。",
  },
  summary: {
    tasks: "預計任務",
    sources: "來源",
    dimensions: "研究維度",
    reviews: "需要審核",
  },
  group: {
    expandAria: "展開分組",
    collapseAria: "摺疊分組",
    taskCount: "{{total}} 個任務",
  },
  task: {
    edit: "編輯任務",
  },
  locked: {
    title: "計畫已鎖定",
    detail: "本輪執行已建立，計畫內容不再修改；可以暫停任務或在執行結束後重新產生計畫。",
  },
  editDialog: {
    title: "編輯計畫任務",
    description: "只修改標題與描述；任務類型與執行順序由 Orchestrator 決定。",
    titleLabel: "任務標題",
    descriptionLabel: "任務描述",
    cancel: "取消",
    save: "儲存修改",
    saveFailed: "儲存修改失敗。",
  },
};

export default plan;
