/**
 * ko cards resources (ADR-023): Korean translation of the shared card
 * components. Glossary: 소스 / 클레임 / 증거 / 지식 노드; 평가 전 소스는
 * '평가 필요'.
 */
const cards = {
  tier: {
    pending: "평가 필요",
    high: "고품질",
    medium: "중간",
  },
  sourceRow: {
    openAria: "소스 열기",
  },
  quality: {
    rationale:
      "소스 품질: 권위성 {{authority}} · 적합도 {{fitness}} —— {{rationale}} (품질은 용도 적합성을 나타내며 내용의 진위를 의미하지 않음)",
    pending: "소스 품질이 아직 평가되지 않았습니다.",
  },
  knowledge: {
    sourceCount: "소스 {{total}}개",
    claimCount: "클레임 {{total}}개",
  },
  evidence: {
    none: "이 클레임에는 기록된 증거가 없습니다.",
    locator: "위치: {{kind}} · {{value}} · {{date}}에 수집",
    quote: "'{{quote}}'",
    directionSupport: "지지",
    directionContradict: "반박",
  },
  claim: {
    meta: "주체: {{subject}} · 신뢰도 {{confidence}} · 범위: {{scope}}",
    collapse: "증거 접기",
    expand: "증거 보기 ({{total}})",
  },
};

export default cards;
