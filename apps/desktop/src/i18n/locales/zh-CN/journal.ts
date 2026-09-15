/**
 * zh-CN journal resources (ADR-023): the private conversation journal view.
 * Values are the exact strings the view rendered before i18n extraction,
 * byte-identical ("Morpho" as an entry author stays a constant in the
 * component — brand name).
 */
const journal = {
  kicker: "私有工作日志",
  title: "对话日志",
  description: "今天的架构和产品讨论只保存在本机，不会进入 Git 或研究 Vault。",
  downloadJson: "下载 JSON",
  downloadMarkdown: "下载今日 Markdown",
  count: "{{total}} 条记录",
  localOnly: "仅本机",
  authorUser: "用户",
  listEmpty: "还没有记录。写下今天的产品决定、问题或下一步。",
  inputAria: "日志内容",
  inputPlaceholder: "记录今天的产品决定、问题或下一步…",
  errorEmpty: "请先写下要记录的内容。",
  storageNote: "保存到浏览器本地存储",
  save: "保存记录",
  rules: {
    kicker: "保存规则",
    title: "只属于你的开发记录",
    items: {
      byLocalDate: "按本地日期分组",
      neverUploaded: "不上传、不进入 Git",
      explicitDownload: "需要时显式下载 Markdown",
      privateFolder: "可以手动放入 private/conversations/",
    },
  },
  limits: {
    title: "当前版本限制",
    detail: "Web 预览无法直接写入工作区。正式桌面版会由 Rust Core 按日追加本地文件。",
  },
};

export default journal;
