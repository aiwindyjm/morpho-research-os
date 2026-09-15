/**
 * ko projects resources (ADR-023): Korean translation of the projects
 * list/create/switch view. Glossary: 프로젝트 / 연구 설정 / 커버리지.
 */
const projects = {
  kicker: "내 리서치",
  title: "모든 연구 프로젝트",
  description: "모든 주제는 독립적인 리서치 공간입니다. 언제든 전환·계속·새로 만들 수 있습니다.",
  newResearch: "새 리서치",
  empty: {
    title: "아직 연구 프로젝트가 없습니다",
    description:
      "첫 프로젝트를 만들어 하나의 연구 질문을 계속 성장하는 지식 베이스로 바꿔 보세요.",
  },
  search: "내 리서치 검색",
  count: "프로젝트 {{total}}개",
  createCard: {
    title: "새 리서치 시작",
    hint: "하나의 질문에서 시작",
  },
  card: {
    openAria: "프로젝트 열기",
    statusDraft: "초안",
    statusInProgress: "진행 중",
    statusPaused: "일시 정지됨",
    coverage: "커버리지 {{percent}}%",
    notStarted: "시작 안 함",
    taskCount: "태스크 {{total}}개",
    updatedAt: "{{date}} 업데이트",
    progressAria: "프로젝트 진행률",
    enterWorkspace: "워크스페이스 열기",
    switchTo: "이 프로젝트로 전환",
    configure: "연구 설정",
  },
  dialog: {
    title: "새 연구 프로젝트",
    description:
      "프로젝트마다 설정·플랜·태스크·지식·어시스턴트 컨텍스트가 독립적으로 유지됩니다.",
    nameLabel: "프로젝트 이름",
    namePlaceholder: "예: LLM 추론 최적화",
    descriptionLabel: "설명",
    descriptionPlaceholder: "이 프로젝트가 답해야 할 질문을 한 문장으로 적어 주세요",
    cancel: "취소",
    create: "프로젝트 만들기",
  },
  error: {
    nameRequired: "프로젝트 이름은 비워 둘 수 없습니다.",
    createFailed: "만들기에 실패했습니다. 다시 시도해 주세요.",
  },
};

export default projects;
