/**
 * ko overview resources (ADR-023): Korean translation of the overview
 * dashboard. Glossary: 커버리지 / 차원 / 클레임 / 증거 / 런 / 갭.
 */
const overview = {
  kicker: "연구 프로젝트 / {{status}}",
  notStarted: "시작 안 함",
  fallbackTitle: "개요",
  editConfig: "설정 편집",
  viewTasks: "태스크 보기 →",
  planDraftTitle: "먼저 연구 플랜 페이지에서 플랜을 승인하세요",
  continueResearch: "리서치 계속 →",
  empty: {
    title: "선택된 프로젝트가 없습니다",
    description:
      "먼저 내 리서치에서 연구 프로젝트를 선택하거나 만들면 여기에 개요가 표시됩니다.",
    action: "내 리서치로 이동",
  },
  metrics: {
    coverage: "리서치 커버리지",
    coverageMeta: "핵심 차원 {{done}} / {{total}} 완료",
    sources: "소스",
    sourcesMeta: "고품질 {{total}}개",
    knowledge: "지식 노드",
    knowledgeMeta: "{{total}}가지 유형",
    reviews: "검토 필요 클레임",
    reviewsMeta: "충돌 {{total}}개",
    coverageProgressAria: "커버리지 진행률",
  },
  path: {
    kicker: "리서치 진행 상황",
    title: "현재 리서치 경로",
    viewAll: "전체 보기 →",
    empty:
      "실행 가능한 태스크가 아직 없습니다. 플랜을 승인하고 런을 시작하면 태스크가 의존 순서대로 표시됩니다.",
    executing: "실행 중",
    waitingPredecessor: "선행 태스크 대기 중",
    progressAria: "태스크 완료 진행률",
    stateDone: "완료",
    stateReview: "검토 필요",
    stateWaiting: "대기 중",
  },
  activity: {
    kicker: "리서치 활동",
    title: "방금 발생",
    live: "실시간",
    empty:
      "아직 활동이 없습니다. 리서치 런을 시작하면 소스·클레임·지식 노드가 시간 순서로 표시됩니다.",
  },
  dimensions: {
    kicker: "커버리지",
    title: "리서치 차원",
    viewKnowledge: "지식 보기 →",
    progressAria: "{{dimension}} 커버리지 진행률",
  },
  coverage: {
    why: "이 점수의 이유는?",
    taskCompletion: "태스크 완료도 {{score}} (가중치 {{weight}}): {{done}}/{{total}} 태스크 완료",
    knowledgeBreadth: "지식 폭 {{score}} (가중치 {{weight}}): 노드 {{total}}개",
    evidenceDensity: "증거 밀도 {{score}} (가중치 {{weight}}): 증거 {{total}}건",
    sourceDiversity: "소스 다양성 {{score}} (가중치 {{weight}}): 독립적인 고품질 소스 {{total}}개",
  },
  next: {
    kicker: "다음 단계",
    title: "추천 다음 리서치",
    triggerCoverage: "커버리지 부족",
    triggerSources: "소스 부족",
    createdTask: "태스크 '{{title}}'이(가) 만들어졌습니다.",
    createdTaskHint: "새 태스크는 태스크 페이지에 표시되며 언제든 일시 정지하거나 재시도할 수 있습니다.",
    createTask: "리서치 태스크 만들기 →",
    dismissAria: "이 제안 무시",
    dismiss: "무시",
    empty: "갭 제안이 없습니다. 커버리지가 양호합니다.",
  },
};

export default overview;
