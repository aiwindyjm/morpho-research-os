/**
 * Ressources projects françaises (ADR-023). Traduction de la référence
 * zh-CN / de la version en faisant autorité — interface produit concise
 * (glossaire : projet, plan, tâche, source, connaissance, couverture).
 */
const projects = {
  kicker: "Ma recherche",
  title: "Tous les projets de recherche",
  description:
    "Chaque sujet est un espace de recherche indépendant. Changez, poursuivez ou lancez une nouvelle recherche à tout moment.",
  newResearch: "Nouvelle recherche",
  empty: {
    title: "Aucun projet de recherche pour l'instant",
    description:
      "Créez votre premier projet et transformez une question de recherche en base de connaissances qui ne cesse de s'enrichir.",
  },
  search: "Rechercher dans « Ma recherche »",
  count: "{{total}} projets",
  createCard: {
    title: "Lancer une nouvelle recherche",
    hint: "Commencez par une question",
  },
  card: {
    openAria: "Ouvrir le projet",
    statusDraft: "Brouillon",
    statusInProgress: "En cours",
    statusPaused: "En pause",
    coverage: "{{percent}} % de couverture",
    notStarted: "Non démarré",
    taskCount: "{{total}} tâches",
    updatedAt: "Mis à jour {{date}}",
    progressAria: "Avancement du projet",
    enterWorkspace: "Ouvrir l'espace de travail",
    switchTo: "Passer à ce projet",
    configure: "Configuration de recherche",
  },
  dialog: {
    title: "Nouveau projet de recherche",
    description:
      "Chaque projet dispose de sa propre configuration, de son plan, de ses tâches, de ses connaissances et de son contexte d'assistant.",
    nameLabel: "Nom du projet",
    namePlaceholder: "ex. optimisation de l'inférence LLM",
    descriptionLabel: "Description",
    descriptionPlaceholder:
      "En une phrase, à quelle question ce projet doit-il répondre ?",
    cancel: "Annuler",
    create: "Créer le projet",
  },
  error: {
    nameRequired: "Le nom du projet ne peut pas être vide.",
    createFailed: "La création a échoué. Merci de réessayer.",
  },
};

export default projects;
