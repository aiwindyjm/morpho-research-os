/**
 * zh-CN common resources (ADR-023). This locale is the reference: values are
 * the exact strings the UI rendered before i18n extraction, byte-identical.
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
};

export default common;
