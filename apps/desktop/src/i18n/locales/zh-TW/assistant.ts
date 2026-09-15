/**
 * zh-TW assistant resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the contextual AI assistant panel. Saving to
 * the journal is always an explicit two-step action; the copy keeps that
 * emphasis. Glossary: 對話日誌 / 論斷。
 */
const assistant = {
  aria: "AI 研究助理",
  kicker: "目前專案助理",
  closeAria: "關閉 AI 助理",
  context: {
    loading: "正在載入專案上下文…",
    usingBefore: "正在使用 ",
    usingAfter: " 的研究上下文",
  },
  navAria: "助理動作",
  error: {
    title: "操作未完成",
    fallback: "助理暫時無法使用，請重試。",
  },
  decision: {
    empty: "請先寫下要儲存的決定內容。",
    title: "記錄決定",
    hint: "決定只在本專案內儲存；點選「儲存決定」才會寫入。",
    inputAria: "決定內容",
    inputPlaceholder: "例如：下一輪優先補充量化方向的論文來源",
    save: "儲存決定",
    saved: "決定已儲存（明確儲存，共 {{total}} 條）。",
    listSummary: "已儲存的決定（{{total}}）",
  },
  journalSave: {
    title: "儲存對話到日誌",
    idle: "目前對話共 {{total}} 條訊息；只有你點選「確認儲存」才會寫入 本機對話日誌，不會自動儲存。",
    groupAria: "確認儲存對話",
    confirmDetail: "將把 {{total}} 條訊息儲存到今天的對話日誌（{{date}}，僅本機）。",
    confirm: "確認儲存",
    cancel: "取消",
    arm: "儲存到日誌",
    saved: "已儲存 {{total}} 條訊息到今天的對話日誌。",
    viewJournal: "檢視對話日誌 →",
  },
  toast: {
    savedTitle: "已儲存到對話日誌",
    savedDetail: "共 {{total}} 條訊息（僅本機）",
  },
  entry: {
    header: "從 AI 助理儲存的對話（專案：{{project}} · ID {{id}}）",
    line: "[{{author}}] {{content}}",
    authorLabel: "使用者",
    unknownProject: "未知專案",
  },
  footer: {
    note: "AI 會基於目前專案工作區回答",
    openJournal: "記錄對話",
  },
};

export default assistant;
