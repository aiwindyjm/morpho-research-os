/**
 * ja knowledge resources (ADR-023): Japanese translation of the knowledge
 * base view. Glossary: ナレッジノード / クレーム / エビデンス / Vault。
 */
const knowledge = {
  kicker: "ナレッジベース",
  title: "抽出されたナレッジ",
  description: "ノードはエンティティと概念、クレームとエビデンスは別々に保存されます。",
  filterAria: "種類で絞り込み",
  filterAll: "すべての種類",
  exportVault: "Vault をエクスポート",
  exportTitle: "ナレッジ・ソース・クレームを Markdown Vault としてエクスポート",
  toolbar: {
    sources: "ソース {{total}}",
    nodes: "ナレッジノード {{total}}",
    claims: "クレーム {{total}}",
  },
  empty: {
    title: "ナレッジベースはまだ空です",
    description:
      "研究ランの正規化が完了すると、エンティティ・クレーム・エビデンスがここに表示されます。",
  },
  tabs: {
    label: "ナレッジビュー",
    nodes: "ナレッジノード",
    claims: "クレームとエビデンス",
  },
  search: "ナレッジノードを検索",
  searchPlaceholder: "タイトル・要約・別名を検索…",
  nodeCount: "ノード {{total}} 件",
  noMatch:
    "一致するナレッジノードがありません。キーワードを変えるか、フィルターを解除してください。",
  claimsIntro:
    "クレームはナレッジノードから独立しています。矛盾するクレームは共存し、それぞれのエビデンスを保持します。",
  unknownSubject: "不明な主体",
  conflictBadge: "競合あり: 支持と反証のエビデンスが両方保持されています",
  evidenceLoading: "エビデンスを読み込み中…",
  toast: {
    conflictTitle: "エクスポート完了。ただし競合の手動対応が必要です",
    conflictDetail:
      "{{written}} 件を書き込み、{{unchanged}} 件は変更なし。{{conflicts}} 件はローカル変更があるためマージ提案として保持されました（{{proposals}}）。エクスポート先: {{root}}",
    successTitle: "Vault のエクスポートが完了",
    successDetail:
      "{{written}} 件を書き込み（ソース {{sources}}、クレーム {{claims}}、マップ {{maps}}）、{{unchanged}} 件は変更なし。エクスポート先: {{root}}",
    errorTitle: "Vault のエクスポートに失敗",
    listSeparator: "、",
    moreSuffix: "…",
  },
};

export default knowledge;
