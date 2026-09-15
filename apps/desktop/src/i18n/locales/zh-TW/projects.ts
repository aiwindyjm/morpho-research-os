/**
 * zh-TW projects resources (ADR-023): Traditional Chinese (Taiwan
 * conventions) translation of the projects list/create/switch view.
 * Glossary: 專案 / 研究設定 / 覆蓋度。
 */
const projects = {
  kicker: "我的研究",
  title: "所有研究專案",
  description: "每個主題都是一個獨立的研究空間。你可以隨時切換、繼續或新增研究。",
  newResearch: "新增研究",
  empty: {
    title: "還沒有研究專案",
    description: "建立第一個專案，把一個研究問題變成持續生長的知識庫。",
  },
  search: "搜尋我的研究",
  count: "{{total}} 個專案",
  createCard: {
    title: "新增一個研究",
    hint: "從一個問題開始",
  },
  card: {
    openAria: "開啟專案",
    statusDraft: "草稿",
    statusInProgress: "進行中",
    statusPaused: "已暫停",
    coverage: "覆蓋 {{percent}}%",
    notStarted: "未開始",
    taskCount: "{{total}} 個任務",
    updatedAt: "更新於 {{date}}",
    progressAria: "專案進度",
    enterWorkspace: "進入工作台",
    switchTo: "切換至此專案",
    configure: "研究設定",
  },
  dialog: {
    title: "新增研究專案",
    description: "每個專案擁有獨立的設定、計畫、任務、知識與助理上下文。",
    nameLabel: "專案名稱",
    namePlaceholder: "例如：大型語言模型推論最佳化",
    descriptionLabel: "專案描述",
    descriptionPlaceholder: "一句話說明這個專案要回答什麼問題",
    cancel: "取消",
    create: "建立專案",
  },
  error: {
    nameRequired: "專案名稱不能為空。",
    createFailed: "建立失敗，請重試。",
  },
};

export default projects;
