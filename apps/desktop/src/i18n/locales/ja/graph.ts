/**
 * ja graph resources (ADR-023): Japanese translation of the knowledge graph
 * view. Glossary: ナレッジグラフ / ノード / リレーション /
 * ディメンション / 信頼度 / エビデンス。
 */
const graph = {
  kicker: "ナレッジグラフ",
  title: "研究の関係マップ",
  description:
    "きれいな図を見て満足するのではなく、ノードの関係からソースとエビデンスへさかのぼれます。",
  showList: "リストビュー（アクセシブル）",
  showGraph: "グラフビュー",
  exportImage: "画像をエクスポート",
  desktopOnly: "デスクトップ版のみ",
  empty: {
    title: "グラフはまだ空です",
    description:
      "研究ランの正規化が完了すると、エンティティとリレーションが 2D グラフに投影されます。",
  },
  filter: {
    byType: "種類でフィルター",
    typeAll: "すべてのノード",
    typeConcept: "概念",
    typeTechnology: "テクノロジー",
    typeCompany: "企業",
    typePaper: "論文",
    cluster: "ディメンションでクラスタリング",
    clusterTitle: "研究ディメンションごとに列を配置",
    search: "ノードを検索",
    searchPlaceholder: "タイトルで検索…",
    byDimension: "ディメンションでフィルター",
    dimensionAll: "すべてのディメンション",
    byConfidence: "信頼状態でフィルター",
    confidenceAll: "すべての信頼度",
    byRelation: "リレーション種別でフィルター",
    relationAll: "すべてのリレーション",
    yearFrom: "開始年",
    yearFromOption: "年から",
    yearTo: "終了年",
    yearToOption: "年まで",
  },
  counts: "ノード {{nodes}} · リレーション {{relations}}",
  inspector: {
    aria: "グラフインスペクター",
    placeholderList: "リストでノードを選択すると詳細が表示されます。",
    placeholderGraph: "ノードを選択すると詳細が表示されます。",
    current: "現在の選択",
    closeAria: "詳細を閉じる",
    noSummary: "要約はまだありません",
    sourceCount: "ソース数",
    relationCount: "リレーション",
    relationsHeading: "リレーション（{{total}}）",
    openMarkdown: "Markdown で開く",
  },
  canvas: {
    aria: "ナレッジグラフ（2D 力学的レイアウト）",
    caption: "ナレッジノード一覧（グラフの代替ビュー）",
    nodeAria: "{{title}}（{{type}}、信頼度 {{confidence}}）",
    edgeAria: "リレーション: {{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "ノード",
    type: "種類",
    dimension: "ディメンション",
    confidence: "信頼度",
    year: "年",
    sourcesClaims: "ソース/クレーム",
  },
};

export default graph;
