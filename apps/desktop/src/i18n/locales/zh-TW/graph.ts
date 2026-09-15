/**
 * zh-TW graph resources (ADR-023): Traditional Chinese (Taiwan conventions)
 * translation of the knowledge graph view. Glossary: 知識圖譜 / 節點 /
 * 關係 / 維度 / 置信 / 證據 / 論斷。
 */
const graph = {
  kicker: "知識圖譜",
  title: "研究關係地圖",
  description: "從節點關係回到來源和證據，而不是只看一張漂亮的圖。",
  showList: "清單檢視（無障礙）",
  showGraph: "圖形檢視",
  exportImage: "匯出圖片",
  desktopOnly: "桌面版提供",
  empty: {
    title: "圖譜還沒有內容",
    description: "研究執行完成知識標準化後，實體與關係會投影成 2D 圖譜。",
  },
  filter: {
    byType: "按類型過濾",
    typeAll: "全部節點",
    typeConcept: "概念",
    typeTechnology: "技術",
    typeCompany: "企業",
    typePaper: "論文",
    cluster: "按維度群組",
    clusterTitle: "按研究維度分欄佈局",
    search: "搜尋節點",
    searchPlaceholder: "按標題搜尋…",
    byDimension: "按維度過濾",
    dimensionAll: "全部維度",
    byConfidence: "按置信狀態過濾",
    confidenceAll: "全部置信",
    byRelation: "按關係類型過濾",
    relationAll: "全部關係",
    yearFrom: "起始年份",
    yearFromOption: "年份從",
    yearTo: "結束年份",
    yearToOption: "到",
  },
  counts: "{{nodes}} 節點 · {{relations}} 關係",
  inspector: {
    aria: "圖譜檢查器",
    placeholderList: "點選清單中的節點查看詳情。",
    placeholderGraph: "點選節點查看詳情。",
    current: "目前選擇",
    closeAria: "關閉詳情",
    noSummary: "暫無摘要",
    sourceCount: "來源數量",
    relationCount: "關聯關係",
    relationsHeading: "關係（{{total}}）",
    openMarkdown: "開啟 Markdown",
  },
  canvas: {
    aria: "知識圖譜（2D 力導向佈局）",
    caption: "知識節點清單（圖譜替代檢視）",
    nodeAria: "{{title}}（{{type}}，置信 {{confidence}}）",
    edgeAria: "關係：{{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "節點",
    type: "類型",
    dimension: "維度",
    confidence: "置信",
    year: "年份",
    sourcesClaims: "來源/論斷",
  },
};

export default graph;
