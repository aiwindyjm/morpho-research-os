/**
 * ko sources resources (ADR-023): Korean translation of the sources library
 * view. Glossary: 소스 / 품질 / 클레임. 평가 전 소스는 '평가 필요'
 * (태스크·클레임의 '검토 필요'와 구분).
 */
const sources = {
  kicker: "소스 라이브러리",
  title: "발견된 소스",
  description:
    "모든 소스는 정규화된 주소, 유형, 품질 정보와 기여한 클레임을 함께 보존합니다.",
  importLinks: "링크 가져오기",
  desktopOnly: "데스크톱 빌드 전용",
  qualityToggle: "품질로 필터링",
  empty: {
    title: "아직 소스가 없습니다",
    description: "연구 플랜을 승인하고 런을 시작하면 발견된 소스가 여기에 표시됩니다.",
  },
  summary: {
    all: "전체",
    high: "고품질",
    medium: "중간",
    pending: "평가 필요",
  },
  search: "소스 또는 키워드 검색",
  searchPlaceholder: "제목이나 주소 검색…",
  filter: {
    all: "전체 유형",
    paper: "논문",
    documentation: "공식 문서",
  },
  count: "소스 {{total}}개",
  noMatch: "일치하는 소스가 없습니다. 키워드를 바꾸거나 필터를 지워 보세요.",
};

export default sources;
