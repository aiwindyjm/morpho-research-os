/**
 * ja assistant resources (ADR-023): Japanese translation of the contextual
 * AI assistant panel. Saving to the journal is always an explicit two-step
 * action; the copy keeps that emphasis. Glossary: ジャーナル / クレーム。
 */
const assistant = {
  aria: "AI リサーチアシスタント",
  kicker: "現在のプロジェクトのアシスタント",
  closeAria: "AI アシスタントを閉じる",
  context: {
    loading: "プロジェクトコンテキストを読み込み中…",
    usingBefore: "現在 ",
    usingAfter: " を研究コンテキストとして使用中",
  },
  navAria: "アシスタントのアクション",
  error: {
    title: "操作が完了しませんでした",
    fallback: "アシスタントは一時的に利用できません。もう一度お試しください。",
  },
  decision: {
    empty: "まず保存する決定内容を入力してください。",
    title: "決定を記録",
    hint: "決定はこのプロジェクト内にのみ保存されます。「決定を保存」をクリックするまで書き込まれません。",
    inputAria: "決定の内容",
    inputPlaceholder: "例: 次のラウンドは定量系の論文ソースを優先",
    save: "決定を保存",
    saved: "決定を保存しました（明示的な保存、全 {{total}} 件）。",
    listSummary: "保存済みの決定（{{total}}）",
  },
  journalSave: {
    title: "会話をジャーナルに保存",
    idle:
      "現在の会話は {{total}} 件のメッセージです。「保存を確認」をクリックするまでローカルジャーナルには書き込まれず、自動保存もされません。",
    groupAria: "会話の保存を確認",
    confirmDetail:
      "{{total}} 件のメッセージを今日のジャーナル（{{date}}、ローカルのみ）に保存します。",
    confirm: "保存を確認",
    cancel: "キャンセル",
    arm: "ジャーナルに保存",
    saved: "{{total}} 件のメッセージを今日のジャーナルに保存しました。",
    viewJournal: "ジャーナルを見る →",
  },
  toast: {
    savedTitle: "ジャーナルに保存しました",
    savedDetail: "全 {{total}} 件のメッセージ（ローカルのみ）",
  },
  entry: {
    header: "AI アシスタントから保存した会話（プロジェクト: {{project}} · ID {{id}}）",
    line: "[{{author}}] {{content}}",
    authorLabel: "ユーザー",
    unknownProject: "不明なプロジェクト",
  },
  footer: {
    note: "AI は現在のプロジェクトワークスペースに基づいて回答します",
    openJournal: "ジャーナル",
  },
};

export default assistant;
