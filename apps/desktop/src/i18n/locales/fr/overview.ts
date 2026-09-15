/**
 * Ressources overview françaises (ADR-023). Traduction de la référence
 * zh-CN / de la version en faisant autorité — interface produit concise
 * (glossaire : couverture, dimension, source, nœud de connaissance,
 * affirmation, écart, exécution).
 */
const overview = {
  kicker: "Projet de recherche / {{status}}",
  notStarted: "Non démarré",
  fallbackTitle: "Vue d'ensemble",
  editConfig: "Modifier la configuration",
  viewTasks: "Voir les tâches →",
  planDraftTitle: "Approuvez d'abord le plan sur la page Plan de recherche",
  continueResearch: "Poursuivre la recherche →",
  empty: {
    title: "Aucun projet sélectionné",
    description:
      "Sélectionnez ou créez d'abord un projet de recherche dans « Ma recherche » ; sa vue d'ensemble s'affichera ici.",
    action: "Aller à « Ma recherche »",
  },
  metrics: {
    coverage: "Couverture de recherche",
    coverageMeta: "{{done}} / {{total}} dimensions principales terminées",
    sources: "Sources",
    sourcesMeta: "{{total}} de haute qualité",
    knowledge: "Nœuds de connaissance",
    knowledgeMeta: "{{total}} types",
    reviews: "Affirmations à vérifier",
    reviewsMeta: "{{total}} en conflit",
    coverageProgressAria: "Progression de la couverture",
  },
  path: {
    kicker: "Avancement de la recherche",
    title: "Parcours de recherche actuel",
    viewAll: "Tout voir →",
    empty:
      "Aucune tâche exécutable pour l'instant. Approuvez le plan et lancez une exécution : les tâches apparaîtront ici dans l'ordre des dépendances.",
    executing: "En cours d'exécution",
    waitingPredecessor: "En attente des prédécesseurs",
    progressAria: "Progression des tâches",
    stateDone: "Terminé",
    stateReview: "À vérifier",
    stateWaiting: "En attente",
  },
  activity: {
    kicker: "Activité de recherche",
    title: "À l'instant",
    live: "En direct",
    empty:
      "Aucune activité pour l'instant ; dès qu'une exécution de recherche démarre, sources, affirmations et nœuds de connaissance apparaîtront ici au fil du temps.",
  },
  dimensions: {
    kicker: "Couverture",
    title: "Dimensions de recherche",
    viewKnowledge: "Voir les connaissances →",
    progressAria: "Progression de couverture : {{dimension}}",
  },
  coverage: {
    why: "Pourquoi ce score ?",
    taskCompletion: "Achèvement des tâches {{score}} (poids {{weight}}) : {{done}}/{{total}} tâches terminées",
    knowledgeBreadth: "Ampleur des connaissances {{score}} (poids {{weight}}) : {{total}} nœuds",
    evidenceDensity: "Densité de preuves {{score}} (poids {{weight}}) : {{total}} preuves",
    sourceDiversity:
      "Diversité des sources {{score}} (poids {{weight}}) : {{total}} sources indépendantes de haute qualité",
  },
  next: {
    kicker: "Prochaine étape",
    title: "Recherche suivante suggérée",
    triggerCoverage: "Couverture faible",
    triggerSources: "Pas assez de sources",
    createdTask: "Tâche « {{title}} » créée.",
    createdTaskHint: "La nouvelle tâche apparaît sur la page Tâches ; mettez-la en pause ou relancez-la à tout moment.",
    createTask: "Créer une tâche de recherche →",
    dismissAria: "Ignorer cette suggestion",
    dismiss: "Ignorer",
    empty: "Aucune suggestion d'écart — la couverture est bonne.",
  },
};

export default overview;
