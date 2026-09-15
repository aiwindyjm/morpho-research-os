/**
 * zh-CN common resources (ADR-023). This locale is the reference: values are
 * the exact strings the UI rendered before i18n extraction, byte-identical.
 *
 * `vocab` carries the documented display vocabularies that used to live in
 * `types/labels.ts`. The labels module stays untouched because the mock
 * services compose fixture DATA from it (out of i18n scope); the UI layer
 * resolves the same strings through these keys instead
 * (t("common:vocab.<group>.<value>")).
 */
const common = {
  loading: "正在加载…",
  error: {
    title: "出错了",
    unknown: "发生未知错误，请重试。",
    retryableSuffix: "（可重试）",
    technicalDetail: "技术细节：{{detail}}",
    retry: "重试",
  },
  vocab: {
    taskState: {
      PENDING: "等待中",
      PLANNING: "规划中",
      RUNNING: "运行中",
      VALIDATING: "验证中",
      COMPLETED: "已完成",
      NEEDS_REVIEW: "需要审核",
      PAUSED: "已暂停",
      FAILED: "失败",
      CANCELLED: "已取消",
    },
    planStatus: {
      draft: "待审查",
      approved: "已批准",
      rejected: "已拒绝",
    },
    confidence: {
      confirmed: "已确认",
      high: "高置信",
      medium: "中等置信",
      low: "低置信",
      unverified: "未验证",
      conflicting: "存在冲突",
    },
    nodeType: {
      Concept: "概念",
      Person: "人物",
      Organization: "组织",
      Company: "公司",
      Paper: "论文",
      Book: "书籍",
      Experiment: "实验",
      Event: "事件",
      Technology: "技术",
      Product: "产品",
      Application: "应用",
      Policy: "政策",
      Dataset: "数据集",
      Controversy: "争议",
    },
    purpose: {
      learning: "学习",
      teaching: "教学",
      writing: "写作",
      research: "科研",
      industry: "行业分析",
      product: "产品调研",
      strategy: "战略",
      custom: "自定义",
    },
    dimension: {
      concepts: "核心概念",
      history: "发展历史",
      theory: "理论基础",
      technology: "技术方法",
      experiments: "实验研究",
      papers: "重要论文",
      people: "关键人物",
      organizations: "组织机构",
      companies: "公司",
      products: "产品",
      applications: "应用场景",
      industry: "产业格局",
      policy: "政策法规",
      market: "市场规模",
      investment: "投资动态",
      controversy: "争议观点",
      risk: "风险与伦理",
      recent_developments: "近期进展",
      future_trends: "未来趋势",
    },
    sourceType: {
      web_page: "网页",
      paper: "论文",
      documentation: "技术文档",
      book: "书籍",
      dataset: "数据集",
      video: "视频",
      repository: "代码仓库",
    },
    sourceStatus: {
      discovered: "已发现",
      evaluated: "已评估",
      fetched: "已获取",
      indexed: "已索引",
      rejected: "已排除",
    },
    taskKind: {
      search: "来源检索",
      source_evaluation: "来源评估",
      extraction: "内容提取",
      normalization: "知识归一化",
      validation: "验证审查",
      synthesis: "综合整理",
    },
    depth: {
      1: "1 · 入门了解",
      2: "2 · 体系理解",
      3: "3 · 结构化研究",
      4: "4 · 专业研究",
      5: "5 · 前沿追踪",
    },
    assistantAction: {
      explain_progress: "解释进度",
      suggest_next_task: "建议下一任务",
      list_pending_reviews: "查看待审核项",
      record_decision: "记录决定",
    },
  },
};

export default common;
