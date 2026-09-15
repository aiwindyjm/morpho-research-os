/**
 * Deutsche Plan-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Plan, Aufgabe, Lauf, Prüfung, genehmigen/ablehnen).
 */
const plan = {
  kicker: "Forschungsplan / {{status}}",
  statusDraft: "Prüfung ausstehend",
  fallbackTitle: "Forschungsplan",
  noPlanDescription:
    "Der Planner erzeugt nur Planentwürfe zur Prüfung; ausführbare Aufgaben entstehen nach der Genehmigung.",
  regenerate: "Neu generieren",
  reject: "Plan ablehnen",
  approveAria: "Plan genehmigen",
  approve: "Bestätigen und starten",
  startRun: "Lauf starten",
  runStartedToast: {
    title: "Forschungslauf gestartet",
    detail: "Live-Fortschritt auf der Aufgaben-Seite verfolgen.",
  },
  runStartFailed: "Start des Laufs fehlgeschlagen.",
  regenerateApproved: "Plan neu generieren",
  generate: "Forschungsplan generieren",
  actionError: {
    title: "Aktion nicht abgeschlossen",
    fallback: "Die Aktion ist fehlgeschlagen. Bitte erneut versuchen.",
  },
  runAlert: {
    title: "Laufstatus: {{state}}",
    detail:
      "Der Plan befindet sich in Ausführung ({{total}} Aufgaben insgesamt); zum Anpassen des Plans Aufgaben auf der Aufgaben-Seite pausieren oder das Ende des Laufs abwarten.",
  },
  empty: {
    title: "Noch kein Forschungsplan",
    description:
      "Zuerst die Forschungskonfiguration abschließen, dann auf „Forschungsplan generieren“ klicken. Der Plan listet Such- und Extraktionsaufgaben je Dimension zur Prüfung auf.",
  },
  summary: {
    tasks: "Geplante Aufgaben",
    sources: "Quellen",
    dimensions: "Forschungsdimensionen",
    reviews: "Zu prüfen",
  },
  group: {
    expandAria: "Gruppe ausklappen",
    collapseAria: "Gruppe einklappen",
    taskCount: "{{total}} Aufgaben",
  },
  task: {
    edit: "Aufgabe bearbeiten",
  },
  locked: {
    title: "Plan gesperrt",
    detail:
      "Dieser Lauf wurde bereits erstellt, daher kann der Plan nicht mehr geändert werden; Aufgaben pausieren oder den Plan nach Abschluss des Laufs neu generieren.",
  },
  editDialog: {
    title: "Planaufgabe bearbeiten",
    description:
      "Nur Titel und Beschreibung sind bearbeitbar; Aufgabenart und Ausführungsreihenfolge legt der Orchestrator fest.",
    titleLabel: "Aufgabentitel",
    descriptionLabel: "Aufgabenbeschreibung",
    cancel: "Abbrechen",
    save: "Änderungen speichern",
    saveFailed: "Speichern der Änderungen fehlgeschlagen.",
  },
};

export default plan;
