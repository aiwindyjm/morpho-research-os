/**
 * Russian projects resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure; glossary: проект, план,
 * задача, источник, знания, покрытие).
 */
const projects = {
  kicker: "Мои исследования",
  title: "Все исследовательские проекты",
  description:
    "Каждая тема — отдельное исследовательское пространство. Переключайтесь, продолжайте или начинайте новое исследование в любой момент.",
  newResearch: "Новое исследование",
  empty: {
    title: "Исследовательских проектов пока нет",
    description:
      "Создайте первый проект и превратите исследовательский вопрос в базу знаний, которая постоянно растёт.",
  },
  search: "Поиск по моим исследованиям",
  count: "Проектов: {{total}}",
  createCard: {
    title: "Начать новое исследование",
    hint: "Начните с вопроса",
  },
  card: {
    openAria: "Открыть проект",
    statusDraft: "Черновик",
    statusInProgress: "В работе",
    statusPaused: "Приостановлен",
    coverage: "Покрытие {{percent}}%",
    notStarted: "Не начато",
    taskCount: "Задач: {{total}}",
    updatedAt: "Обновлено {{date}}",
    progressAria: "Прогресс проекта",
    enterWorkspace: "Открыть рабочую область",
    switchTo: "Переключиться на этот проект",
    configure: "Конфигурация исследования",
  },
  dialog: {
    title: "Новый исследовательский проект",
    description:
      "У каждого проекта своя конфигурация, план, задачи, знания и контекст ассистента.",
    nameLabel: "Название проекта",
    namePlaceholder: "например: оптимизация инференса LLM",
    descriptionLabel: "Описание",
    descriptionPlaceholder:
      "Одним предложением: на какой вопрос должен ответить этот проект?",
    cancel: "Отмена",
    create: "Создать проект",
  },
  error: {
    nameRequired: "Название проекта не может быть пустым.",
    createFailed: "Не удалось создать. Повторите попытку.",
  },
};

export default projects;
