/**
 * zh-TW sources resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the sources library view. Glossary: 來源 /
 * 品質 / 論斷；未評估來源用「待評估」（與任務/論斷的「待審核」區分）。
 */
const sources = {
  kicker: "來源庫",
  title: "已發現的來源",
  description: "每個來源都會保留標準化位址、來源類型、品質資訊和貢獻的論斷。",
  importLinks: "匯入連結",
  desktopOnly: "桌面版提供",
  qualityToggle: "按品質篩選",
  empty: {
    title: "還沒有來源",
    description: "核准研究計畫並開始執行後，檢索到的來源會出現在這裡。",
  },
  summary: {
    all: "全部",
    high: "高品質",
    medium: "中等",
    pending: "待評估",
  },
  search: "搜尋來源或關鍵字",
  searchPlaceholder: "搜尋標題或位址…",
  filter: {
    all: "全部類型",
    paper: "論文",
    documentation: "官方文件",
  },
  count: "{{total}} 個來源",
  noMatch: "沒有符合的來源；試試更換關鍵字或清除篩選條件。",
};

export default sources;
