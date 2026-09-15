/**
 * Ressources config françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise (glossaire :
 * configuration de recherche, plan, dimension, source, affirmation).
 */
const config = {
  kicker: "Configuration de recherche",
  title: "Définissez votre question de recherche",
  description:
    "Ces éléments déterminent le périmètre, la profondeur et la sélection des sources du plan de recherche.",
  cancel: "Annuler",
  discard: "Abandonner les modifications",
  save: "Enregistrer la configuration",
  saveError: {
    title: "Enregistrement impossible",
    validation: "La configuration n'a pas passé la validation : {{issue}}",
    failed: "L'enregistrement a échoué. Merci de réessayer plus tard.",
  },
  noProject: {
    title: "Sélectionnez ou créez d'abord un projet",
    description:
      "La configuration de recherche appartient à un projet précis ; basculez vers un projet ou créez-en un avant de configurer.",
  },
  section01: {
    title: "Sujet de recherche",
    help: "Commencez par clarifier ce que vous voulez comprendre et l'usage final.",
  },
  section02: {
    title: "Périmètre de recherche",
    help: "Plus le périmètre est clair, plus le plan est facile à exécuter et à examiner.",
  },
  section03: {
    title: "Dimensions de recherche",
    help: "Choisissez les angles que le plan doit couvrir ; vous pourrez les ajuster après la génération du plan.",
  },
  section04: {
    title: "Préférences de sources",
    help: "Morpho interroge d'abord ces sources et conserve la provenance de chaque affirmation.",
  },
  field: {
    domain: "Domaine de recherche",
    domainPlaceholder: "ex. ingénierie neuronale",
    topic: "Sujet de recherche",
    topicPlaceholder: "ex. interfaces cerveau-machine en rééducation motrice",
    purpose: "Objectif de recherche",
    audience: "Public visé",
    audiencePlaceholder: "ex. chercheurs en médecine de rééducation",
    depth: "Profondeur de recherche",
    timeRange: "Période",
    yearStart: "Année de début",
    yearStartPlaceholder: "ex. 2015",
    yearEnd: "Année de fin",
    yearEndPlaceholder: "ex. 2026",
    yearTo: "à",
    languages: "Langues",
    geographicScope: "Périmètre géographique",
    geographicScopePlaceholder: "ex. mondial",
  },
  dimensions: {
    custom: "Dimension personnalisée",
    customTitle: "Version bureau uniquement",
  },
  sourcePref: {
    paper: "Revues, prépublications et actes de conférence",
    documentation: "Documentations officielles et recommandations institutionnelles",
    web_page: "Presse sectorielle et médias spécialisés",
    repository: "Code et implémentations open source",
    dataset: "Données publiques et matériels d'expérimentation",
    book: "Manuels, monographies et guides",
    video: "Cours et enregistrements de conférences",
  },
  footer:
    "La fréquence de mise à jour est actuellement fixée sur manuel (update_frequency: manual) ; la recherche incrémentale automatique arrivera dans une version ultérieure.",
};

export default config;
