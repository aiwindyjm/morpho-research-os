/**
 * Deutsche Tasks-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Aufgabe, Lauf, pausieren/fortsetzen/wiederholen/abbrechen).
 */
const tasks = {
  kicker: "Forschungsaufgaben",
  title: "Laufende Arbeiten",
  description: "Jede Aufgabe lässt sich pausieren, erneut versuchen und bis zu ihren Quellen und Ergebnissen zurückverfolgen.",
  continueRun: "Lauf fortsetzen",
  runStartedToast: {
    title: "Forschungslauf gestartet",
    detail: "Aufgaben werden in Abhängigkeitsreihenfolge ausgeführt.",
  },
  runBadge: "Laufstatus: {{state}}",
  empty: {
    title: "Noch keine Aufgaben",
    approved: "Der Plan ist genehmigt — oben rechts auf „Lauf fortsetzen“ klicken, um Aufgaben zu erstellen.",
    draft: "Zuerst den Plan auf der Forschungsplan-Seite prüfen und genehmigen; Aufgaben entstehen nach der Genehmigung.",
    generic: "Zuerst auf der Forschungsplan-Seite einen Plan generieren und genehmigen.",
  },
  filterAria: "Nach Aufgabenstatus filtern",
  tabs: {
    all: "Alle",
    active: "Aktiv",
    review: "Zu prüfen",
    done: "Abgeschlossen",
  },
  lastUpdated: "Zuletzt aktualisiert {{date}}",
  col: {
    task: "Aufgabe",
    stage: "Phase",
    status: "Status",
  },
  pill: {
    running: "Läuft",
    needsReview: "Zu prüfen",
    completed: "Abgeschlossen",
  },
  action: {
    menuAria: "Aufgabenaktionen",
    pause: "Pausieren",
    resume: "Fortsetzen",
    retry: "Erneut versuchen",
    confirmContinue: "Bestätigen und fortsetzen",
    cancel: "Abbrechen",
  },
};

export default tasks;
