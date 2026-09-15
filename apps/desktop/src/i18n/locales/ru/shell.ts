/**
 * Russian shell resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure). Brand names ("Morpho",
 * "Research project" fragment) follow the en reference and stay as-is.
 */
const shell = {
  // Workspace view nav labels (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "Мои исследования",
    overview: "Обзор",
    config: "Конфигурация исследования",
    plan: "План исследования",
    tasks: "Задачи",
    sources: "Источники",
    knowledge: "Знания",
    graph: "Граф",
    journal: "Журнал",
    settings: "Настройки",
    reports: "Отчёты",
  },

  // Topbar
  breadcrumb: "Навигационная цепочка",
  noProjectSelected: "Проект не выбран",
  saved: "Сохранено",
  helpUnavailable: "Справочная документация недоступна в локальной сборке",
  help: "Справка",
  localUser: "Локальный пользователь",

  // Topbar quick menus (I3): language + skin popovers. The language options
  // themselves are locale-invariant self-names from `LANGUAGES` (src/i18n),
  // and skin names resolve through t("settings:theme.<id>.name").
  languageMenu: "Сменить язык интерфейса",
  languageList: "Язык интерфейса",
  skinMenu: "Сменить тему оформления",
  skinList: "Тема оформления",

  // Sidebar
  primaryNav: "Основная навигация",
  localWorkspace: "Локальная рабочая область",
  dataStaysLocal: "Данные хранятся на этом устройстве",
  closeNavigation: "Закрыть навигацию",
  navigationMenu: "Меню навигации",

  // WorkspaceLayout + AssistantDock
  skipToContent: "Перейти к основному содержимому",
  mainViewAria: "Представление {{view}}",
  openNavigationMenu: "Открыть меню навигации",
  menu: "Меню",
  openAssistant: "Открыть ИИ-ассистента",
  assistant: "ИИ-ассистент",
  closeAssistantPanel: "Закрыть панель ассистента",
  assistantPanelAria: "ИИ-ассистент Morpho",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "Загрузка…",
    noProjectSelected: "Проект не выбран",
    researchProject: "Research project",
    currentWorkspace: "Текущая рабочая область",
    manageAll: "Управление всеми",
    projectListAria: "Список проектов",
    emptyProjects: "Проектов пока нет — создайте первый.",
    newProject: "Новый проект",
    newProjectDialogTitle: "Новый исследовательский проект",
    newProjectDialogDescription:
      "У каждого проекта своя конфигурация, план, задачи, знания и контекст ассистента.",
    nameLabel: "Название проекта",
    namePlaceholder: "например: оптимизация инференса LLM",
    descriptionLabel: "Описание",
    descriptionPlaceholder:
      "Одним предложением: на какой вопрос должен ответить этот проект?",
    cancel: "Отмена",
    create: "Создать проект",
    nameRequired: "Название проекта не может быть пустым.",
    createFailed: "Не удалось создать. Повторите попытку.",
    status: {
      draft: "Черновик · не запускался",
      inProgress: "В работе · {{percent}}%",
      paused: "Приостановлен · {{percent}}%",
    },
  },
};

export default shell;
