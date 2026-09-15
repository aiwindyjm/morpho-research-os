/**
 * English settings resources (ADR-023). Authored translations of the zh-CN
 * reference strings — concise product UI English. Language option labels
 * ("简体中文"/"English") are locale-invariant self-names and stay in the
 * component, as do the config page's source-language checkboxes ("中文").
 * Theme names/descriptions are the product's skin brand copy.
 */
const settings = {
  language: {
    label: "Language",
    aria: "Interface language",
    description:
      "The interface language applies instantly; the preference is stored only in this browser.",
  },
  page: {
    kicker: "Settings",
    title: "Local workspace settings",
    description: "Keep configuration minimal — set only what research truly needs.",
  },
  theme: {
    title: "Appearance theme",
    description:
      "Switches apply instantly; the skin preference is stored only in this browser.",
    aria: "Appearance theme",
    swatchTitle: "Background / accent / secondary accent",
    "lamplit-study": { name: "Lamplit Study", description: "Graphite & brass — a quiet study" },
    "bio-luminal": { name: "Bio-luminal", description: "Deep-sea dark field — cyan & violet glow" },
  },
  core: {
    title: "Desktop core connection",
    descriptionChecking:
      "Checks protocol and version compatibility with the Rust research core.",
    descriptionOnline: "The Rust research core is online; protocol versions below.",
    checking: "Checking…",
    online: "Online",
    offline: "Offline",
    unreachable: "Cannot reach the desktop core",
    retry: "Retry connection",
    appVersion: "App version",
    ipcProtocol: "IPC protocol",
    workerProtocol: "Worker protocol",
    dbSchema: "Database schema",
    transport: "Transport",
    transportIpc: "Desktop IPC",
    transportMock: "Web preview (mock)",
  },
  providers: {
    title: "AI provider keys",
    description:
      "Save API keys for OpenAI-compatible or local model services; keys only ever enter the system keychain.",
    count: "{{total}} providers",
    empty: {
      title: "No providers configured",
      description:
        "Register providers in the desktop app's configuration file, then save their keys here.",
    },
    listAria: "Provider key list",
    keyConfigured: "Key configured",
    keyMissing: "No key configured",
    keyLabel: "{{provider}} API key",
    keyPlaceholder: "Enter the API key for {{provider}} (stored in the system keychain)",
    save: "Save key",
    keyHint:
      "The key is written to the operating system keychain ({{ref}}); only the reference is stored, and the UI never shows the value again.",
    toastSaved: {
      title: "Key saved",
      detail: "The API key for “{{provider}}” has been written to the system keychain.",
    },
    toastFailed: {
      title: "Saving the key failed",
    },
  },
  journal: {
    title: "Private journal",
    description: "The journal is stored locally only and never participates in research tasks.",
    enabled: "Enabled",
    open: "Open journal →",
  },
};

export default settings;
