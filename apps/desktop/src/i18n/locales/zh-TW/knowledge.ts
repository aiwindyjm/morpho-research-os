/**
 * zh-TW knowledge resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the knowledge base view. Glossary: 知識節點 /
 * 論斷 / 證據 / Vault；標準化（normalization）、匯出（export）。
 */
const knowledge = {
  kicker: "知識庫",
  title: "已擷取的知識",
  description: "節點是實體和概念，論斷與證據單獨保存。",
  filterAria: "篩選類型",
  filterAll: "全部類型",
  exportVault: "匯出 Vault",
  exportTitle: "把知識、來源與論斷匯出為 Markdown Vault",
  toolbar: {
    sources: "來源 {{total}}",
    nodes: "知識節點 {{total}}",
    claims: "論斷 {{total}}",
  },
  empty: {
    title: "知識庫還是空的",
    description: "研究執行完成內容標準化後，實體、論斷與證據會出現在這裡。",
  },
  tabs: {
    label: "知識檢視",
    nodes: "知識節點",
    claims: "論斷與證據",
  },
  search: "搜尋知識節點",
  searchPlaceholder: "搜尋標題、摘要或別名…",
  nodeCount: "{{total}} 個節點",
  noMatch: "沒有符合的知識節點；試試更換關鍵字或清除過濾條件。",
  claimsIntro: "論斷（Claim）與知識節點相互獨立；相互矛盾的論斷共存，並各自保留證據。",
  unknownSubject: "未知主體",
  conflictBadge: "存在衝突：支持與反駁證據均已保留",
  evidenceLoading: "正在載入證據…",
  toast: {
    conflictTitle: "匯出完成，但有衝突需要人工處理",
    conflictDetail:
      "寫入 {{written}} 個檔案、無變更 {{unchanged}} 個；{{conflicts}} 個因本地修改被保留為合併提案（{{proposals}}）。匯出目錄：{{root}}",
    successTitle: "Vault 匯出完成",
    successDetail:
      "寫入 {{written}} 個檔案（來源 {{sources}}、論斷 {{claims}}、索引 {{maps}}），無變更 {{unchanged}} 個。匯出目錄：{{root}}",
    errorTitle: "Vault 匯出失敗",
    listSeparator: "、",
    moreSuffix: "…",
  },
};

export default knowledge;
