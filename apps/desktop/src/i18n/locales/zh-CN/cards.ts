/**
 * zh-CN cards resources (ADR-023): the shared card components in
 * components/cards.tsx (ResearchStatusBadge, SourceCard, KnowledgeCard,
 * ClaimCard, EvidenceList). They are shared chrome consumed by several views
 * (sources, knowledge, plan, graph) and cannot know a consumer, so they own
 * a dedicated namespace. Vocabulary labels (task/plan/confidence states,
 * source types/statuses, node types, dimensions) resolve through
 * common:vocab.*. Values are byte-identical with the pre-i18n strings.
 */
const cards = {
  tier: {
    pending: "待审核",
    high: "高质量",
    medium: "中等",
  },
  sourceRow: {
    openAria: "打开来源",
  },
  quality: {
    rationale:
      "来源质量：权威性 {{authority}} · 适配度 {{fitness}} —— {{rationale}}（质量描述用途适配，不代表内容真伪）",
    pending: "来源质量待评估。",
  },
  knowledge: {
    sourceCount: "{{total}} 来源",
    claimCount: "{{total}} 结论",
  },
  evidence: {
    none: "该论断暂无证据记录。",
    locator: "定位：{{kind}} · {{value}} · 提取于 {{date}}",
    quote: "“{{quote}}”",
    directionSupport: "支持",
    directionContradict: "反驳",
  },
  claim: {
    meta: "主体：{{subject}} · 置信度 {{confidence}} · 范围：{{scope}}",
    collapse: "收起证据",
    expand: "查看证据（{{total}}）",
  },
};

export default cards;
