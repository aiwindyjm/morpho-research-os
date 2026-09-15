/**
 * Ressources communes françaises (ADR-023). Traduction de la référence
 * zh-CN / de la version en faisant autorité — interface produit concise.
 * Le groupe `vocab` reflète les données du produit (états de tâche, statuts
 * de plan, niveaux de confiance, types de nœuds, dimensions, …) avec le
 * glossaire commun : projet / plan / tâche / source / nœud de connaissance /
 * affirmation / preuve / exécution / couverture / dimension / écart.
 * « Vault » reste inchangé.
 */
const common = {
  loading: "Chargement…",
  error: {
    title: "Une erreur est survenue",
    unknown: "Une erreur inconnue est survenue. Merci de réessayer.",
    retryableSuffix: " (réessayable)",
    technicalDetail: "Détails techniques : {{detail}}",
    retry: "Réessayer",
  },
  vocab: {
    taskState: {
      PENDING: "En attente",
      PLANNING: "Planification",
      RUNNING: "En cours",
      VALIDATING: "Validation",
      COMPLETED: "Terminé",
      NEEDS_REVIEW: "Vérification requise",
      PAUSED: "En pause",
      FAILED: "Échec",
      CANCELLED: "Annulé",
    },
    planStatus: {
      draft: "En attente de révision",
      approved: "Approuvé",
      rejected: "Rejeté",
    },
    confidence: {
      confirmed: "Confirmé",
      high: "Confiance élevée",
      medium: "Confiance moyenne",
      low: "Confiance faible",
      unverified: "Non vérifié",
      conflicting: "En conflit",
    },
    nodeType: {
      Concept: "Concept",
      Person: "Personne",
      Organization: "Organisation",
      Company: "Entreprise",
      Paper: "Article",
      Book: "Livre",
      Experiment: "Expérience",
      Event: "Événement",
      Technology: "Technologie",
      Product: "Produit",
      Application: "Application",
      Policy: "Politique",
      Dataset: "Jeu de données",
      Controversy: "Controverse",
    },
    purpose: {
      learning: "Apprentissage",
      teaching: "Enseignement",
      writing: "Rédaction",
      research: "Recherche",
      industry: "Analyse sectorielle",
      product: "Étude produit",
      strategy: "Stratégie",
      custom: "Personnalisé",
    },
    dimension: {
      concepts: "Concepts clés",
      history: "Histoire",
      theory: "Fondements théoriques",
      technology: "Méthodes et technologie",
      experiments: "Expériences",
      papers: "Articles clés",
      people: "Personnes clés",
      organizations: "Organisations",
      companies: "Entreprises",
      products: "Produits",
      applications: "Applications",
      industry: "Paysage industriel",
      policy: "Politique et réglementation",
      market: "Taille du marché",
      investment: "Activité d'investissement",
      controversy: "Controverses",
      risk: "Risques et éthique",
      recent_developments: "Développements récents",
      future_trends: "Tendances futures",
    },
    sourceType: {
      web_page: "Page web",
      paper: "Article",
      documentation: "Documentation",
      book: "Livre",
      dataset: "Jeu de données",
      video: "Vidéo",
      repository: "Dépôt",
    },
    sourceStatus: {
      discovered: "Découverte",
      evaluated: "Évaluée",
      fetched: "Récupérée",
      indexed: "Indexée",
      rejected: "Écartée",
    },
    taskKind: {
      search: "Recherche de sources",
      source_evaluation: "Évaluation des sources",
      extraction: "Extraction",
      normalization: "Normalisation",
      validation: "Validation",
      synthesis: "Synthèse",
    },
    depth: {
      1: "1 · S'orienter",
      2: "2 · Construire la compréhension",
      3: "3 · Recherche structurée",
      4: "4 · Recherche experte",
      5: "5 · Veille de pointe",
    },
    assistantAction: {
      explain_progress: "Expliquer l'avancement",
      suggest_next_task: "Suggérer la tâche suivante",
      list_pending_reviews: "Lister les éléments à vérifier",
      record_decision: "Consigner une décision",
    },
  },
};

export default common;
