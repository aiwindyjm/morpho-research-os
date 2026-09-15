/**
 * Ressources shell françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise. Les noms de
 * marque (« Morpho », « IA ») restent inchangés.
 */
const shell = {
  // Libellés de navigation de la vue espace de travail (workspaceStore
  // WORKSPACE_VIEWS).
  nav: {
    projects: "Ma recherche",
    overview: "Vue d'ensemble",
    config: "Configuration de recherche",
    plan: "Plan de recherche",
    tasks: "Tâches",
    sources: "Sources",
    knowledge: "Connaissances",
    graph: "Graphe",
    journal: "Journal",
    settings: "Paramètres",
    reports: "Rapports",
  },

  // Barre supérieure
  breadcrumb: "Fil d'Ariane",
  noProjectSelected: "Aucun projet sélectionné",
  saved: "Enregistré",
  helpUnavailable: "La documentation d'aide n'est pas disponible dans la version locale",
  help: "Aide",
  localUser: "Utilisateur local",

  // Menus rapides de la barre supérieure (I3) : langue + apparence. Les
  // options de langue sont les noms propres invariants de `LANGUAGES`
  // (src/i18n) ; les thèmes passent par t("settings:theme.<id>.name").
  languageMenu: "Changer la langue de l'interface",
  languageList: "Langue de l'interface",
  skinMenu: "Changer le thème d'apparence",
  skinList: "Thème d'apparence",

  // Barre latérale
  primaryNav: "Navigation principale",
  localWorkspace: "Espace de travail local",
  dataStaysLocal: "Les données sont stockées sur cet appareil",
  closeNavigation: "Fermer la navigation",
  navigationMenu: "Menu de navigation",

  // WorkspaceLayout + AssistantDock
  skipToContent: "Aller au contenu principal",
  mainViewAria: "Vue {{view}}",
  openNavigationMenu: "Ouvrir le menu de navigation",
  menu: "Menu",
  openAssistant: "Ouvrir l'assistant IA",
  assistant: "Assistant IA",
  closeAssistantPanel: "Fermer le panneau de l'assistant",
  assistantPanelAria: "Assistant IA Morpho",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "Chargement…",
    noProjectSelected: "Aucun projet sélectionné",
    researchProject: "Projet de recherche",
    currentWorkspace: "Espace de travail actuel",
    manageAll: "Tout gérer",
    projectListAria: "Liste des projets",
    emptyProjects: "Aucun projet pour l'instant — créez le premier.",
    newProject: "Nouveau projet",
    newProjectDialogTitle: "Nouveau projet de recherche",
    newProjectDialogDescription:
      "Chaque projet dispose de sa propre configuration, de son plan, de ses tâches, de ses connaissances et de son contexte d'assistant.",
    nameLabel: "Nom du projet",
    namePlaceholder: "ex. optimisation de l'inférence LLM",
    descriptionLabel: "Description",
    descriptionPlaceholder:
      "En une phrase, à quelle question ce projet doit-il répondre ?",
    cancel: "Annuler",
    create: "Créer le projet",
    nameRequired: "Le nom du projet ne peut pas être vide.",
    createFailed: "La création a échoué. Merci de réessayer.",
    status: {
      draft: "Brouillon · non démarré",
      inProgress: "En cours · {{percent}} %",
      paused: "En pause · {{percent}} %",
    },
  },
};

export default shell;
