/**
 * ko plan resources (ADR-023): Korean translation of the plan review view.
 * Glossary: 플랜 / 태스크 / 런 / 검토 / 승인·거부; Planner·Orchestrator는
 * 원문 그대로 유지합니다. 플랜 초안은 '검토 대기'를 사용합니다.
 */
const plan = {
  kicker: "연구 플랜 / {{status}}",
  statusDraft: "검토 대기",
  fallbackTitle: "연구 플랜",
  noPlanDescription:
    "Planner는 검토 대기 중인 플랜 초안만 생성합니다. 승인 후에 실행 가능한 태스크가 만들어집니다.",
  regenerate: "다시 생성",
  reject: "플랜 거부",
  approveAria: "플랜 승인",
  approve: "확인하고 시작",
  startRun: "런 시작",
  runStartedToast: {
    title: "리서치 런이 시작되었습니다",
    detail: "태스크 페이지에서 실시간 진행 상황을 확인하세요.",
  },
  runStartFailed: "런 시작에 실패했습니다.",
  regenerateApproved: "플랜 다시 생성",
  generate: "연구 플랜 생성",
  actionError: {
    title: "작업이 완료되지 않았습니다",
    fallback: "작업에 실패했습니다. 다시 시도해 주세요.",
  },
  runAlert: {
    title: "런 상태: {{state}}",
    detail:
      "플랜이 실행 단계에 들어갔습니다(총 {{total}}개 태스크). 플랜을 조정하려면 태스크 페이지에서 태스크를 일시 정지하거나 이번 런이 끝나기를 기다려 주세요.",
  },
  empty: {
    title: "아직 연구 플랜이 없습니다",
    description:
      "먼저 연구 설정을 완성한 뒤 '연구 플랜 생성'을 클릭하세요. 플랜에는 차원별 검색·추출 태스크가 나열되어 검토를 기다립니다.",
  },
  summary: {
    tasks: "예정 태스크",
    sources: "소스",
    dimensions: "리서치 차원",
    reviews: "검토 필요",
  },
  group: {
    expandAria: "그룹 펼치기",
    collapseAria: "그룹 접기",
    taskCount: "태스크 {{total}}개",
  },
  task: {
    edit: "태스크 편집",
  },
  locked: {
    title: "플랜 잠김",
    detail:
      "이번 런이 이미 만들어져 플랜을 수정할 수 없습니다. 태스크를 일시 정지하거나 런이 끝난 뒤 플랜을 다시 생성하세요.",
  },
  editDialog: {
    title: "플랜 태스크 편집",
    description:
      "제목과 설명만 수정할 수 있습니다. 태스크 종류와 실행 순서는 Orchestrator가 결정합니다.",
    titleLabel: "태스크 제목",
    descriptionLabel: "태스크 설명",
    cancel: "취소",
    save: "변경 사항 저장",
    saveFailed: "변경 사항 저장에 실패했습니다.",
  },
};

export default plan;
