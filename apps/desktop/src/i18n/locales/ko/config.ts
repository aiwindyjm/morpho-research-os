/**
 * ko config resources (ADR-023): Korean translation of the research
 * configuration form. Glossary: 연구 설정 / 플랜 / 차원 / 소스 / 클레임.
 */
const config = {
  kicker: "연구 설정",
  title: "리서치 질문 정의하기",
  description: "이 정보들이 연구 플랜의 범위·깊이·소스 선택을 결정합니다.",
  cancel: "취소",
  discard: "변경 버리기",
  save: "설정 저장",
  saveError: {
    title: "저장할 수 없습니다",
    validation: "설정이 검증을 통과하지 못했습니다: {{issue}}",
    failed: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  },
  noProject: {
    title: "먼저 프로젝트를 선택하거나 만드세요",
    description:
      "연구 설정은 개별 프로젝트에 속합니다. 프로젝트로 전환하거나 새로 만든 뒤 설정하세요.",
  },
  section01: {
    title: "리서치 주제",
    help: "무엇을 이해하고 싶은지, 최종 용도가 무엇인지 먼저 명확히 하세요.",
  },
  section02: {
    title: "리서치 범위",
    help: "범위가 명확할수록 플랜을 실행하고 검토하기 쉬워집니다.",
  },
  section03: {
    title: "리서치 차원",
    help: "플랜이 반드시 다뤄야 할 관점을 선택하세요. 플랜 생성 후에도 조정할 수 있습니다.",
  },
  section04: {
    title: "소스 선호 설정",
    help: "Morpho는 이 소스들을 우선 검색하고 모든 클레임의 출처를 보존합니다.",
  },
  field: {
    domain: "연구 분야",
    domainPlaceholder: "예: 뉴럴 엔지니어링",
    topic: "리서치 주제",
    topicPlaceholder: "예: 운동 재활에서의 브레인-컴퓨터 인터페이스",
    purpose: "연구 목적",
    audience: "독자 / 사용자",
    audiencePlaceholder: "예: 재활의학 연구자",
    depth: "리서치 깊이",
    timeRange: "기간",
    yearStart: "시작 연도",
    yearStartPlaceholder: "예: 2015",
    yearEnd: "종료 연도",
    yearEndPlaceholder: "예: 2026",
    yearTo: "~",
    languages: "언어",
    geographicScope: "지역 범위",
    geographicScopePlaceholder: "예: 전 세계",
  },
  dimensions: {
    custom: "사용자 정의 차원",
    customTitle: "데스크톱 빌드 전용",
  },
  sourcePref: {
    paper: "저널, 프리프린트, 학회 자료",
    documentation: "공식 문서와 기관 가이드",
    web_page: "업계 보도와 전문 미디어",
    repository: "코드와 오픈소스 구현",
    dataset: "공개 데이터와 실험 자료",
    book: "교재, 전문서, 핸드북",
    video: "강연 및 학회 녹화",
  },
  footer:
    "현재 업데이트 주기는 수동(update_frequency: manual)으로 고정되어 있습니다. 자동 증분 리서치는 이후 버전에서 제공될 예정입니다.",
};

export default config;
