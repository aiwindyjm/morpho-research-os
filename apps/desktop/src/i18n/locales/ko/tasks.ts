/**
 * ko tasks resources (ADR-023): Korean translation of the tasks view.
 * Glossary: 태스크 / 런 / 검토 (태스크·클레임의 "to review"는 '검토 필요'로
 * 통일).
 */
const tasks = {
  kicker: "리서치 태스크",
  title: "진행 중인 작업",
  description: "모든 태스크는 일시 정지·재시도할 수 있고 소스와 결과까지 추적할 수 있습니다.",
  continueRun: "런 계속",
  runStartedToast: {
    title: "리서치 런이 시작되었습니다",
    detail: "태스크는 의존 순서대로 실행됩니다.",
  },
  runBadge: "런 상태: {{state}}",
  runDeliveryPending: "실행 완료, 결과 전달 중",
  runDeliveryFailed: "실행 완료, 결과 전달 실패",
  empty: {
    title: "아직 태스크가 없습니다",
    approved: "플랜이 승인되었습니다. 오른쪽 위의 '런 계속'을 클릭해 태스크를 만드세요.",
    draft:
      "먼저 연구 플랜 페이지에서 플랜을 검토하고 승인하세요. 승인 후 태스크가 만들어집니다.",
    generic: "먼저 연구 플랜 페이지에서 플랜을 생성하고 승인하세요.",
  },
  filterAria: "태스크 상태로 필터링",
  tabs: {
    all: "전체",
    active: "실행 중",
    review: "검토 필요",
    done: "완료",
  },
  lastUpdated: "마지막 업데이트 {{date}}",
  col: {
    task: "태스크",
    stage: "단계",
    status: "상태",
  },
  pill: {
    running: "실행 중",
    needsReview: "검토 필요",
    completed: "완료",
  },
  action: {
    menuAria: "태스크 작업",
    pause: "일시 정지",
    resume: "재개",
    retry: "재시도",
    confirmContinue: "확인하고 계속",
    cancel: "취소",
    unsupportedTitle: "V0.1에서는 지원되지 않음",
    unsupportedHint: "작업별 제어(일시정지/재개/재시도/취소)는 작업별 디스패치가 필요하며 이후 버전에 제공됩니다. 지금은 '실행 취소'로 전체 실행을 중지할 수 있습니다.",
  },
  runStartFailedToast: {
    title: "연구 실행을 시작하지 못했습니다",
  },
};

export default tasks;
