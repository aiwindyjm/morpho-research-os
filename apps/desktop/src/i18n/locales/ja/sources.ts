/**
 * ja sources resources (ADR-023): Japanese translation of the sources
 * library view. Glossary: ソース / 品質 / クレーム。未評価のソースは
 * 「要評価」（タスク・クレームの「要レビュー」と区別）。
 */
const sources = {
  kicker: "ソースライブラリ",
  title: "発見されたソース",
  description:
    "各ソースは正規化済みのアドレス・種類・品質情報と、貢献したクレームを保持します。",
  importLinks: "リンクをインポート",
  desktopOnly: "デスクトップ版のみ",
  qualityToggle: "品質で絞り込み",
  empty: {
    title: "まだソースがありません",
    description: "研究プランを承認してランを開始すると、発見されたソースがここに表示されます。",
  },
  summary: {
    all: "すべて",
    high: "高品質",
    medium: "中品質",
    pending: "要評価",
  },
  search: "ソースやキーワードを検索",
  searchPlaceholder: "タイトルやアドレスを検索…",
  filter: {
    all: "すべての種類",
    paper: "論文",
    documentation: "公式ドキュメント",
  },
  count: "ソース {{total}} 件",
  noMatch: "一致するソースがありません。キーワードを変えるか、絞り込みを解除してください。",
};

export default sources;
