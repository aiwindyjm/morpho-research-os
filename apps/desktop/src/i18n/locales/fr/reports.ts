/**
 * Ressources reports françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise (glossaire :
 * source, nœud de connaissance, affirmation, couverture, exécution).
 */
const reports = {
  kicker: "Rapports",
  title: "Briefing de recherche du projet",
  description:
    "Un résumé d'une page généré à partir des sources, des connaissances et de la couverture du projet actuel ; l'export du briefing complet arrive plus tard.",
  empty: {
    title: "Rien à signaler pour l'instant",
    description:
      "Dès que les exécutions de recherche produiront sources, nœuds de connaissance et affirmations, le briefing du projet sera résumé ici.",
  },
  metrics: {
    sources: "Sources",
    knowledge: "Nœuds de connaissance",
    claims: "Affirmations",
    coverage: "Couverture de recherche",
  },
  dimensions: {
    kicker: "Couverture",
    title: "Tableau de couverture par dimension",
    caption: "Couverture et apports clés par dimension de recherche",
    colDimension: "Dimension",
    colCoverage: "Couverture",
    colTasks: "Tâches terminées",
    colNodes: "Nœuds de connaissance",
    colQualitySources: "Sources de haute qualité",
  },
  runs: {
    kicker: "Historique des exécutions",
    title: "Exécutions de recherche récentes",
    empty: "Aucune exécution de recherche pour l'instant ; les événements apparaîtront ici dès le lancement d'une exécution.",
  },
  export: {
    kicker: "Export",
    soon: "Bientôt disponible",
    title: "Exporter le rapport",
    description:
      "Le briefing de recherche et l'export du Vault arriveront après l'intégration du pipeline ; cette page résume les données pour l'instant.",
  },
};

export default reports;
