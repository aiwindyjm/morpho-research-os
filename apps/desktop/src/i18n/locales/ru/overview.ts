/**
 * Russian overview resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure; glossary: покрытие,
 * измерение, источник, узел знаний, утверждение, пробел, прогон).
 */
const overview = {
  kicker: "Исследовательский проект / {{status}}",
  notStarted: "Не начато",
  fallbackTitle: "Обзор",
  editConfig: "Изменить конфигурацию",
  viewTasks: "Открыть задачи →",
  planDraftTitle: "Сначала утвердите план на странице плана исследования",
  continueResearch: "Продолжить исследование →",
  empty: {
    title: "Проект не выбран",
    description:
      "Сначала выберите или создайте проект исследования в разделе „Мои исследования“ — его обзор появится здесь.",
    action: "Перейти к моим исследованиям",
  },
  metrics: {
    coverage: "Покрытие исследования",
    coverageMeta: "Выполнено ключевых измерений: {{done}} / {{total}}",
    sources: "Источники",
    sourcesMeta: "Высокое качество: {{total}}",
    knowledge: "Узлы знаний",
    knowledgeMeta: "Типов: {{total}}",
    reviews: "Утверждения на проверку",
    reviewsMeta: "С конфликтом: {{total}}",
    coverageProgressAria: "Прогресс покрытия",
  },
  path: {
    kicker: "Прогресс исследования",
    title: "Текущий путь исследования",
    viewAll: "Открыть всё →",
    empty:
      "Исполняемых задач пока нет; утвердите план и запустите прогон — задачи появятся здесь в порядке зависимостей.",
    executing: "Выполняется",
    waitingPredecessor: "Ожидает предшественников",
    progressAria: "Прогресс выполнения задач",
    stateDone: "Готово",
    stateReview: "Требует проверки",
    stateWaiting: "Ожидает",
  },
  activity: {
    kicker: "Активность исследования",
    title: "Только что",
    live: "В реальном времени",
    empty:
      "Событий пока нет; когда начнётся прогон, источники, утверждения и узлы знаний будут появляться здесь со временем.",
  },
  dimensions: {
    kicker: "Покрытие",
    title: "Измерения исследования",
    viewKnowledge: "Открыть знания →",
    progressAria: "Прогресс покрытия: {{dimension}}",
  },
  coverage: {
    why: "Почему такая оценка?",
    taskCompletion: "Завершение задач {{score}} (вес {{weight}}): выполнено {{done}}/{{total}}",
    knowledgeBreadth: "Широта знаний {{score}} (вес {{weight}}): узлов {{total}}",
    evidenceDensity: "Плотность свидетельств {{score}} (вес {{weight}}): свидетельств {{total}}",
    sourceDiversity:
      "Разнообразие источников {{score}} (вес {{weight}}): независимых качественных источников {{total}}",
  },
  next: {
    kicker: "Следующий шаг",
    title: "Рекомендуемое продолжение исследования",
    triggerCoverage: "Низкое покрытие",
    triggerSources: "Мало источников",
    createdTask: "Создана задача «{{title}}».",
    createdTaskHint: "Новая задача появится на странице задач; её можно в любой момент приостановить или повторить.",
    createTask: "Создать задачу исследования →",
    dismissAria: "Скрыть это предложение",
    dismiss: "Скрыть",
    empty: "Предложений по пробелам нет — покрытие в порядке.",
  },
};

export default overview;
