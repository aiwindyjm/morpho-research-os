/**
 * Deutsche Shell-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch.
 * Markennamen („Morpho“, „KI“) bleiben unverändert.
 */
const shell = {
  // Navigationslabels der Arbeitsbereich-Ansicht (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "Meine Forschung",
    overview: "Übersicht",
    config: "Forschungskonfiguration",
    plan: "Forschungsplan",
    tasks: "Aufgaben",
    sources: "Quellen",
    knowledge: "Wissen",
    graph: "Graph",
    journal: "Journal",
    settings: "Einstellungen",
    reports: "Berichte",
  },

  // Topbar
  breadcrumb: "Pfadnavigation",
  noProjectSelected: "Kein Projekt ausgewählt",
  saved: "Gespeichert",
  helpUnavailable: "Die Hilfedokumentation ist im lokalen Build nicht verfügbar",
  help: "Hilfe",
  localUser: "Lokaler Nutzer",

  // Schnellmenüs der Topbar (I3): Sprache + Erscheinungsbild. Die Sprachoptionen
  // selbst sind gebietsschemaunabhängige Eigennamen aus `LANGUAGES`
  // (src/i18n); Designnamen laufen über t("settings:theme.<id>.name").
  languageMenu: "Oberflächensprache wechseln",
  languageList: "Oberflächensprache",
  skinMenu: "Erscheinungsbild wechseln",
  skinList: "Erscheinungsbild",

  // Seitenleiste
  primaryNav: "Hauptnavigation",
  localWorkspace: "Lokaler Arbeitsbereich",
  dataStaysLocal: "Daten werden auf diesem Gerät gespeichert",
  closeNavigation: "Navigation schließen",
  navigationMenu: "Navigationsmenü",

  // WorkspaceLayout + AssistantDock
  skipToContent: "Zum Hauptinhalt springen",
  mainViewAria: "Ansicht {{view}}",
  openNavigationMenu: "Navigationsmenü öffnen",
  menu: "Menü",
  openAssistant: "KI-Assistent öffnen",
  assistant: "KI-Assistent",
  closeAssistantPanel: "Assistentenbereich schließen",
  assistantPanelAria: "Morpho-KI-Assistent",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "Wird geladen…",
    noProjectSelected: "Kein Projekt ausgewählt",
    researchProject: "Forschungsprojekt",
    currentWorkspace: "Aktueller Arbeitsbereich",
    manageAll: "Alle verwalten",
    projectListAria: "Projektliste",
    emptyProjects: "Noch keine Projekte. Erstes Projekt erstellen.",
    newProject: "Neues Projekt",
    newProjectDialogTitle: "Neues Forschungsprojekt",
    newProjectDialogDescription:
      "Jedes Projekt hat eigene Konfiguration, Plan, Aufgaben, Wissen und Assistenten-Kontext.",
    nameLabel: "Projektname",
    namePlaceholder: "z. B. LLM-Inferenzoptimierung",
    descriptionLabel: "Beschreibung",
    descriptionPlaceholder:
      "In einem Satz: Welche Frage soll dieses Projekt beantworten?",
    cancel: "Abbrechen",
    create: "Projekt erstellen",
    nameRequired: "Der Projektname darf nicht leer sein.",
    createFailed: "Erstellung fehlgeschlagen. Bitte erneut versuchen.",
    status: {
      draft: "Entwurf · nicht begonnen",
      inProgress: "In Arbeit · {{percent}} %",
      paused: "Pausiert · {{percent}} %",
    },
  },
};

export default shell;
