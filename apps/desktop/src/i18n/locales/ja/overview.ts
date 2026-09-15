/**
 * ja overview resources (ADR-023): Japanese translation of the overview
 * dashboard. Glossary: カバレッジ / ディメンション / クレーム /
 * エビデンス / ラン / ギャップ。
 */
const overview = {
  kicker: "研究プロジェクト / {{status}}",
  notStarted: "未着手",
  fallbackTitle: "概要",
  editConfig: "設定を編集",
  viewTasks: "タスクを見る →",
  planDraftTitle: "まず研究プランページでプランを承認してください",
  continueResearch: "研究を続ける →",
  empty: {
    title: "プロジェクトが未選択です",
    description:
      "まずマイリサーチで研究プロジェクトを選択または作成すると、ここに概要が表示されます。",
    action: "マイリサーチへ",
  },
  metrics: {
    coverage: "研究カバレッジ",
    coverageMeta: "主要ディメンション {{done}} / {{total}} 完了",
    sources: "ソース",
    sourcesMeta: "高品質 {{total}} 件",
    knowledge: "ナレッジノード",
    knowledgeMeta: "{{total}} 種類",
    reviews: "レビュー待ちのクレーム",
    reviewsMeta: "競合 {{total}} 件",
    coverageProgressAria: "カバレッジの進捗",
  },
  path: {
    kicker: "研究の進捗",
    title: "現在のリサーチパス",
    viewAll: "すべて見る →",
    empty:
      "実行可能なタスクはまだありません。プランを承認してランを開始すると、依存順にタスクが表示されます。",
    executing: "実行中",
    waitingPredecessor: "前のタスクを待機中",
    progressAria: "タスク完了の進捗",
    stateDone: "完了",
    stateReview: "要レビュー",
    stateWaiting: "待機中",
  },
  activity: {
    kicker: "研究アクティビティ",
    title: "最新の動き",
    live: "ライブ",
    empty:
      "アクティビティはまだありません。研究ランを開始すると、ソース・クレーム・ナレッジノードが時系列で表示されます。",
  },
  dimensions: {
    kicker: "カバレッジ",
    title: "研究ディメンション",
    viewKnowledge: "ナレッジを見る →",
    progressAria: "{{dimension}}のカバレッジ進捗",
  },
  coverage: {
    why: "このスコアの理由は？",
    taskCompletion: "タスク完了度 {{score}}（重み {{weight}}）: {{done}}/{{total}} タスク完了",
    knowledgeBreadth: "ナレッジの広がり {{score}}（重み {{weight}}）: ノード {{total}} 件",
    evidenceDensity: "エビデンス密度 {{score}}（重み {{weight}}）: エビデンス {{total}} 件",
    sourceDiversity:
      "ソース多様性 {{score}}（重み {{weight}}）: 独立した高品質ソース {{total}} 件",
  },
  next: {
    kicker: "次のステップ",
    title: "次のおすすめリサーチ",
    triggerCoverage: "カバレッジ不足",
    triggerSources: "ソースが不足",
    createdTask: "タスク「{{title}}」を作成しました。",
    createdTaskHint: "新しいタスクはタスクページに表示されます。いつでも一時停止や再試行ができます。",
    createTask: "研究タスクを作成 →",
    dismissAria: "この提案を閉じる",
    dismiss: "閉じる",
    empty: "ギャップの提案はありません。カバレッジは十分です。",
  },
};

export default overview;
