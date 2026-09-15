/**
 * ko journal resources (ADR-023): Korean translation of the private
 * conversation journal view. The journal is private local-only data
 * (never uploaded, never in Git). Glossary: 저널.
 */
const journal = {
  kicker: "비공개 작업 로그",
  title: "저널",
  description:
    "오늘의 아키텍처·제품 논의는 이 기기에만 남고 Git이나 리서치 Vault에는 들어가지 않습니다.",
  downloadJson: "JSON 다운로드",
  downloadMarkdown: "오늘의 Markdown 다운로드",
  count: "기록 {{total}}건",
  localOnly: "로컬 전용",
  authorUser: "사용자",
  listEmpty: "아직 기록이 없습니다. 오늘의 제품 결정, 질문, 다음 단계를 적어 보세요.",
  inputAria: "저널 내용",
  inputPlaceholder: "오늘의 제품 결정, 질문, 다음 단계를 기록…",
  errorEmpty: "먼저 기록할 내용을 입력하세요.",
  storageNote: "브라우저 로컬 저장소에 저장됨",
  save: "기록 저장",
  rules: {
    kicker: "저장 규칙",
    title: "당신만의 개발 기록",
    items: {
      byLocalDate: "로컬 날짜별로 그룹화",
      neverUploaded: "업로드하지 않고 Git에도 넣지 않음",
      explicitDownload: "필요할 때만 Markdown을 명시적으로 다운로드",
      privateFolder: "private/conversations/로 수동 이동 가능",
    },
  },
  limits: {
    title: "현재 제한 사항",
    detail:
      "웹 미리보기는 워크스페이스에 직접 쓸 수 없습니다. 데스크톱 빌드에서는 Rust Core가 매일 로컬 파일에 추가합니다.",
  },
};

export default journal;
