/**
 * ja settings resources (ADR-023): Japanese translation of the settings
 * page. Language option labels ("简体中文"/"English") are locale-invariant
 * self-names and stay in the component, as do the config page's
 * source-language checkboxes ("中文"). Glossary: API キー / キーチェーン /
 * 設定ファイル / 外観テーマ。
 */
const settings = {
  language: {
    label: "言語",
    aria: "表示言語",
    description: "表示言語は即座に切り替わり、設定はこのブラウザーにのみ保存されます。",
  },
  page: {
    kicker: "設定",
    title: "ローカルワークスペース設定",
    description: "設定は最小限に。研究に本当に必要な項目だけを設定します。",
  },
  theme: {
    title: "外観テーマ",
    description: "切り替えは即座に反映され、テーマの設定はこのブラウザーにのみ保存されます。",
    aria: "外観テーマ",
    swatchTitle: "背景 / アクセント / 副アクセント",
    "lamplit-study": { name: "深夜研究室", description: "黒鉛と真鍮 — 静かな書斎" },
    "bio-luminal": { name: "生物発光", description: "深海の暗闇 — シアンと紫の輝き" },
  },
  core: {
    title: "デスクトップコア接続",
    descriptionChecking: "Rust リサーチコアとのプロトコルおよびバージョン互換性を確認します。",
    descriptionOnline: "Rust リサーチコアはオンラインです。プロトコルバージョンは下記のとおり。",
    checking: "確認中…",
    online: "オンライン",
    offline: "オフライン",
    unreachable: "デスクトップコアに接続できません",
    retry: "接続を再試行",
    appVersion: "アプリバージョン",
    ipcProtocol: "IPC プロトコル",
    workerProtocol: "Worker プロトコル",
    dbSchema: "データベーススキーマ",
    transport: "トランスポート",
    transportIpc: "デスクトップ IPC",
    transportMock: "Web プレビュー（モック）",
  },
  providers: {
    title: "AI プロバイダーキー",
    description:
      "OpenAI 互換またはローカルモデルサービスの API キーを保存します。キーは OS のキーチェーンにのみ保存されます。",
    count: "プロバイダー {{total}} 件",
    empty: {
      title: "プロバイダーが未登録",
      description:
        "デスクトップアプリの設定ファイルにプロバイダーを登録すると、ここでキーを保存できます。",
    },
    listAria: "プロバイダーキー一覧",
    keyConfigured: "キー設定済み",
    keyMissing: "キー未設定",
    keyLabel: "{{provider}} の API キー",
    keyPlaceholder: "{{provider}} の API キーを入力（OS のキーチェーンに保存）",
    save: "キーを保存",
    keyHint:
      "キーは OS のキーチェーン（{{ref}}）に書き込まれ、参照のみが保存されます。UI がキーの値を再表示することはありません。",
    toastSaved: {
      title: "キーを保存しました",
      detail: "「{{provider}}」の API キーをキーチェーンに書き込みました。",
    },
    toastFailed: {
      title: "キーの保存に失敗しました",
    },
  },
  journal: {
    title: "プライベートジャーナル",
    description: "ジャーナルはローカルにのみ保存され、研究タスクには一切使われません。",
    enabled: "有効",
    open: "ジャーナルを開く →",
  },
};

export default settings;
