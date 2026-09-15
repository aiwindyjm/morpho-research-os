/**
 * Ressources graph françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise (glossaire :
 * graphe de connaissances, nœud, relation, dimension, confiance, preuve).
 */
const graph = {
  kicker: "Graphe de connaissances",
  title: "Carte des relations de recherche",
  description:
    "Remontez des relations des nœuds jusqu'aux sources et preuves, au lieu d'admirer une jolie image.",
  showList: "Vue liste (accessible)",
  showGraph: "Vue graphe",
  exportImage: "Exporter l'image",
  desktopOnly: "Version bureau uniquement",
  empty: {
    title: "Le graphe est encore vide",
    description:
      "Dès qu'une exécution de recherche achève la normalisation, les entités et relations sont projetées dans un graphe 2D.",
  },
  filter: {
    byType: "Filtrer par type",
    typeAll: "Tous les nœuds",
    typeConcept: "Concepts",
    typeTechnology: "Technologies",
    typeCompany: "Entreprises",
    typePaper: "Articles",
    cluster: "Regrouper par dimension",
    clusterTitle: "Répartir les colonnes par dimension de recherche",
    search: "Rechercher des nœuds",
    searchPlaceholder: "Rechercher par titre…",
    byDimension: "Filtrer par dimension",
    dimensionAll: "Toutes les dimensions",
    byConfidence: "Filtrer par niveau de confiance",
    confidenceAll: "Tous les niveaux de confiance",
    byRelation: "Filtrer par type de relation",
    relationAll: "Toutes les relations",
    yearFrom: "Année de début",
    yearFromOption: "À partir de l'année",
    yearTo: "Année de fin",
    yearToOption: "à",
  },
  counts: "{{nodes}} nœuds · {{relations}} relations",
  inspector: {
    aria: "Inspecteur du graphe",
    placeholderList: "Sélectionnez un nœud dans la liste pour voir les détails.",
    placeholderGraph: "Sélectionnez un nœud pour voir les détails.",
    current: "Sélection actuelle",
    closeAria: "Fermer les détails",
    noSummary: "Pas encore de résumé",
    sourceCount: "Sources",
    relationCount: "Relations",
    relationsHeading: "Relations ({{total}})",
    openMarkdown: "Ouvrir en Markdown",
  },
  canvas: {
    aria: "Graphe de connaissances (disposition en forces, 2D)",
    caption: "Liste des nœuds de connaissance (variante du graphe)",
    nodeAria: "{{title}} ({{type}}, confiance {{confidence}})",
    edgeAria: "Relation : {{source}} {{predicate}} {{target}}",
  },
  table: {
    node: "Nœud",
    type: "Type",
    dimension: "Dimension",
    confidence: "Confiance",
    year: "Année",
    sourcesClaims: "Sources/Affirmations",
  },
};

export default graph;
