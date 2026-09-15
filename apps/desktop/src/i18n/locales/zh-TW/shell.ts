/**
 * zh-TW shell resources (ADR-023): Traditional Chinese (Taiwan conventions)
 * translation of the app/layout chrome (Topbar, Sidebar, ProjectSwitcher,
 * WorkspaceLayout/AssistantDock) and the workspace view nav labels.
 * Glossary: 專案 / 計畫 / 任務 / 來源 / 知識 / 圖譜 / 對話日誌 / 設定 / 報告。
 */
const shell = {
  // Workspace view nav labels (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "我的研究",
    overview: "總覽",
    config: "研究設定",
    plan: "研究計畫",
    tasks: "任務",
    sources: "來源",
    knowledge: "知識",
    graph: "圖譜",
    journal: "對話日誌",
    settings: "設定",
    reports: "報告",
  },

  // Topbar
  breadcrumb: "位置",
  noProjectSelected: "未選擇專案",
  saved: "已儲存",
  helpUnavailable: "本機版暫未提供說明文件",
  help: "說明",
  localUser: "本機使用者",

  // Topbar quick menus (I3): language + skin popovers. The language options
  // themselves are locale-invariant self-names from `LANGUAGES` (src/i18n),
  // and skin names resolve through t("settings:theme.<id>.name").
  languageMenu: "切換介面語言",
  languageList: "介面語言",
  skinMenu: "切換外觀主題",
  skinList: "外觀主題",

  // Sidebar
  primaryNav: "主導覽",
  localWorkspace: "本機工作區",
  dataStaysLocal: "資料儲存在本機",
  closeNavigation: "關閉導覽",
  navigationMenu: "導覽選單",

  // WorkspaceLayout + AssistantDock
  skipToContent: "跳至主要內容",
  mainViewAria: "{{view}}檢視",
  openNavigationMenu: "開啟導覽選單",
  menu: "選單",
  openAssistant: "開啟 AI 助理",
  assistant: "AI 助理",
  closeAssistantPanel: "關閉助理面板",
  assistantPanelAria: "Morpho AI 助理",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "載入中…",
    noProjectSelected: "未選擇專案",
    researchProject: "研究專案",
    currentWorkspace: "當前工作區",
    manageAll: "管理全部",
    projectListAria: "專案清單",
    emptyProjects: "還沒有專案，先建立一個吧。",
    newProject: "新增專案",
    newProjectDialogTitle: "新增研究專案",
    newProjectDialogDescription: "每個專案擁有獨立的設定、計畫、任務、知識與助理上下文。",
    nameLabel: "專案名稱",
    namePlaceholder: "例如：大型語言模型推論最佳化",
    descriptionLabel: "專案描述",
    descriptionPlaceholder: "一句話說明這個專案要回答什麼問題",
    cancel: "取消",
    create: "建立專案",
    nameRequired: "專案名稱不能為空。",
    createFailed: "建立失敗，請重試。",
    status: {
      draft: "草稿 · 尚未執行",
      inProgress: "進行中 · {{percent}}%",
      paused: "已暫停 · {{percent}}%",
    },
  },
};

export default shell;
