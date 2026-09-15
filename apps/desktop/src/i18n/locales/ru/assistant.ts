/**
 * Russian assistant resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure). Saving to the journal is
 * always an explicit two-step action; the copy keeps that emphasis.
 */
const assistant = {
  aria: "ИИ-ассистент исследования",
  kicker: "Ассистент текущего проекта",
  closeAria: "Закрыть ИИ-ассистента",
  context: {
    loading: "Загрузка контекста проекта…",
    usingBefore: "Сейчас используется ",
    usingAfter: " как контекст исследования",
  },
  navAria: "Действия ассистента",
  error: {
    title: "Действие не выполнено",
    fallback: "Ассистент временно недоступен. Повторите попытку.",
  },
  decision: {
    empty: "Сначала напишите текст решения.",
    title: "Записать решение",
    hint: "Решения сохраняются только внутри этого проекта; пока вы не нажмёте «Сохранить решение», ничего не записывается.",
    inputAria: "Содержание решения",
    inputPlaceholder: "например: в следующем раунде отдать приоритет количественным статьям",
    save: "Сохранить решение",
    saved: "Решение сохранено (явное сохранение; всего {{total}}).",
    listSummary: "Сохранённые решения ({{total}})",
  },
  journalSave: {
    title: "Сохранить беседу в журнал",
    idle: "В этой беседе {{total}} сообщений; пока вы не нажмёте «Подтвердить сохранение», в локальный журнал не записывается ничего — автоматического сохранения нет.",
    groupAria: "Подтвердить сохранение беседы",
    confirmDetail:
      "{{total}} сообщений будут сохранены в сегодняшний журнал ({{date}}, только локально).",
    confirm: "Подтвердить сохранение",
    cancel: "Отмена",
    arm: "Сохранить в журнал",
    saved: "Сохранено {{total}} сообщений в сегодняшний журнал.",
    viewJournal: "Открыть журнал →",
  },
  toast: {
    savedTitle: "Сохранено в журнал",
    savedDetail: "Всего {{total}} сообщений (только локально)",
  },
  entry: {
    header: "Беседа, сохранённая из ИИ-ассистента (проект: {{project}} · ID {{id}})",
    line: "[{{author}}] {{content}}",
    authorLabel: "Пользователь",
    unknownProject: "Неизвестный проект",
  },
  footer: {
    note: "ИИ отвечает на основе рабочей области текущего проекта",
    openJournal: "Журнал",
  },
};

export default assistant;
