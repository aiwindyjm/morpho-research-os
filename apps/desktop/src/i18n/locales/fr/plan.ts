/**
 * Ressources plan françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise (glossaire :
 * plan, tâche, exécution, révision, approuver/rejeter).
 */
const plan = {
  kicker: "Plan de recherche / {{status}}",
  statusDraft: "En attente de révision",
  fallbackTitle: "Plan de recherche",
  noPlanDescription:
    "Le planificateur ne produit que des avant-projets de plan à réviser ; les tâches exécutables sont créées après approbation.",
  regenerate: "Régénérer",
  reject: "Rejeter le plan",
  approveAria: "Approuver le plan",
  approve: "Confirmer et lancer",
  startRun: "Lancer l'exécution",
  runStartedToast: {
    title: "Exécution de recherche lancée",
    detail: "Suivez la progression en direct sur la page Tâches.",
  },
  runStartFailed: "Le lancement de l'exécution a échoué.",
  regenerateApproved: "Régénérer le plan",
  generate: "Générer le plan de recherche",
  actionError: {
    title: "Action non aboutie",
    fallback: "L'action a échoué. Merci de réessayer.",
  },
  runAlert: {
    title: "État de l'exécution : {{state}}",
    detail:
      "Le plan est entré en exécution ({{total}} tâches au total) ; pour ajuster le plan, mettez des tâches en pause sur la page Tâches ou attendez la fin de cette exécution.",
  },
  empty: {
    title: "Aucun plan de recherche pour l'instant",
    description:
      "Terminez d'abord la configuration de recherche, puis cliquez sur « Générer le plan de recherche ». Le plan listera, par dimension, les tâches de recherche de sources et d'extraction à réviser.",
  },
  summary: {
    tasks: "Tâches planifiées",
    sources: "Sources",
    dimensions: "Dimensions de recherche",
    reviews: "À vérifier",
  },
  group: {
    expandAria: "Déplier le groupe",
    collapseAria: "Replier le groupe",
    taskCount: "{{total}} tâches",
  },
  task: {
    edit: "Modifier la tâche",
  },
  locked: {
    title: "Plan verrouillé",
    detail:
      "Cette exécution a déjà été créée ; le plan ne peut plus être modifié. Mettez des tâches en pause ou régénérez le plan après la fin de l'exécution.",
  },
  editDialog: {
    title: "Modifier une tâche du plan",
    description:
      "Seuls le titre et la description sont modifiables ; le type de tâche et l'ordre d'exécution sont décidés par l'orchestrateur.",
    titleLabel: "Titre de la tâche",
    descriptionLabel: "Description de la tâche",
    cancel: "Annuler",
    save: "Enregistrer les modifications",
    saveFailed: "L'enregistrement des modifications a échoué.",
  },
};

export default plan;
