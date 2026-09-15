/**
 * zh-CN assistant resources (ADR-023): the contextual AI assistant panel.
 * Values are the exact strings the panel rendered before i18n extraction,
 * byte-identical (including the single spaces JSX collapsed inside the
 * save-dialog copy). Action button labels come from common:vocab.assistantAction.
 */
const assistant = {
  aria: "AI 研究助手",
  kicker: "当前项目助手",
  closeAria: "关闭 AI 助手",
  context: {
    loading: "正在加载项目上下文…",
    usingBefore: "正在使用 ",
    usingAfter: " 的研究上下文",
  },
  navAria: "助手动作",
  error: {
    title: "操作未完成",
    fallback: "助手暂时不可用，请重试。",
  },
  decision: {
    empty: "请先写下要保存的决定内容。",
    title: "记录决定",
    hint: "决定只在本项目内保存；点击「保存决定」才会写入。",
    inputAria: "决定内容",
    inputPlaceholder: "例如：下一轮优先补充量化方向的论文来源",
    save: "保存决定",
    saved: "决定已保存（显式保存，共 {{total}} 条）。",
    listSummary: "已保存的决定（{{total}}）",
  },
  journalSave: {
    title: "保存对话到日志",
    idle: "当前对话共 {{total}} 条消息；只有你点击「确认保存」才会写入 本机对话日志，不会自动保存。",
    groupAria: "确认保存对话",
    confirmDetail: "将把 {{total}} 条消息保存到今天的对话日志（{{date}}，仅本机）。",
    confirm: "确认保存",
    cancel: "取消",
    arm: "保存到日志",
    saved: "已保存 {{total}} 条消息到今天的对话日志。",
    viewJournal: "查看对话日志 →",
  },
  toast: {
    savedTitle: "已保存到对话日志",
    savedDetail: "共 {{total}} 条消息（仅本机）",
  },
  entry: {
    header: "从 AI 助手保存的对话（项目：{{project}} · ID {{id}}）",
    line: "[{{author}}] {{content}}",
    authorLabel: "用户",
    unknownProject: "未知项目",
  },
  footer: {
    note: "AI 会基于当前项目工作区回答",
    openJournal: "记录对话",
  },
};

export default assistant;
