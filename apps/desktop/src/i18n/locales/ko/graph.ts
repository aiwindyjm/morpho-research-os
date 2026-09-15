/**
 * ko graph resources (ADR-023): Korean translation of the knowledge graph
 * view. Glossary: 지식 그래프 / 노드 / 관계 / 차원 / 신뢰도 / 증거.
 */
const graph = {
  kicker: "지식 그래프",
  title: "리서치 관계 지도",
  description:
    "예쁜 그림에 만족하지 말고, 노드 관계에서 소스와 증거까지 거슬러 올라가 보세요.",
  showList: "목록 보기 (접근성)",
  showGraph: "그래프 보기",
  exportImage: "이미지 내보내기",
  desktopOnly: "데스크톱 빌드 전용",
  empty: {
    title: "그래프가 아직 비어 있습니다",
    description:
      "리서치 런의 정규화가 완료되면 개체와 관계가 2D 그래프로 투영됩니다.",
  },
  filter: {
    byType: "유형으로 필터링",
    typeAll: "전체 노드",
    typeConcept: "개념",
    typeTechnology: "기술",
    typeCompany: "기업",
    typePaper: "논문",
    cluster: "차원으로 클러스터링",
    clusterTitle: "리서치 차원별로 열 배치",
    search: "노드 검색",
    searchPlaceholder: "제목으로 검색…",
    byDimension: "차원으로 필터링",
    dimensionAll: "전체 차원",
    byConfidence: "신뢰 상태로 필터링",
    confidenceAll: "전체 신뢰도",
    byRelation: "관계 유형으로 필터링",
    relationAll: "전체 관계",
    yearFrom: "시작 연도",
    yearFromOption: "연도부터",
    yearTo: "종료 연도",
    yearToOption: "연도까지",
  },
  counts: "노드 {{nodes}} · 관계 {{relations}}",
  inspector: {
    aria: "그래프 인스펙터",
    placeholderList: "목록에서 노드를 선택하면 세부 정보가 표시됩니다.",
    placeholderGraph: "노드를 선택하면 세부 정보가 표시됩니다.",
    current: "현재 선택",
    closeAria: "세부 정보 닫기",
    noSummary: "아직 요약이 없습니다",
    sourceCount: "소스 수",
    relationCount: "연관 관계",
    relationsHeading: "관계 ({{total}})",
    openMarkdown: "Markdown으로 열기",
  },
  canvas: {
    aria: "지식 그래프 (2D 힘 기반 배치)",
    caption: "지식 노드 목록 (그래프 대체 보기)",
    nodeAria: "{{title}} ({{type}}, 신뢰도 {{confidence}})",
    edgeAria: "관계: {{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "노드",
    type: "유형",
    dimension: "차원",
    confidence: "신뢰도",
    year: "연도",
    sourcesClaims: "소스/클레임",
  },
};

export default graph;
