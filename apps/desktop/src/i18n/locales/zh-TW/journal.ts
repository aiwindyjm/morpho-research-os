/**
 * zh-TW journal resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the private conversation journal view.
 * The journal is private local-only data (never uploaded, never in Git).
 */
const journal = {
  kicker: "私有工作日誌",
  title: "對話日誌",
  description: "今天的架構和產品討論只保存在本機，不會進入 Git 或研究 Vault。",
  downloadJson: "下載 JSON",
  downloadMarkdown: "下載今日 Markdown",
  count: "{{total}} 筆紀錄",
  localOnly: "僅本機",
  authorUser: "使用者",
  listEmpty: "還沒有紀錄。寫下今天的產品決定、問題或下一步。",
  inputAria: "日誌內容",
  inputPlaceholder: "記錄今天的產品決定、問題或下一步…",
  errorEmpty: "請先寫下要記錄的內容。",
  storageNote: "儲存到瀏覽器本機儲存空間",
  save: "儲存紀錄",
  rules: {
    kicker: "儲存規則",
    title: "只屬於你的開發紀錄",
    items: {
      byLocalDate: "按本地日期分組",
      neverUploaded: "不上傳、不進入 Git",
      explicitDownload: "需要時明確下載 Markdown",
      privateFolder: "可以手動放入 private/conversations/",
    },
  },
  limits: {
    title: "目前版本限制",
    detail: "Web 預覽無法直接寫入工作區。正式桌面版會由 Rust Core 按日附加本機檔案。",
  },
};

export default journal;
