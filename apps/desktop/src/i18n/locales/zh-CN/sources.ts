/**
 * zh-CN sources resources (ADR-023): the sources library view. Values are
 * the exact strings the view rendered before i18n extraction, byte-identical.
 * The type-filter chips keep their own copy ("官方文档") — it differs from the
 * canonical vocab.sourceType label ("技术文档").
 */
const sources = {
  kicker: "来源库",
  title: "已发现的来源",
  description: "每个来源都会保留规范化地址、来源类型、质量信息和贡献的结论。",
  importLinks: "导入链接",
  desktopOnly: "桌面版提供",
  qualityToggle: "按质量筛选",
  empty: {
    title: "还没有来源",
    description: "批准研究计划并开始运行后，检索到的来源会出现在这里。",
  },
  summary: {
    all: "全部",
    high: "高质量",
    medium: "中等",
    pending: "待审核",
  },
  search: "搜索来源或关键词",
  searchPlaceholder: "搜索标题或地址…",
  filter: {
    all: "全部类型",
    paper: "论文",
    documentation: "官方文档",
  },
  count: "{{total}} 个来源",
  noMatch: "没有匹配的来源；试试更换关键词或清除筛选条件。",
};

export default sources;
