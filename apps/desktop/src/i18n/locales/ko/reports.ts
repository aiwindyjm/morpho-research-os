/**
 * ko reports resources (ADR-023): Korean translation of the read-only
 * project briefing view. Glossary: 소스 / 지식 노드 / 클레임 / 커버리지 /
 * 런.
 */
const reports = {
  kicker: "리포트",
  title: "프로젝트 리서치 브리핑",
  description:
    "현재 프로젝트의 소스·지식·커버리지로 만든 한 페이지 요약입니다. 전체 브리핑 내보내기는 추후 제공됩니다.",
  empty: {
    title: "아직 보고할 내용이 없습니다",
    description:
      "리서치 런이 소스·지식 노드·클레임을 만들어 내면 여기에 프로젝트 브리핑으로 요약됩니다.",
  },
  metrics: {
    sources: "소스",
    knowledge: "지식 노드",
    claims: "클레임",
    coverage: "리서치 커버리지",
  },
  dimensions: {
    kicker: "커버리지",
    title: "차원별 커버리지 표",
    caption: "리서치 차원별 커버리지와 핵심 입력",
    colDimension: "차원",
    colCoverage: "커버리지",
    colTasks: "완료된 태스크",
    colNodes: "지식 노드",
    colQualitySources: "고품질 소스",
  },
  runs: {
    kicker: "런 기록",
    title: "최근 리서치 런",
    empty: "아직 리서치 런이 없습니다. 런을 시작하면 이벤트가 여기에 표시됩니다.",
  },
  export: {
    kicker: "내보내기",
    soon: "곧 제공",
    title: "리포트 내보내기",
    description:
      "리서치 브리핑과 Vault 내보내기는 파이프라인 통합 후 제공될 예정입니다. 지금은 이 페이지가 데이터를 요약합니다.",
  },
};

export default reports;
