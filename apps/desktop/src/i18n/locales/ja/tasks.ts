/**
 * ja tasks resources (ADR-023): Japanese translation of the tasks view.
 * Glossary: タスク / ラン / レビュー（タスク・クレームの「to review」は
 * 「要レビュー」に統一）。
 */
const tasks = {
  kicker: "リサーチタスク",
  title: "進行中のワーク",
  description: "タスクはいつでも一時停止・再試行でき、ソースと結果までさかのぼれます。",
  continueRun: "ランを続行",
  runStartedToast: {
    title: "研究ランを開始しました",
    detail: "タスクは依存順に実行されます。",
  },
  runBadge: "ランの状態: {{state}}",
  empty: {
    title: "まだタスクがありません",
    approved: "プランは承認済みです。右上の「ランを続行」をクリックしてタスクを作成しましょう。",
    draft: "まず研究プランページでプランをレビューして承認してください。承認後にタスクが作成されます。",
    generic: "まず研究プランページでプランを生成して承認してください。",
  },
  filterAria: "タスク状態で絞り込み",
  tabs: {
    all: "すべて",
    active: "実行中",
    review: "要レビュー",
    done: "完了",
  },
  lastUpdated: "最終更新 {{date}}",
  col: {
    task: "タスク",
    stage: "ステージ",
    status: "状態",
  },
  pill: {
    running: "実行中",
    needsReview: "要レビュー",
    completed: "完了",
  },
  action: {
    menuAria: "タスク操作",
    pause: "一時停止",
    resume: "再開",
    retry: "再試行",
    confirmContinue: "確認して続行",
    cancel: "キャンセル",
  },
};

export default tasks;
