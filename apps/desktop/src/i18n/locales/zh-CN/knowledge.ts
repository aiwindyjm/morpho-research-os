/**
 * zh-CN knowledge resources (ADR-023): the knowledge base view (nodes +
 * claims/evidence tabs, Vault export). Values are the exact strings the view
 * rendered before i18n extraction, byte-identical.
 */
const knowledge = {
  kicker: "知识库",
  title: "已提取的知识",
  description: "节点是实体和概念，结论与证据单独保存。",
  filterAria: "筛选类型",
  filterAll: "全部类型",
  exportVault: "导出 Vault",
  exportTitle: "把知识、来源与论断导出为 Markdown Vault",
  toolbar: {
    sources: "来源 {{total}}",
    nodes: "知识节点 {{total}}",
    claims: "论断 {{total}}",
  },
  empty: {
    title: "知识库还是空的",
    description: "研究运行完成内容归一化后，实体、论断与证据会出现在这里。",
  },
  tabs: {
    label: "知识视图",
    nodes: "知识节点",
    claims: "论断与证据",
  },
  search: "搜索知识节点",
  searchPlaceholder: "搜索标题、摘要或别名…",
  nodeCount: "{{total}} 个节点",
  noMatch: "没有匹配的知识节点；试试更换关键词或清除过滤条件。",
  claimsIntro: "论断（Claim）与知识节点相互独立；相互矛盾的论断共存，并各自保留证据。",
  unknownSubject: "未知主体",
  conflictBadge: "存在冲突：支持与反驳证据均已保留",
  evidenceLoading: "正在加载证据…",
  toast: {
    conflictTitle: "导出完成，但有冲突需要人工处理",
    conflictDetail:
      "写入 {{written}} 篇、无变化 {{unchanged}} 篇；{{conflicts}} 篇因本地修改被保留为合并提案（{{proposals}}）。导出目录：{{root}}",
    successTitle: "Vault 导出完成",
    successDetail:
      "写入 {{written}} 篇（来源 {{sources}}、论断 {{claims}}、索引 {{maps}}），无变化 {{unchanged}} 篇。导出目录：{{root}}",
    errorTitle: "Vault 导出失败",
    listSeparator: "、",
    moreSuffix: "…",
  },
};

export default knowledge;
