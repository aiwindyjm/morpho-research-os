/**
 * ja projects resources (ADR-023): Japanese translation of the projects
 * list/create/switch view. Glossary: プロジェクト / 研究設定 /
 * カバレッジ。
 */
const projects = {
  kicker: "マイリサーチ",
  title: "すべての研究プロジェクト",
  description:
    "どのトピックも独立したリサーチスペースです。いつでも切り替え・続行・新規作成できます。",
  newResearch: "リサーチを新規作成",
  empty: {
    title: "まだ研究プロジェクトがありません",
    description:
      "最初のプロジェクトを作成して、研究課題を育ち続けるナレッジベースに変えましょう。",
  },
  search: "マイリサーチを検索",
  count: "プロジェクト {{total}} 件",
  createCard: {
    title: "リサーチを新規作成",
    hint: "ひとつの問いから始める",
  },
  card: {
    openAria: "プロジェクトを開く",
    statusDraft: "下書き",
    statusInProgress: "進行中",
    statusPaused: "一時停止中",
    coverage: "カバレッジ {{percent}}%",
    notStarted: "未着手",
    taskCount: "タスク {{total}} 件",
    updatedAt: "{{date}} 更新",
    progressAria: "プロジェクトの進捗",
    enterWorkspace: "ワークスペースを開く",
    switchTo: "このプロジェクトに切り替える",
    configure: "研究設定",
  },
  dialog: {
    title: "新しい研究プロジェクト",
    description:
      "プロジェクトごとに、設定・プラン・タスク・ナレッジ・アシスタントのコンテキストが独立します。",
    nameLabel: "プロジェクト名",
    namePlaceholder: "例: LLM 推論の最適化",
    descriptionLabel: "説明",
    descriptionPlaceholder: "このプロジェクトが答えるべき問いを一文で",
    cancel: "キャンセル",
    create: "プロジェクトを作成",
  },
  error: {
    nameRequired: "プロジェクト名は空にできません。",
    createFailed: "作成に失敗しました。もう一度お試しください。",
  },
};

export default projects;
