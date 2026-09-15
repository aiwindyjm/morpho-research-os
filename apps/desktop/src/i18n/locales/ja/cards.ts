/**
 * ja cards resources (ADR-023): Japanese translation of the shared card
 * components. Glossary: ソース / クレーム / エビデンス / ナレッジノード；
 * 未評価のソースは「要評価」。
 */
const cards = {
  tier: {
    pending: "要評価",
    high: "高品質",
    medium: "中品質",
  },
  sourceRow: {
    openAria: "ソースを開く",
  },
  quality: {
    rationale:
      "ソース品質: 権威性 {{authority}} · 適合度 {{fitness}} —— {{rationale}}（品質は用途への適合度を示し、内容の真偽を意味しません）",
    pending: "ソース品質は未評価です。",
  },
  knowledge: {
    sourceCount: "ソース {{total}} 件",
    claimCount: "クレーム {{total}} 件",
  },
  evidence: {
    none: "このクレームにはエビデンスの記録がありません。",
    locator: "位置情報: {{kind}} · {{value}} · {{date}} 取得",
    quote: "「{{quote}}」",
    directionSupport: "支持",
    directionContradict: "反証",
  },
  claim: {
    meta: "主体: {{subject}} · 信頼度 {{confidence}} · スコープ: {{scope}}",
    collapse: "エビデンスを隠す",
    expand: "エビデンスを見る（{{total}}）",
  },
};

export default cards;
