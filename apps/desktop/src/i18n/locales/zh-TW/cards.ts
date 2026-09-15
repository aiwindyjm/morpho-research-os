/**
 * zh-TW cards resources (ADR-023): Traditional Chinese (Taiwan conventions)
 * translation of the shared card components. Glossary: 來源 / 論斷 / 證據 /
 * 知識節點；未評估來源用「待評估」。
 */
const cards = {
  tier: {
    pending: "待評估",
    high: "高品質",
    medium: "中等",
  },
  sourceRow: {
    openAria: "開啟來源",
  },
  quality: {
    rationale:
      "來源品質：權威性 {{authority}} · 適配度 {{fitness}} —— {{rationale}}（品質描述用途適配，不代表內容真偽）",
    pending: "來源品質待評估。",
  },
  knowledge: {
    sourceCount: "{{total}} 個來源",
    claimCount: "{{total}} 個論斷",
  },
  evidence: {
    none: "該論斷暫無證據紀錄。",
    locator: "定位：{{kind}} · {{value}} · 擷取於 {{date}}",
    quote: "「{{quote}}」",
    directionSupport: "支持",
    directionContradict: "反駁",
  },
  claim: {
    meta: "主體：{{subject}} · 置信度 {{confidence}} · 範圍：{{scope}}",
    collapse: "收合證據",
    expand: "檢視證據（{{total}}）",
  },
};

export default cards;
