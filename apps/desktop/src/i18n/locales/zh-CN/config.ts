/**
 * zh-CN config resources (ADR-023): the research configuration form
 * (spec §6.2, incl. the PurposeSelect label from components/research.tsx).
 * Values are the exact strings the view rendered before i18n extraction,
 * byte-identical. Validation copy must stay exact — tests pin it.
 */
const config = {
  kicker: "研究配置",
  title: "定义你的研究问题",
  description: "这些信息会决定研究计划的范围、深度和来源选择。",
  cancel: "取消",
  discard: "放弃修改",
  save: "保存配置",
  saveError: {
    title: "无法保存",
    validation: "配置未通过校验：{{issue}}",
    failed: "保存失败，请稍后重试。",
  },
  noProject: {
    title: "请先选择或创建项目",
    description: "研究配置属于具体的项目；切换或新建项目后再来配置。",
  },
  section01: {
    title: "研究主题",
    help: "先明确你要理解的对象和最终用途。",
  },
  section02: {
    title: "研究范围",
    help: "范围越清晰，计划越容易执行和复核。",
  },
  section03: {
    title: "研究维度",
    help: "选择计划必须覆盖的角度，可在生成计划后继续调整。",
  },
  section04: {
    title: "来源偏好",
    help: "Morpho 会优先搜索这些来源，并保留每个结论的出处。",
  },
  field: {
    domain: "研究领域",
    domainPlaceholder: "例如：神经工程",
    topic: "研究主题",
    topicPlaceholder: "例如：脑机接口在运动康复中的应用",
    purpose: "研究目的",
    audience: "使用对象 / 受众",
    audiencePlaceholder: "例如：康复医学研究者",
    depth: "研究深度",
    timeRange: "时间范围",
    yearStart: "开始年份",
    yearStartPlaceholder: "如 2015",
    yearEnd: "结束年份",
    yearEndPlaceholder: "如 2026",
    yearTo: "至",
    languages: "语言",
    geographicScope: "地域范围",
    geographicScopePlaceholder: "例如：global",
  },
  dimensions: {
    custom: "自定义维度",
    customTitle: "桌面版提供",
  },
  sourcePref: {
    paper: "期刊、预印本与会议资料",
    documentation: "官方文档与机构指南",
    web_page: "行业报道与专业媒体",
    repository: "代码与开源实现",
    dataset: "公开数据与实验材料",
    book: "教材、专著与手册",
    video: "讲座与会议录像",
  },
  footer: "更新频率当前固定为手动（update_frequency: manual）；自动增量研究将在后续版本提供。",
};

export default config;
