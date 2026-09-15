/**
 * zh-CN shell resources (ADR-023): app/layout chrome (Topbar, Sidebar,
 * ProjectSwitcher, WorkspaceLayout/AssistantDock) plus the workspace view
 * nav labels referenced by `WORKSPACE_VIEWS.label` keys. Values are the
 * exact strings the shell rendered before i18n extraction, byte-identical
 * ("Research project" is a pre-existing English fragment kept as-is).
 */
const shell = {
  // Workspace view nav labels (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "我的研究",
    overview: "概览",
    config: "研究配置",
    plan: "研究计划",
    tasks: "任务",
    sources: "来源",
    knowledge: "知识",
    graph: "图谱",
    journal: "对话日志",
    settings: "设置",
    reports: "报告",
  },

  // Topbar
  breadcrumb: "位置",
  noProjectSelected: "未选择项目",
  saved: "已保存",
  helpUnavailable: "本地版暂未提供帮助文档",
  help: "帮助",
  localUser: "本地用户",

  // Topbar quick menus (I3): language + skin popovers. The language options
  // themselves are locale-invariant self-names from `LANGUAGES` (src/i18n),
  // and skin names resolve through t("settings:theme.<id>.name").
  languageMenu: "切换界面语言",
  languageList: "界面语言",
  skinMenu: "切换外观主题",
  skinList: "外观主题",

  // Sidebar
  primaryNav: "主导航",
  localWorkspace: "本地工作区",
  dataStaysLocal: "数据保存在本机",
  closeNavigation: "关闭导航",
  navigationMenu: "导航菜单",

  // WorkspaceLayout + AssistantDock
  skipToContent: "跳到主内容",
  mainViewAria: "{{view}}视图",
  openNavigationMenu: "打开导航菜单",
  menu: "菜单",
  openAssistant: "打开 AI 助手",
  assistant: "AI 助手",
  closeAssistantPanel: "关闭助手面板",
  assistantPanelAria: "Morpho AI 助手",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "加载中…",
    noProjectSelected: "未选择项目",
    researchProject: "Research project",
    currentWorkspace: "当前工作区",
    manageAll: "管理全部",
    projectListAria: "项目列表",
    emptyProjects: "还没有项目，先创建一个吧。",
    newProject: "新建项目",
    newProjectDialogTitle: "新建研究项目",
    newProjectDialogDescription: "每个项目拥有独立的配置、计划、任务、知识与助手上下文。",
    nameLabel: "项目名称",
    namePlaceholder: "例如：大语言模型推理优化",
    descriptionLabel: "项目描述",
    descriptionPlaceholder: "一句话说明这个项目要回答什么问题",
    cancel: "取消",
    create: "创建项目",
    nameRequired: "项目名称不能为空。",
    createFailed: "创建失败，请重试。",
    status: {
      draft: "草稿 · 尚未运行",
      inProgress: "进行中 · {{percent}}%",
      paused: "已暂停 · {{percent}}%",
    },
  },
};

export default shell;
