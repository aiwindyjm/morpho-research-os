/**
 * Ressources knowledge françaises (ADR-023). Traduction de la référence
 * zh-CN / de la version en faisant autorité — interface produit concise
 * (glossaire : nœud de connaissance, affirmation, preuve, Vault, source).
 */
const knowledge = {
  kicker: "Base de connaissances",
  title: "Connaissances extraites",
  description: "Les nœuds sont des entités et des concepts ; les affirmations et les preuves sont stockées séparément.",
  filterAria: "Filtrer par type",
  filterAll: "Tous les types",
  exportVault: "Exporter le Vault",
  exportTitle: "Exporter les connaissances, les sources et les affirmations dans un Vault Markdown",
  toolbar: {
    sources: "Sources {{total}}",
    nodes: "Nœuds de connaissance {{total}}",
    claims: "Affirmations {{total}}",
  },
  empty: {
    title: "La base de connaissances est encore vide",
    description:
      "Dès qu'une exécution de recherche achève la normalisation, les entités, affirmations et preuves apparaîtront ici.",
  },
  tabs: {
    label: "Vues des connaissances",
    nodes: "Nœuds de connaissance",
    claims: "Affirmations et preuves",
  },
  search: "Rechercher des nœuds de connaissance",
  searchPlaceholder: "Rechercher des titres, résumés ou alias…",
  nodeCount: "{{total}} nœuds",
  noMatch: "Aucun nœud de connaissance correspondant ; essayez d'autres mots-clés ou réinitialisez les filtres.",
  claimsIntro:
    "Les affirmations sont indépendantes des nœuds de connaissance ; les affirmations contradictoires coexistent, chacune conservant ses propres preuves.",
  unknownSubject: "Sujet inconnu",
  conflictBadge: "En conflit : les preuves à l'appui et les preuves contradictoires sont conservées ensemble",
  evidenceLoading: "Chargement des preuves…",
  toast: {
    conflictTitle: "Export terminé, mais des conflits demandent un traitement manuel",
    conflictDetail:
      "{{written}} fichiers écrits, {{unchanged}} inchangés ; {{conflicts}} fichiers conservés comme propositions de fusion en raison de modifications locales ({{proposals}}). Répertoire d'export : {{root}}",
    successTitle: "Export du Vault terminé",
    successDetail:
      "{{written}} fichiers écrits ({{sources}} sources, {{claims}} affirmations, {{maps}} correspondances), {{unchanged}} inchangés. Répertoire d'export : {{root}}",
    errorTitle: "Échec de l'export du Vault",
    listSeparator: ", ",
    moreSuffix: "…",
  },
};

export default knowledge;
