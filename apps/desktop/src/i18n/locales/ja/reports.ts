/**
 * ja reports resources (ADR-023): Japanese translation of the read-only
 * project briefing view. Glossary: ソース / ナレッジノード / クレーム /
 * カバレッジ / ラン。
 */
const reports = {
  kicker: "レポート",
  title: "プロジェクト研究ブリーフィング",
  description:
    "現在のプロジェクトのソース・ナレッジ・カバレッジから生成した 1 ページの要約です。ブリーフィングの完全エクスポートは今後提供予定です。",
  empty: {
    title: "まだレポートする内容がありません",
    description:
      "研究ランがソース・ナレッジノード・クレームを産出すると、ここにプロジェクトブリーフィングとして要約されます。",
  },
  metrics: {
    sources: "ソース",
    knowledge: "ナレッジノード",
    claims: "クレーム",
    coverage: "研究カバレッジ",
  },
  dimensions: {
    kicker: "カバレッジ",
    title: "ディメンション別カバレッジ表",
    caption: "研究ディメンションごとのカバレッジと主要インプット",
    colDimension: "ディメンション",
    colCoverage: "カバレッジ",
    colTasks: "完了タスク",
    colNodes: "ナレッジノード",
    colQualitySources: "高品質ソース",
  },
  runs: {
    kicker: "ラン履歴",
    title: "最近の研究ラン",
    empty: "まだ研究ランはありません。ランを開始するとイベントがここに表示されます。",
  },
  export: {
    kicker: "エクスポート",
    soon: "近日提供",
    title: "レポートをエクスポート",
    description:
      "研究ブリーフィングと Vault エクスポートはパイプライン統合後に提供予定です。現在のバージョンでは、このページがデータを要約します。",
  },
};

export default reports;
