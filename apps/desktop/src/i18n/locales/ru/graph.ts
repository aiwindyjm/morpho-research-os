/**
 * Russian graph resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: граф знаний, узел,
 * связь, измерение, достоверность, свидетельство).
 */
const graph = {
  kicker: "Граф знаний",
  title: "Карта связей исследования",
  description:
    "Двигайтесь от связей узлов к источникам и свидетельствам, а не просто любуйтесь красивой картинкой.",
  showList: "Вид списком (доступный)",
  showGraph: "Графический вид",
  exportImage: "Экспортировать изображение",
  desktopOnly: "Только в настольной версии",
  empty: {
    title: "Граф пока пуст",
    description:
      "Когда прогон завершит нормализацию, сущности и связи будут спроецированы в 2D-граф.",
  },
  filter: {
    byType: "Фильтр по типу",
    typeAll: "Все узлы",
    typeConcept: "Концепции",
    typeTechnology: "Технологии",
    typeCompany: "Компании",
    typePaper: "Статьи",
    cluster: "Группировать по измерениям",
    clusterTitle: "Раскладка колонками по измерениям исследования",
    search: "Поиск узлов",
    searchPlaceholder: "Поиск по названию…",
    byDimension: "Фильтр по измерению",
    dimensionAll: "Все измерения",
    byConfidence: "Фильтр по достоверности",
    confidenceAll: "Любая достоверность",
    byRelation: "Фильтр по типу связи",
    relationAll: "Все связи",
    yearFrom: "Начальный год",
    yearFromOption: "С года",
    yearTo: "Конечный год",
    yearToOption: "по",
  },
  counts: "Узлов: {{nodes}} · Связей: {{relations}}",
  inspector: {
    aria: "Инспектор графа",
    placeholderList: "Выберите узел в списке, чтобы увидеть подробности.",
    placeholderGraph: "Выберите узел, чтобы увидеть подробности.",
    current: "Текущий выбор",
    closeAria: "Закрыть подробности",
    noSummary: "Сводки пока нет",
    sourceCount: "Источники",
    relationCount: "Связи",
    relationsHeading: "Связи ({{total}})",
    openMarkdown: "Открыть в Markdown",
  },
  canvas: {
    aria: "Граф знаний (2D силовая раскладка)",
    caption: "Список узлов знаний (альтернативный вид графа)",
    nodeAria: "{{title}} ({{type}}, достоверность {{confidence}})",
    edgeAria: "Связь: {{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "Узел",
    type: "Тип",
    dimension: "Измерение",
    confidence: "Достоверность",
    year: "Год",
    sourcesClaims: "Источники/Утверждения",
  },
};

export default graph;
