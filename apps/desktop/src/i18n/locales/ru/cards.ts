/**
 * Russian cards resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: источник, утверждение,
 * свидетельство, узел знаний).
 */
const cards = {
  tier: {
    pending: "Ожидает оценки",
    high: "Высокое качество",
    medium: "Среднее",
  },
  sourceRow: {
    openAria: "Открыть источник",
  },
  quality: {
    rationale:
      "Качество источника: авторитетность {{authority}} · соответствие {{fitness}} — {{rationale}} (качество описывает пригодность для цели, а не фактическую истинность)",
    pending: "Качество источника ещё не оценено.",
  },
  knowledge: {
    sourceCount: "Источников: {{total}}",
    claimCount: "Утверждений: {{total}}",
  },
  evidence: {
    none: "Для этого утверждения свидетельств не записано.",
    locator: "Локатор: {{kind}} · {{value}} · получено {{date}}",
    quote: "«{{quote}}»",
    directionSupport: "Подтверждает",
    directionContradict: "Опровергает",
  },
  claim: {
    meta: "Субъект: {{subject}} · достоверность {{confidence}} · охват: {{scope}}",
    collapse: "Скрыть свидетельства",
    expand: "Показать свидетельства ({{total}})",
  },
};

export default cards;
