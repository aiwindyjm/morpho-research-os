/**
 * ko knowledge resources (ADR-023): Korean translation of the knowledge
 * base view. Glossary: 지식 노드 / 클레임 / 증거 / Vault.
 */
const knowledge = {
  kicker: "지식 베이스",
  title: "추출된 지식",
  description: "노드는 개체와 개념이며, 클레임과 증거는 별도로 저장됩니다.",
  filterAria: "유형으로 필터링",
  filterAll: "전체 유형",
  exportVault: "Vault 내보내기",
  exportTitle: "지식·소스·클레임을 Markdown Vault로 내보내기",
  toolbar: {
    sources: "소스 {{total}}",
    nodes: "지식 노드 {{total}}",
    claims: "클레임 {{total}}",
  },
  empty: {
    title: "지식 베이스가 아직 비어 있습니다",
    description:
      "리서치 런의 정규화가 완료되면 개체·클레임·증거가 여기에 표시됩니다.",
  },
  tabs: {
    label: "지식 보기",
    nodes: "지식 노드",
    claims: "클레임과 증거",
  },
  search: "지식 노드 검색",
  searchPlaceholder: "제목, 요약 또는 별칭 검색…",
  nodeCount: "노드 {{total}}개",
  noMatch: "일치하는 지식 노드가 없습니다. 키워드를 바꾸거나 필터를 지워 보세요.",
  claimsIntro:
    "클레임은 지식 노드와 독립적입니다. 서로 모순되는 클레임이 공존하며 각자의 증거를 보존합니다.",
  unknownSubject: "알 수 없는 주체",
  conflictBadge: "충돌 있음: 지지 및 반박 증거가 모두 보존되었습니다",
  evidenceLoading: "증거를 불러오는 중…",
  toast: {
    conflictTitle: "내보내기 완료, 충돌 항목은 수동 처리가 필요합니다",
    conflictDetail:
      "{{written}}개 파일을 기록하고 {{unchanged}}개는 변경 없음. {{conflicts}}개는 로컬 수정 때문에 병합 제안으로 보존되었습니다({{proposals}}). 내보내기 폴더: {{root}}",
    successTitle: "Vault 내보내기 완료",
    successDetail:
      "{{written}}개 파일 기록(소스 {{sources}}, 클레임 {{claims}}, 맵 {{maps}}), {{unchanged}}개는 변경 없음. 내보내기 폴더: {{root}}",
    errorTitle: "Vault 내보내기 실패",
    listSeparator: ", ",
    moreSuffix: "…",
  },
};

export default knowledge;
