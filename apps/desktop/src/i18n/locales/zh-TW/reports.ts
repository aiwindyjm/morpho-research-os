/**
 * zh-TW reports resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the read-only project briefing view.
 * Glossary: 來源 / 知識節點 / 論斷 / 覆蓋度 / 執行（run）。
 */
const reports = {
  kicker: "研究報告",
  title: "專案研究簡報",
  description: "從目前專案的來源、知識與覆蓋度產生一頁彙總；正式簡報匯出即將提供。",
  empty: {
    title: "報告還沒有內容",
    description: "研究執行產出來源、知識節點與論斷後，這裡會彙總成專案簡報。",
  },
  metrics: {
    sources: "來源",
    knowledge: "知識節點",
    claims: "論斷",
    coverage: "研究覆蓋度",
  },
  dimensions: {
    kicker: "覆蓋度",
    title: "維度覆蓋表",
    caption: "各研究維度的覆蓋率與關鍵輸入",
    colDimension: "維度",
    colCoverage: "覆蓋率",
    colTasks: "任務完成",
    colNodes: "知識節點",
    colQualitySources: "高品質來源",
  },
  runs: {
    kicker: "執行紀錄",
    title: "最近研究執行",
    empty: "還沒有研究執行紀錄；開始執行後事件會出現在這裡。",
  },
  export: {
    kicker: "匯出",
    soon: "即將提供",
    title: "匯出報告",
    description: "研究綜合簡報與 Vault 匯出會在研究流程整合後提供；目前版本先在此彙總資料。",
  },
};

export default reports;
