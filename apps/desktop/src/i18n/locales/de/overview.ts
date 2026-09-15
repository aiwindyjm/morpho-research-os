/**
 * Deutsche Overview-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Abdeckung, Dimension, Quelle, Wissensknoten, Aussage, Lücke, Lauf).
 */
const overview = {
  kicker: "Forschungsprojekt / {{status}}",
  notStarted: "Nicht begonnen",
  fallbackTitle: "Übersicht",
  editConfig: "Konfiguration bearbeiten",
  viewTasks: "Aufgaben ansehen →",
  planDraftTitle: "Plan zuerst auf der Forschungsplan-Seite genehmigen",
  continueResearch: "Forschung fortsetzen →",
  empty: {
    title: "Kein Projekt ausgewählt",
    description:
      "Zuerst in „Meine Forschung“ ein Forschungsprojekt auswählen oder erstellen; die Übersicht erscheint dann hier.",
    action: "Zu „Meine Forschung“",
  },
  metrics: {
    coverage: "Forschungsabdeckung",
    coverageMeta: "{{done}} / {{total}} Kerndimensionen abgeschlossen",
    sources: "Quellen",
    sourcesMeta: "{{total}} hochwertig",
    knowledge: "Wissensknoten",
    knowledgeMeta: "{{total}} Typen",
    reviews: "Zu prüfende Aussagen",
    reviewsMeta: "{{total}} widersprüchlich",
    coverageProgressAria: "Abdeckungsfortschritt",
  },
  path: {
    kicker: "Forschungsfortschritt",
    title: "Aktueller Forschungspfad",
    viewAll: "Alle ansehen →",
    empty:
      "Noch keine ausführbaren Aufgaben. Plan genehmigen und Lauf starten — dann erscheinen hier Aufgaben in Abhängigkeitsreihenfolge.",
    executing: "Wird ausgeführt",
    waitingPredecessor: "Wartet auf Vorgänger",
    progressAria: "Aufgabenfortschritt",
    stateDone: "Erledigt",
    stateReview: "Zu prüfen",
    stateWaiting: "Wartet",
  },
  activity: {
    kicker: "Forschungsaktivität",
    title: "Soeben",
    live: "Live",
    empty:
      "Noch keine Aktivität. Sobald ein Forschungslauf startet, erscheinen hier Quellen, Aussagen und Wissensknoten.",
  },
  dimensions: {
    kicker: "Abdeckung",
    title: "Forschungsdimensionen",
    viewKnowledge: "Wissen ansehen →",
    progressAria: "{{dimension}}: Abdeckungsfortschritt",
  },
  coverage: {
    why: "Warum dieser Wert?",
    taskCompletion: "Aufgabenabschluss {{score}} (Gewicht {{weight}}): {{done}}/{{total}} Aufgaben abgeschlossen",
    knowledgeBreadth: "Wissensbreite {{score}} (Gewicht {{weight}}): {{total}} Knoten",
    evidenceDensity: "Belegdichte {{score}} (Gewicht {{weight}}): {{total}} Belege",
    sourceDiversity:
      "Quellenvielfalt {{score}} (Gewicht {{weight}}): {{total}} unabhängige hochwertige Quellen",
  },
  next: {
    kicker: "Nächster Schritt",
    title: "Empfohlene nächste Forschung",
    triggerCoverage: "Geringe Abdeckung",
    triggerSources: "Zu wenige Quellen",
    createdTask: "Aufgabe „{{title}}“ erstellt.",
    createdTaskHint: "Die neue Aufgabe erscheint auf der Aufgaben-Seite; jederzeit pausieren oder erneut versuchen.",
    createTask: "Forschungsaufgabe erstellen →",
    dismissAria: "Diesen Vorschlag ignorieren",
    dismiss: "Ignorieren",
    empty: "Keine Lücken-Vorschläge — die Abdeckung ist gut.",
  },
};

export default overview;
