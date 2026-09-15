/**
 * zh-CN settings resources (ADR-023). Language option labels
 * ("简体中文"/"English") are locale-invariant self-names and stay in the
 * component, as do the config page's source-language checkboxes ("中文").
 * Values are the exact strings the page rendered before i18n extraction,
 * byte-identical.
 */
const settings = {
  language: {
    label: "语言",
    aria: "界面语言",
  },
  page: {
    kicker: "设置",
    title: "本地工作区设置",
    description: "保持最少配置，只设置研究真正需要的内容。",
  },
  theme: {
    title: "外观主题",
    description: "切换即时生效；皮肤偏好只保存在本机浏览器。",
    aria: "外观主题",
    swatchTitle: "背景 / 强调 / 次强调",
    "lamplit-study": { name: "深夜研究室", description: "石墨黄铜·安静书房" },
    "bio-luminal": { name: "生物荧光", description: "深海暗场·荧光青紫" },
  },
  core: {
    title: "桌面核心连接",
    descriptionChecking: "检测 Rust 研究核心的协议与版本兼容性。",
    descriptionOnline: "Rust 研究核心在线；协议版本如下。",
    checking: "检测中…",
    online: "在线",
    offline: "离线",
    unreachable: "无法连接桌面核心",
    retry: "重试连接",
    appVersion: "应用版本",
    ipcProtocol: "IPC 协议",
    workerProtocol: "Worker 协议",
    dbSchema: "数据库 Schema",
    transport: "传输通道",
    transportIpc: "桌面 IPC",
    transportMock: "网页预览（mock）",
  },
  providers: {
    title: "AI Provider 密钥",
    description: "为 OpenAI-compatible 或本地模型服务保存 API Key；密钥只进入系统钥匙串。",
    count: "{{total}} 个 Provider",
    empty: {
      title: "尚未配置 Provider",
      description: "在桌面版的应用配置文件中登记 Provider 后，可在此保存密钥。",
    },
    listAria: "Provider 密钥列表",
    keyConfigured: "密钥已配置",
    keyMissing: "未配置密钥",
    keyLabel: "{{provider}} API Key",
    keyPlaceholder: "输入 {{provider}} 的 API Key（存入系统钥匙串）",
    save: "保存密钥",
    keyHint: "密钥写入操作系统钥匙串（{{ref}}），仅保存引用；界面不会再次显示密钥值。",
    toastSaved: {
      title: "密钥已保存",
      detail: "「{{provider}}」的 API Key 已写入系统钥匙串。",
    },
    toastFailed: {
      title: "密钥保存失败",
    },
  },
  journal: {
    title: "私有对话日志",
    description: "日志默认只在本机保存，不参与研究任务。",
    enabled: "已启用",
    open: "打开日志 →",
  },
};

export default settings;
