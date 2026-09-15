/**
 * ko shell resources (ADR-023): Korean translation of the app/layout chrome
 * (Topbar, Sidebar, ProjectSwitcher, WorkspaceLayout/AssistantDock) and the
 * workspace view nav labels. Glossary: 프로젝트 / 플랜 / 태스크 / 소스 /
 * 지식 / 그래프 / 저널 / 설정 / 리포트.
 */
const shell = {
  // Workspace view nav labels (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "내 리서치",
    overview: "개요",
    config: "연구 설정",
    plan: "연구 플랜",
    tasks: "태스크",
    sources: "소스",
    knowledge: "지식",
    graph: "그래프",
    journal: "저널",
    settings: "설정",
    reports: "리포트",
  },

  // Topbar
  breadcrumb: "위치 경로",
  noProjectSelected: "선택된 프로젝트 없음",
  saved: "저장됨",
  helpUnavailable: "로컬 빌드에서는 도움말 문서를 사용할 수 없습니다",
  help: "도움말",
  localUser: "로컬 사용자",

  // Topbar quick menus (I3): language + skin popovers. The language options
  // themselves are locale-invariant self-names from `LANGUAGES` (src/i18n),
  // and skin names resolve through t("settings:theme.<id>.name").
  languageMenu: "인터페이스 언어 변경",
  languageList: "인터페이스 언어",
  skinMenu: "외관 테마 변경",
  skinList: "외관 테마",

  // Sidebar
  primaryNav: "기본 탐색",
  localWorkspace: "로컬 워크스페이스",
  dataStaysLocal: "데이터는 이 기기에 저장됩니다",
  closeNavigation: "탐색 닫기",
  navigationMenu: "탐색 메뉴",

  // WorkspaceLayout + AssistantDock
  skipToContent: "본문으로 건너뛰기",
  mainViewAria: "{{view}} 보기",
  openNavigationMenu: "탐색 메뉴 열기",
  menu: "메뉴",
  openAssistant: "AI 어시스턴트 열기",
  assistant: "AI 어시스턴트",
  closeAssistantPanel: "어시스턴트 패널 닫기",
  assistantPanelAria: "Morpho AI 어시스턴트",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "불러오는 중…",
    noProjectSelected: "선택된 프로젝트 없음",
    researchProject: "연구 프로젝트",
    currentWorkspace: "현재 워크스페이스",
    manageAll: "전체 관리",
    projectListAria: "프로젝트 목록",
    emptyProjects: "아직 프로젝트가 없습니다. 첫 프로젝트를 만들어 보세요.",
    newProject: "새 프로젝트",
    newProjectDialogTitle: "새 연구 프로젝트",
    newProjectDialogDescription:
      "프로젝트마다 설정·플랜·태스크·지식·어시스턴트 컨텍스트가 독립적으로 유지됩니다.",
    nameLabel: "프로젝트 이름",
    namePlaceholder: "예: LLM 추론 최적화",
    descriptionLabel: "설명",
    descriptionPlaceholder: "이 프로젝트가 답해야 할 질문을 한 문장으로 적어 주세요",
    cancel: "취소",
    create: "프로젝트 만들기",
    nameRequired: "프로젝트 이름은 비워 둘 수 없습니다.",
    createFailed: "만들기에 실패했습니다. 다시 시도해 주세요.",
    status: {
      draft: "초안 · 아직 실행 안 함",
      inProgress: "진행 중 · {{percent}}%",
      paused: "일시 정지됨 · {{percent}}%",
    },
  },
};

export default shell;
