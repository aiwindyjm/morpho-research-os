/**
 * Russian sources resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: источник, качество,
 * утверждение).
 */
const sources = {
  kicker: "Библиотека источников",
  title: "Найденные источники",
  description:
    "Для каждого источника сохраняются нормализованный адрес, тип, сведения о качестве и утверждения, к которым он относится.",
  importLinks: "Импортировать ссылки",
  desktopOnly: "Только в настольной версии",
  qualityToggle: "Фильтр по качеству",
  empty: {
    title: "Источников пока нет",
    description:
      "Утвердите план исследования и запустите прогон — найденные источники появятся здесь.",
  },
  summary: {
    all: "Все",
    high: "Высокое качество",
    medium: "Средние",
    pending: "Ожидают оценки",
  },
  search: "Поиск источников или ключевых слов",
  searchPlaceholder: "Поиск по названиям или адресам…",
  filter: {
    all: "Все типы",
    paper: "Статьи",
    documentation: "Официальная документация",
  },
  count: "Источников: {{total}}",
  noMatch: "Подходящих источников нет; попробуйте другие ключевые слова или сбросьте фильтры.",
};

export default sources;
