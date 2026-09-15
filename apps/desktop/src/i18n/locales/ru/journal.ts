/**
 * Russian journal resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure). The journal is private
 * local-only data (never uploaded, never in Git).
 */
const journal = {
  kicker: "Личный журнал",
  title: "Журнал",
  description:
    "Сегодняшние обсуждения архитектуры и продукта остаются на этом компьютере — ни в Git, ни в исследовательском Vault.",
  downloadJson: "Скачать JSON",
  downloadMarkdown: "Скачать сегодняшний Markdown",
  count: "Записей: {{total}}",
  localOnly: "Только локально",
  authorUser: "Пользователь",
  listEmpty: "Записей пока нет. Запишите сегодняшние продуктовые решения, вопросы или следующие шаги.",
  inputAria: "Запись журнала",
  inputPlaceholder: "Запишите сегодняшние продуктовые решения, вопросы или следующие шаги…",
  errorEmpty: "Сначала напишите, что записать.",
  storageNote: "Сохранено в локальное хранилище браузера",
  save: "Сохранить запись",
  rules: {
    kicker: "Правила хранения",
    title: "Записи о разработке, принадлежащие только вам",
    items: {
      byLocalDate: "Группировка по локальной дате",
      neverUploaded: "Не загружаются в сеть и не попадают в Git",
      explicitDownload: "Явная выгрузка Markdown по запросу",
      privateFolder: "Можно вручную перенести в private/conversations/",
    },
  },
  limits: {
    title: "Текущие ограничения",
    detail:
      "Веб-предпросмотр не может писать в рабочую область напрямую. В настольной версии Rust Core ежедневно дополняет локальные файлы.",
  },
};

export default journal;
