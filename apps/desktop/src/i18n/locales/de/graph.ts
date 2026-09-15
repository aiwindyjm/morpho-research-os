/**
 * Deutsche Graph-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Wissensgraph, Knoten, Beziehung, Dimension, Konfidenz, Beleg).
 */
const graph = {
  kicker: "Wissensgraph",
  title: "Karte der Forschungsbeziehungen",
  description:
    "Knotenbeziehungen bis zu Quellen und Belegen zurückverfolgen, statt ein hübsches Bild zu bewundern.",
  showList: "Listenansicht (barrierefrei)",
  showGraph: "Graphansicht",
  exportImage: "Bild exportieren",
  desktopOnly: "Nur im Desktop-Build",
  empty: {
    title: "Der Graph ist noch leer",
    description:
      "Sobald ein Forschungslauf die Normalisierung abgeschlossen hat, werden Entitäten und Beziehungen in einen 2D-Graphen projiziert.",
  },
  filter: {
    byType: "Nach Typ filtern",
    typeAll: "Alle Knoten",
    typeConcept: "Konzepte",
    typeTechnology: "Technologie",
    typeCompany: "Unternehmen",
    typePaper: "Paper",
    cluster: "Nach Dimension gruppieren",
    clusterTitle: "Spalten je Forschungsdimension anordnen",
    search: "Knoten durchsuchen",
    searchPlaceholder: "Nach Titel suchen…",
    byDimension: "Nach Dimension filtern",
    dimensionAll: "Alle Dimensionen",
    byConfidence: "Nach Konfidenz filtern",
    confidenceAll: "Alle Konfidenzen",
    byRelation: "Nach Beziehungstyp filtern",
    relationAll: "Alle Beziehungen",
    yearFrom: "Startjahr",
    yearFromOption: "Ab Jahr",
    yearTo: "Endjahr",
    yearToOption: "bis",
  },
  counts: "{{nodes}} Knoten · {{relations}} Beziehungen",
  inspector: {
    aria: "Graph-Inspektor",
    placeholderList: "Knoten in der Liste auswählen, um Details zu sehen.",
    placeholderGraph: "Knoten auswählen, um Details zu sehen.",
    current: "Aktuelle Auswahl",
    closeAria: "Details schließen",
    noSummary: "Noch keine Zusammenfassung",
    sourceCount: "Quellen",
    relationCount: "Beziehungen",
    relationsHeading: "Beziehungen ({{total}})",
    openMarkdown: "In Markdown öffnen",
  },
  canvas: {
    aria: "Wissensgraph (kraftbasiertes 2D-Layout)",
    caption: "Wissensknotenliste (alternative Graphansicht)",
    nodeAria: "{{title}} ({{type}}, Konfidenz {{confidence}})",
    edgeAria: "Beziehung: {{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "Knoten",
    type: "Typ",
    dimension: "Dimension",
    confidence: "Konfidenz",
    year: "Jahr",
    sourcesClaims: "Quellen/Aussagen",
  },
};

export default graph;
