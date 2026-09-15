/**
 * zh-TW settings resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the settings page. Language option labels
 * ("简体中文"/"English") are locale-invariant self-names and stay in the
 * component, as do the config page's source-language checkboxes ("中文").
 * Glossary: 金鑰 / 系統鑰匙圈 / 設定檔 / 佈景主題。
 */
const settings = {
  language: {
    label: "語言",
    aria: "介面語言",
    description: "介面語言即時切換；偏好只保存在本機瀏覽器。",
  },
  page: {
    kicker: "設定",
    title: "本機工作區設定",
    description: "保持最精簡的設定，只設定研究真正需要的內容。",
  },
  theme: {
    title: "外觀主題",
    description: "切換即時生效；佈景主題偏好只保存在本機瀏覽器。",
    aria: "外觀主題",
    swatchTitle: "背景 / 強調 / 次強調",
    "lamplit-study": { name: "深夜研究室", description: "石墨黃銅・安靜書房" },
    "bio-luminal": { name: "生物螢光", description: "深海暗場・螢光青紫" },
  },
  core: {
    title: "桌面核心連線",
    descriptionChecking: "檢查 Rust 研究核心的協定與版本相容性。",
    descriptionOnline: "Rust 研究核心線上；協定版本如下。",
    checking: "檢查中…",
    online: "線上",
    offline: "離線",
    unreachable: "無法連線桌面核心",
    retry: "重試連線",
    appVersion: "應用程式版本",
    ipcProtocol: "IPC 協定",
    workerProtocol: "Worker 協定",
    dbSchema: "資料庫 Schema",
    transport: "傳輸通道",
    transportIpc: "桌面 IPC",
    transportMock: "網頁預覽（mock）",
  },
  providers: {
    title: "AI Provider 金鑰",
    description: "為 OpenAI-compatible 或本地模型服務儲存 API Key；金鑰只會進入系統鑰匙圈。",
    count: "{{total}} 個 Provider",
    empty: {
      title: "尚未設定 Provider",
      description: "在桌面版的應用程式設定檔中登錄 Provider 後，即可在此儲存金鑰。",
    },
    listAria: "Provider 金鑰清單",
    keyConfigured: "金鑰已設定",
    keyMissing: "未設定金鑰",
    keyLabel: "{{provider}} API Key",
    keyPlaceholder: "輸入 {{provider}} 的 API Key（存入系統鑰匙圈）",
    save: "儲存金鑰",
    keyHint: "金鑰會寫入作業系統鑰匙圈（{{ref}}），僅儲存參照；介面不會再次顯示金鑰值。",
    toastSaved: {
      title: "金鑰已儲存",
      detail: "「{{provider}}」的 API Key 已寫入系統鑰匙圈。",
    },
    toastFailed: {
      title: "金鑰儲存失敗",
    },
  },
  journal: {
    title: "私有對話日誌",
    description: "日誌預設只保存在本機，不參與研究任務。",
    enabled: "已啟用",
    open: "開啟日誌 →",
  },
};

export default settings;
