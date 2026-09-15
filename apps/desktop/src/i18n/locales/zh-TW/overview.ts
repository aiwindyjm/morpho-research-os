/**
 * zh-TW overview resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the overview dashboard.
 * Glossary: 覆蓋度 / 維度 / 論斷 / 證據 / 執行（run）/ 缺口。
 */
const overview = {
  kicker: "研究專案 / {{status}}",
  notStarted: "未開始",
  fallbackTitle: "總覽",
  editConfig: "編輯設定",
  viewTasks: "檢視任務 →",
  planDraftTitle: "先到研究計畫頁核准計畫",
  continueResearch: "繼續研究 →",
  empty: {
    title: "還沒有選擇專案",
    description: "先在「我的研究」頁選擇或建立一個研究專案，這裡會展示它的研究總覽。",
    action: "前往我的研究",
  },
  metrics: {
    coverage: "研究覆蓋度",
    coverageMeta: "核心維度已完成 {{done}} / {{total}}",
    sources: "來源",
    sourcesMeta: "高品質 {{total}} 個",
    knowledge: "知識節點",
    knowledgeMeta: "{{total}} 種類型",
    reviews: "待審核論斷",
    reviewsMeta: "{{total}} 個存在衝突",
    coverageProgressAria: "覆蓋度進度",
  },
  path: {
    kicker: "研究進度",
    title: "目前研究路徑",
    viewAll: "檢視全部 →",
    empty: "還沒有可執行任務；核准計畫並開始執行後，任務會按依賴順序出現在這裡。",
    executing: "正在執行",
    waitingPredecessor: "等待前置任務",
    progressAria: "任務完成進度",
    stateDone: "完成",
    stateReview: "待審核",
    stateWaiting: "等待",
  },
  activity: {
    kicker: "研究活動",
    title: "剛剛發生",
    live: "即時",
    empty: "還沒有活動事件；開始研究執行後，來源、論斷與知識節點會按時間出現在這裡。",
  },
  dimensions: {
    kicker: "覆蓋度",
    title: "研究維度",
    viewKnowledge: "檢視知識 →",
    progressAria: "{{dimension}}覆蓋度進度",
  },
  coverage: {
    why: "為什麼是這個分數？",
    taskCompletion: "任務完成度 {{score}}（權重 {{weight}}）：{{done}}/{{total}} 個任務完成",
    knowledgeBreadth: "知識廣度 {{score}}（權重 {{weight}}）：{{total}} 個節點",
    evidenceDensity: "證據密度 {{score}}（權重 {{weight}}）：{{total}} 條證據",
    sourceDiversity: "來源多樣性 {{score}}（權重 {{weight}}）：{{total}} 個獨立高品質來源",
  },
  next: {
    kicker: "下一步",
    title: "建議繼續研究",
    triggerCoverage: "低覆蓋",
    triggerSources: "來源不足",
    createdTask: "已建立任務「{{title}}」。",
    createdTaskHint: "新任務出現在「任務」頁，可隨時暫停或重試。",
    createTask: "建立研究任務 →",
    dismissAria: "忽略該建議",
    dismiss: "忽略",
    empty: "暫無缺口建議，目前覆蓋良好。",
  },
};

export default overview;
