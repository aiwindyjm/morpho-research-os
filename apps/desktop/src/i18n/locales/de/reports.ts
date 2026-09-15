/**
 * Deutsche Reports-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Quelle, Wissensknoten, Aussage, Abdeckung, Lauf).
 */
const reports = {
  kicker: "Berichte",
  title: "Forschungs-Briefing des Projekts",
  description:
    "Eine einseitige Zusammenfassung aus Quellen, Wissen und Abdeckung des aktuellen Projekts; der vollständige Briefing-Export folgt später.",
  empty: {
    title: "Noch nichts zu berichten",
    description:
      "Sobald Forschungsläufe Quellen, Wissensknoten und Aussagen hervorbringen, wird das Projekt-Briefing hier zusammengefasst.",
  },
  metrics: {
    sources: "Quellen",
    knowledge: "Wissensknoten",
    claims: "Aussagen",
    coverage: "Forschungsabdeckung",
  },
  dimensions: {
    kicker: "Abdeckung",
    title: "Abdeckungstabelle der Dimensionen",
    caption: "Abdeckung und zentrale Inputs je Forschungsdimension",
    colDimension: "Dimension",
    colCoverage: "Abdeckung",
    colTasks: "Abgeschlossene Aufgaben",
    colNodes: "Wissensknoten",
    colQualitySources: "Hochwertige Quellen",
  },
  runs: {
    kicker: "Laufhistorie",
    title: "Aktuelle Forschungsläufe",
    empty: "Noch keine Forschungsläufe; sobald ein Lauf startet, erscheinen hier Ereignisse.",
  },
  export: {
    kicker: "Export",
    soon: "Demnächst verfügbar",
    title: "Bericht exportieren",
    description:
      "Forschungs-Briefing und Vault-Export folgen nach der Pipeline-Integration; diese Seite fasst die Daten vorläufig zusammen.",
  },
};

export default reports;
