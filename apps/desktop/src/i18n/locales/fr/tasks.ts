/**
 * Ressources tasks françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise (glossaire :
 * tâche, exécution, pause/reprise/nouvel essai/annulation).
 */
const tasks = {
  kicker: "Tâches de recherche",
  title: "Travail en cours",
  description: "Chaque tâche peut être mise en pause, relancée et retracée jusqu'à ses sources et résultats.",
  continueRun: "Reprendre l'exécution",
  runStartedToast: {
    title: "Exécution de recherche lancée",
    detail: "Les tâches s'exécuteront dans l'ordre des dépendances.",
  },
  runBadge: "État de l'exécution : {{state}}",
  empty: {
    title: "Aucune tâche pour l'instant",
    approved: "Le plan est approuvé — cliquez sur « Reprendre l'exécution » en haut à droite pour créer les tâches.",
    draft: "Examinez et approuvez d'abord le plan sur la page Plan de recherche ; les tâches sont créées après approbation.",
    generic: "Générez et approuvez d'abord un plan sur la page Plan de recherche.",
  },
  filterAria: "Filtrer par état de tâche",
  tabs: {
    all: "Toutes",
    active: "Actives",
    review: "À vérifier",
    done: "Terminées",
  },
  lastUpdated: "Dernière mise à jour {{date}}",
  col: {
    task: "Tâche",
    stage: "Phase",
    status: "État",
  },
  pill: {
    running: "En cours",
    needsReview: "À vérifier",
    completed: "Terminé",
  },
  action: {
    menuAria: "Actions de la tâche",
    pause: "Mettre en pause",
    resume: "Reprendre",
    retry: "Réessayer",
    confirmContinue: "Confirmer et poursuivre",
    cancel: "Annuler",
    unsupportedTitle: "Indisponible en V0.1",
    unsupportedHint: "Les contrôles par tâche (pauser/reprendre/réessayer/annuler) exigent une distribution par tâche et arriveront dans une version ultérieure ; pour l'instant, toute l'exécution peut être arrêtée via « Annuler l'exécution ».",
  },
  runStartFailedToast: {
    title: "Impossible de démarrer l'exécution de recherche",
  },
};

export default tasks;
