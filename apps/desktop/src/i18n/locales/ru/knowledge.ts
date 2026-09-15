/**
 * Russian knowledge resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure; glossary: узел знаний,
 * утверждение, свидетельство, Vault, источник).
 */
const knowledge = {
  kicker: "База знаний",
  title: "Извлечённые знания",
  description: "Узлы — это сущности и концепции; утверждения и свидетельства хранятся отдельно.",
  filterAria: "Фильтр по типу",
  filterAll: "Все типы",
  exportVault: "Экспортировать Vault",
  exportTitle: "Экспорт знаний, источников и утверждений в Markdown Vault",
  toolbar: {
    sources: "Источники {{total}}",
    nodes: "Узлы знаний {{total}}",
    claims: "Утверждения {{total}}",
  },
  empty: {
    title: "База знаний пока пуста",
    description:
      "Когда прогон завершит нормализацию, здесь появятся сущности, утверждения и свидетельства.",
  },
  tabs: {
    label: "Представления знаний",
    nodes: "Узлы знаний",
    claims: "Утверждения и свидетельства",
  },
  search: "Поиск узлов знаний",
  searchPlaceholder: "Поиск по названиям, сводкам или псевдонимам…",
  nodeCount: "Узлов: {{total}}",
  noMatch: "Подходящих узлов знаний нет; попробуйте другие ключевые слова или сбросьте фильтры.",
  claimsIntro:
    "Утверждения независимы от узлов знаний; противоречащие друг другу утверждения сосуществуют, и каждое сохраняет свои свидетельства.",
  unknownSubject: "Неизвестный субъект",
  conflictBadge: "Конфликт: сохранены и подтверждающие, и опровергающие свидетельства",
  evidenceLoading: "Загрузка свидетельств…",
  toast: {
    conflictTitle: "Экспорт завершён, но конфликты требуют ручной обработки",
    conflictDetail:
      "Записано файлов: {{written}}, без изменений: {{unchanged}}; {{conflicts}} файлов сохранены как предложения по слиянию из-за локальных изменений ({{proposals}}). Каталог экспорта: {{root}}",
    successTitle: "Экспорт Vault завершён",
    successDetail:
      "Записано файлов: {{written}} (источников {{sources}}, утверждений {{claims}}, карт {{maps}}), без изменений: {{unchanged}}. Каталог экспорта: {{root}}",
    errorTitle: "Сбой экспорта Vault",
    listSeparator: ", ",
    moreSuffix: "…",
  },
};

export default knowledge;
