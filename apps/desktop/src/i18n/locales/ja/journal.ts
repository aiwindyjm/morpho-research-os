/**
 * ja journal resources (ADR-023): Japanese translation of the private
 * conversation journal view. The journal is private local-only data
 * (never uploaded, never in Git). Glossary: ジャーナル。
 */
const journal = {
  kicker: "プライベート作業ログ",
  title: "ジャーナル",
  description:
    "今日のアーキテクチャとプロダクトに関する議論はこのマシンにとどまり、Git や研究 Vault には入りません。",
  downloadJson: "JSON をダウンロード",
  downloadMarkdown: "今日の Markdown をダウンロード",
  count: "{{total}} 件の記録",
  localOnly: "ローカルのみ",
  authorUser: "ユーザー",
  listEmpty: "まだ記録がありません。今日のプロダクトの決定・疑問・次のステップを書き留めましょう。",
  inputAria: "ジャーナルの内容",
  inputPlaceholder: "今日のプロダクトの決定・疑問・次のステップを記録…",
  errorEmpty: "まず記録する内容を入力してください。",
  storageNote: "ブラウザーのローカルストレージに保存",
  save: "記録を保存",
  rules: {
    kicker: "保存ルール",
    title: "あなただけの開発記録",
    items: {
      byLocalDate: "ローカル日付でグループ化",
      neverUploaded: "アップロードせず、Git にも入れない",
      explicitDownload: "必要なときだけ Markdown を明示的にダウンロード",
      privateFolder: "private/conversations/ に手動で移動できる",
    },
  },
  limits: {
    title: "現在の制限事項",
    detail:
      "Web プレビューはワークスペースに直接書き込めません。デスクトップ版では Rust Core が日次でローカルファイルに追記します。",
  },
};

export default journal;
