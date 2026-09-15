/**
 * ja shell resources (ADR-023): Japanese translation of the app/layout
 * chrome (Topbar, Sidebar, ProjectSwitcher, WorkspaceLayout/AssistantDock)
 * and the workspace view nav labels. Glossary: プロジェクト / プラン /
 * タスク / ソース / ナレッジ / グラフ / ジャーナル / 設定 / レポート。
 */
const shell = {
  // Workspace view nav labels (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "マイリサーチ",
    overview: "概要",
    config: "研究設定",
    plan: "研究プラン",
    tasks: "タスク",
    sources: "ソース",
    knowledge: "ナレッジ",
    graph: "グラフ",
    journal: "ジャーナル",
    settings: "設定",
    reports: "レポート",
  },

  // Topbar
  breadcrumb: "パンくずリスト",
  noProjectSelected: "プロジェクトが未選択",
  saved: "保存済み",
  helpUnavailable: "ローカル版ではヘルプドキュメントを利用できません",
  help: "ヘルプ",
  localUser: "ローカルユーザー",

  // Topbar quick menus (I3): language + skin popovers. The language options
  // themselves are locale-invariant self-names from `LANGUAGES` (src/i18n),
  // and skin names resolve through t("settings:theme.<id>.name").
  languageMenu: "表示言語を切り替える",
  languageList: "表示言語",
  skinMenu: "外観テーマを切り替える",
  skinList: "外観テーマ",

  // Sidebar
  primaryNav: "メインナビゲーション",
  localWorkspace: "ローカルワークスペース",
  dataStaysLocal: "データはこのデバイスに保存されます",
  closeNavigation: "ナビゲーションを閉じる",
  navigationMenu: "ナビゲーションメニュー",

  // WorkspaceLayout + AssistantDock
  skipToContent: "メインコンテンツへスキップ",
  mainViewAria: "{{view}}ビュー",
  openNavigationMenu: "ナビゲーションメニューを開く",
  menu: "メニュー",
  openAssistant: "AI アシスタントを開く",
  assistant: "AI アシスタント",
  closeAssistantPanel: "アシスタントパネルを閉じる",
  assistantPanelAria: "Morpho AI アシスタント",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "読み込み中…",
    noProjectSelected: "プロジェクトが未選択",
    researchProject: "研究プロジェクト",
    currentWorkspace: "現在のワークスペース",
    manageAll: "すべて管理",
    projectListAria: "プロジェクト一覧",
    emptyProjects: "まだプロジェクトがありません。最初の 1 件を作成しましょう。",
    newProject: "新規プロジェクト",
    newProjectDialogTitle: "新しい研究プロジェクト",
    newProjectDialogDescription:
      "プロジェクトごとに、設定・プラン・タスク・ナレッジ・アシスタントのコンテキストが独立します。",
    nameLabel: "プロジェクト名",
    namePlaceholder: "例: LLM 推論の最適化",
    descriptionLabel: "説明",
    descriptionPlaceholder: "このプロジェクトが答えるべき問いを一文で",
    cancel: "キャンセル",
    create: "プロジェクトを作成",
    nameRequired: "プロジェクト名は空にできません。",
    createFailed: "作成に失敗しました。もう一度お試しください。",
    status: {
      draft: "下書き · 未実行",
      inProgress: "進行中 · {{percent}}%",
      paused: "一時停止中 · {{percent}}%",
    },
  },
};

export default shell;
