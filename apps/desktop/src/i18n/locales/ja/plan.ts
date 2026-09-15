/**
 * ja plan resources (ADR-023): Japanese translation of the plan review
 * view. Glossary: プラン / タスク / ラン / レビュー / 承認・却下；
 * Planner・Orchestrator は原文のまま。プラン下書きは「レビュー待ち」。
 */
const plan = {
  kicker: "研究プラン / {{status}}",
  statusDraft: "レビュー待ち",
  fallbackTitle: "研究プラン",
  noPlanDescription: "Planner はレビュー待ちのプラン草案のみを生成します。承認後に実行可能なタスクが作成されます。",
  regenerate: "再生成",
  reject: "プランを却下",
  approveAria: "プランを承認",
  approve: "確認して開始",
  startRun: "ランを開始",
  runStartedToast: {
    title: "研究ランを開始しました",
    detail: "タスクページでリアルタイムの進捗を確認できます。",
  },
  runStartFailed: "ランの開始に失敗しました。",
  regenerateApproved: "プランを再生成",
  generate: "研究プランを生成",
  actionError: {
    title: "操作が完了しませんでした",
    fallback: "操作に失敗しました。もう一度お試しください。",
  },
  runAlert: {
    title: "ランの状態: {{state}}",
    detail:
      "プランは実行フェーズに入りました（全 {{total}} タスク）。プランを調整する場合は、タスクページでタスクを一時停止するか、このランの終了をお待ちください。",
  },
  empty: {
    title: "まだ研究プランがありません",
    description:
      "まず研究設定を完成させ、「研究プランを生成」をクリックしてください。プランにはディメンションごとの検索・抽出タスクが列挙され、レビューを待ちます。",
  },
  summary: {
    tasks: "予定タスク",
    sources: "ソース",
    dimensions: "研究ディメンション",
    reviews: "要レビュー",
  },
  group: {
    expandAria: "グループを展開",
    collapseAria: "グループを折りたたむ",
    taskCount: "タスク {{total}} 件",
  },
  task: {
    edit: "タスクを編集",
  },
  locked: {
    title: "プランはロック中",
    detail:
      "このランは作成済みのため、プランは変更できません。タスクを一時停止するか、ラン終了後にプランを再生成してください。",
  },
  editDialog: {
    title: "プランタスクを編集",
    description:
      "タイトルと説明のみ編集できます。タスクの種類と実行順序は Orchestrator が決定します。",
    titleLabel: "タスクのタイトル",
    descriptionLabel: "タスクの説明",
    cancel: "キャンセル",
    save: "変更を保存",
    saveFailed: "変更の保存に失敗しました。",
  },
};

export default plan;
