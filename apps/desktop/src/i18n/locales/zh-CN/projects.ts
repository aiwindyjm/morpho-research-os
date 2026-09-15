/**
 * zh-CN projects resources (ADR-023): the projects list/create/switch view.
 * Values are the exact strings the view rendered before i18n extraction,
 * byte-identical.
 */
const projects = {
  kicker: "我的研究",
  title: "所有研究项目",
  description: "每个主题都是一个独立的研究空间。你可以随时切换、继续或新建研究。",
  newResearch: "新建研究",
  empty: {
    title: "还没有研究项目",
    description: "创建第一个项目，把一个研究问题变成可持续生长的知识库。",
  },
  search: "搜索我的研究",
  count: "{{total}} 个项目",
  createCard: {
    title: "新建一个研究",
    hint: "从一个问题开始",
  },
  card: {
    openAria: "打开项目",
    statusDraft: "草稿",
    statusInProgress: "进行中",
    statusPaused: "已暂停",
    coverage: "{{percent}}% 覆盖",
    notStarted: "未开始",
    taskCount: "{{total}} 任务",
    updatedAt: "更新于 {{date}}",
    progressAria: "项目进度",
    enterWorkspace: "进入工作台",
    switchTo: "切换到此项目",
    configure: "研究配置",
  },
  dialog: {
    title: "新建研究项目",
    description: "每个项目拥有独立的配置、计划、任务、知识与助手上下文。",
    nameLabel: "项目名称",
    namePlaceholder: "例如：大语言模型推理优化",
    descriptionLabel: "项目描述",
    descriptionPlaceholder: "一句话说明这个项目要回答什么问题",
    cancel: "取消",
    create: "创建项目",
  },
  error: {
    nameRequired: "项目名称不能为空。",
    createFailed: "创建失败，请重试。",
  },
};

export default projects;
