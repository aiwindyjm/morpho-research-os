/**
 * ko assistant resources (ADR-023): Korean translation of the contextual AI
 * assistant panel. Saving to the journal is always an explicit two-step
 * action; the copy keeps that emphasis. Glossary: 저널 / 클레임.
 */
const assistant = {
  aria: "AI 리서치 어시스턴트",
  kicker: "현재 프로젝트 어시스턴트",
  closeAria: "AI 어시스턴트 닫기",
  context: {
    loading: "프로젝트 컨텍스트를 불러오는 중…",
    usingBefore: "현재 ",
    usingAfter: "을(를) 리서치 컨텍스트로 사용 중",
  },
  navAria: "어시스턴트 작업",
  error: {
    title: "작업이 완료되지 않았습니다",
    fallback: "어시스턴트를 일시적으로 사용할 수 없습니다. 다시 시도해 주세요.",
  },
  decision: {
    empty: "먼저 저장할 결정 내용을 입력하세요.",
    title: "결정 기록",
    hint: "결정은 이 프로젝트 안에만 저장됩니다. '결정 저장'을 클릭해야 기록됩니다.",
    inputAria: "결정 내용",
    inputPlaceholder: "예: 다음 라운드는 정량 논문 소스 우선 확보",
    save: "결정 저장",
    saved: "결정이 저장되었습니다 (명시적 저장, 총 {{total}}건).",
    listSummary: "저장된 결정 ({{total}})",
  },
  journalSave: {
    title: "대화를 저널에 저장",
    idle:
      "현재 대화는 {{total}}개 메시지입니다. '저장 확인'을 클릭해야 로컬 저널에 기록되며, 자동으로 저장되지는 않습니다.",
    groupAria: "대화 저장 확인",
    confirmDetail: "{{total}}개 메시지를 오늘의 저널({{date}}, 로컬 전용)에 저장합니다.",
    confirm: "저장 확인",
    cancel: "취소",
    arm: "저널에 저장",
    saved: "{{total}}개 메시지를 오늘의 저널에 저장했습니다.",
    viewJournal: "저널 보기 →",
  },
  toast: {
    savedTitle: "저널에 저장되었습니다",
    savedDetail: "총 {{total}}개 메시지 (로컬 전용)",
  },
  entry: {
    header: "AI 어시스턴트에서 저장한 대화 (프로젝트: {{project}} · ID {{id}})",
    line: "[{{author}}] {{content}}",
    authorLabel: "사용자",
    unknownProject: "알 수 없는 프로젝트",
  },
  footer: {
    note: "AI는 현재 프로젝트 워크스페이스를 기반으로 답변합니다",
    openJournal: "저널",
  },
};

export default assistant;
