/**
 * zh-TW config resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the research configuration form.
 * Glossary: 研究設定 / 計畫 / 維度 / 來源 / 論斷。Validation copy mirrors
 * the zh-CN reference semantics.
 */
const config = {
  kicker: "研究設定",
  title: "定義你的研究問題",
  description: "這些資訊會決定研究計畫的範圍、深度和來源選擇。",
  cancel: "取消",
  discard: "放棄修改",
  save: "儲存設定",
  saveError: {
    title: "無法儲存",
    validation: "設定未通過驗證：{{issue}}",
    failed: "儲存失敗，請稍後重試。",
  },
  noProject: {
    title: "請先選擇或建立專案",
    description: "研究設定屬於具體的專案；切換或新增專案後再來設定。",
  },
  section01: {
    title: "研究主題",
    help: "先明確你要理解的對象和最終用途。",
  },
  section02: {
    title: "研究範圍",
    help: "範圍越清晰，計畫越容易執行和複核。",
  },
  section03: {
    title: "研究維度",
    help: "選擇計畫必須覆蓋的角度，可在產生計畫後繼續調整。",
  },
  section04: {
    title: "來源偏好",
    help: "Morpho 會優先搜尋這些來源，並保留每個論斷的出處。",
  },
  field: {
    domain: "研究領域",
    domainPlaceholder: "例如：神經工程",
    topic: "研究主題",
    topicPlaceholder: "例如：腦機介面在運動復健中的應用",
    purpose: "研究目的",
    audience: "使用對象 / 受眾",
    audiencePlaceholder: "例如：復健醫學研究者",
    depth: "研究深度",
    timeRange: "時間範圍",
    yearStart: "開始年份",
    yearStartPlaceholder: "如 2015",
    yearEnd: "結束年份",
    yearEndPlaceholder: "如 2026",
    yearTo: "至",
    languages: "語言",
    geographicScope: "地域範圍",
    geographicScopePlaceholder: "例如：global",
  },
  dimensions: {
    custom: "自訂維度",
    customTitle: "桌面版提供",
  },
  sourcePref: {
    paper: "期刊、預印本與會議資料",
    documentation: "官方文件與機構指南",
    web_page: "產業報導與專業媒體",
    repository: "程式碼與開源實作",
    dataset: "公開資料與實驗材料",
    book: "教材、專著與手冊",
    video: "講座與會議錄影",
  },
  footer: "更新頻率目前固定為手動（update_frequency: manual）；自動增量研究將在後續版本提供。",
};

export default config;
