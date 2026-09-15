/**
 * zh-CN graph resources (ADR-023): the knowledge graph view (filters,
 * canvas, accessible list fallback, inspector). Values are the exact strings
 * the view rendered before i18n extraction, byte-identical. The type-filter
 * chip for Company keeps its prototype copy "企业" (the canonical vocab
 * label is "公司").
 */
const graph = {
  kicker: "知识图谱",
  title: "研究关系地图",
  description: "从节点关系回到来源和证据，而不是只看一张漂亮的图。",
  showList: "列表视图（无障碍）",
  showGraph: "图形视图",
  exportImage: "导出图片",
  desktopOnly: "桌面版提供",
  empty: {
    title: "图谱还没有内容",
    description: "研究运行完成知识归一化后，实体与关系会投影成 2D 图谱。",
  },
  filter: {
    byType: "按类型过滤",
    typeAll: "全部节点",
    typeConcept: "概念",
    typeTechnology: "技术",
    typeCompany: "企业",
    typePaper: "论文",
    cluster: "按维度聚类",
    clusterTitle: "按研究维度分列布局",
    search: "搜索节点",
    searchPlaceholder: "按标题搜索…",
    byDimension: "按维度过滤",
    dimensionAll: "全部维度",
    byConfidence: "按置信状态过滤",
    confidenceAll: "全部置信",
    byRelation: "按关系类型过滤",
    relationAll: "全部关系",
    yearFrom: "起始年份",
    yearFromOption: "年份从",
    yearTo: "结束年份",
    yearToOption: "到",
  },
  counts: "{{nodes}} 节点 · {{relations}} 关系",
  inspector: {
    aria: "图谱检查器",
    placeholderList: "点击列表中的节点查看详情。",
    placeholderGraph: "点击节点查看详情。",
    current: "当前选择",
    closeAria: "关闭详情",
    noSummary: "暂无摘要",
    sourceCount: "来源数量",
    relationCount: "关联关系",
    relationsHeading: "关系（{{total}}）",
    openMarkdown: "打开 Markdown",
  },
  canvas: {
    aria: "知识图谱（2D 力导向布局）",
    caption: "知识节点列表（图谱替代视图）",
    nodeAria: "{{title}}（{{type}}，置信 {{confidence}}）",
    edgeAria: "关系：{{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "节点",
    type: "类型",
    dimension: "维度",
    confidence: "置信",
    year: "年份",
    sourcesClaims: "来源/论断",
  },
};

export default graph;
