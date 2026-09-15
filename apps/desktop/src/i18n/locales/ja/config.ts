/**
 * ja config resources (ADR-023): Japanese translation of the research
 * configuration form. Glossary: 研究設定 / プラン / ディメンション /
 * ソース / クレーム。
 */
const config = {
  kicker: "研究設定",
  title: "研究課題を定義する",
  description: "これらの情報が、研究プランの範囲・深さ・ソース選択を決めます。",
  cancel: "キャンセル",
  discard: "変更を破棄",
  save: "設定を保存",
  saveError: {
    title: "保存できません",
    validation: "設定が検証を通過しませんでした: {{issue}}",
    failed: "保存に失敗しました。しばらくしてからもう一度お試しください。",
  },
  noProject: {
    title: "先にプロジェクトを選択または作成してください",
    description:
      "研究設定は個々のプロジェクトに紐づきます。プロジェクトを切り替えるか作成してから設定してください。",
  },
  section01: {
    title: "研究トピック",
    help: "まず、何を理解したいのか、最終的な用途は何かを明確にします。",
  },
  section02: {
    title: "研究スコープ",
    help: "スコープが明確なほど、プランの実行とレビューがしやすくなります。",
  },
  section03: {
    title: "研究ディメンション",
    help: "プランが必ずカバーすべき観点を選択します。プラン生成後でも調整できます。",
  },
  section04: {
    title: "ソースの優先設定",
    help: "Morpho はこれらのソースを優先的に検索し、すべてのクレームの出所を保持します。",
  },
  field: {
    domain: "研究分野",
    domainPlaceholder: "例: ニューラルエンジニアリング",
    topic: "研究トピック",
    topicPlaceholder: "例: 運動リハビリにおけるブレイン・マシン・インターフェース",
    purpose: "研究目的",
    audience: "想定読者",
    audiencePlaceholder: "例: リハビリテーション医学の研究者",
    depth: "研究の深さ",
    timeRange: "期間",
    yearStart: "開始年",
    yearStartPlaceholder: "例: 2015",
    yearEnd: "終了年",
    yearEndPlaceholder: "例: 2026",
    yearTo: "〜",
    languages: "言語",
    geographicScope: "地域スコープ",
    geographicScopePlaceholder: "例: グローバル",
  },
  dimensions: {
    custom: "カスタムディメンション",
    customTitle: "デスクトップ版のみ",
  },
  sourcePref: {
    paper: "ジャーナル・プレプリント・学会資料",
    documentation: "公式ドキュメント・公的機関のガイダンス",
    web_page: "業界報道・専門メディア",
    repository: "コードとオープンソース実装",
    dataset: "公開データと実験材料",
    book: "教科書・専門書・ハンドブック",
    video: "講義・会議の録画",
  },
  footer:
    "更新頻度は現在の手動（update_frequency: manual）に固定されています。自動増分リサーチは今後のリリースで提供予定です。",
};

export default config;
