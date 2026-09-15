/**
 * zh-CN reports resources (ADR-023): the read-only project briefing view.
 * Values are the exact strings the view rendered before i18n extraction,
 * byte-identical.
 */
const reports = {
  kicker: "研究报告",
  title: "项目研究简报",
  description: "从当前项目的来源、知识与覆盖度生成一页汇总；正式简报导出即将提供。",
  empty: {
    title: "报告还没有内容",
    description: "研究运行产出来源、知识节点与论断后，这里会汇总成项目简报。",
  },
  metrics: {
    sources: "来源",
    knowledge: "知识节点",
    claims: "论断",
    coverage: "研究覆盖度",
  },
  dimensions: {
    kicker: "覆盖度",
    title: "维度覆盖表",
    caption: "各研究维度的覆盖率与关键输入",
    colDimension: "维度",
    colCoverage: "覆盖率",
    colTasks: "任务完成",
    colNodes: "知识节点",
    colQualitySources: "高质量来源",
  },
  runs: {
    kicker: "运行记录",
    title: "最近研究运行",
    empty: "还没有研究运行记录；开始运行后事件会出现在这里。",
  },
  export: {
    kicker: "导出",
    soon: "即将提供",
    title: "导出报告",
    description: "研究综合简报与 Vault 导出会在研究流程集成后提供；当前版本先在此汇总数据。",
  },
};

export default reports;
