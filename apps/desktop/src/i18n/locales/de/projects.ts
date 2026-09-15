/**
 * Deutsche Projects-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Projekt, Plan, Aufgabe, Quelle, Wissen, Abdeckung).
 */
const projects = {
  kicker: "Meine Forschung",
  title: "Alle Forschungsprojekte",
  description:
    "Jedes Thema ist ein eigener Forschungsraum. Wechseln, fortsetzen oder neue Forschung starten — jederzeit.",
  newResearch: "Neue Forschung",
  empty: {
    title: "Noch keine Forschungsprojekte",
    description:
      "Erstes Projekt erstellen und eine Forschungsfrage in eine stetig wachsende Wissensbasis verwandeln.",
  },
  search: "Meine Forschung durchsuchen",
  count: "{{total}} Projekte",
  createCard: {
    title: "Neue Forschung starten",
    hint: "Mit einer Frage beginnen",
  },
  card: {
    openAria: "Projekt öffnen",
    statusDraft: "Entwurf",
    statusInProgress: "In Arbeit",
    statusPaused: "Pausiert",
    coverage: "{{percent}} % Abdeckung",
    notStarted: "Nicht begonnen",
    taskCount: "{{total}} Aufgaben",
    updatedAt: "Aktualisiert {{date}}",
    progressAria: "Projektfortschritt",
    enterWorkspace: "Arbeitsbereich öffnen",
    switchTo: "Zu diesem Projekt wechseln",
    configure: "Forschungskonfiguration",
  },
  dialog: {
    title: "Neues Forschungsprojekt",
    description:
      "Jedes Projekt hat eigene Konfiguration, Plan, Aufgaben, Wissen und Assistenten-Kontext.",
    nameLabel: "Projektname",
    namePlaceholder: "z. B. LLM-Inferenzoptimierung",
    descriptionLabel: "Beschreibung",
    descriptionPlaceholder:
      "In einem Satz: Welche Frage soll dieses Projekt beantworten?",
    cancel: "Abbrechen",
    create: "Projekt erstellen",
  },
  error: {
    nameRequired: "Der Projektname darf nicht leer sein.",
    createFailed: "Erstellung fehlgeschlagen. Bitte erneut versuchen.",
  },
};

export default projects;
