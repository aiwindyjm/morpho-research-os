/**
 * Ressources sources françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise (glossaire :
 * source, qualité, affirmation).
 */
const sources = {
  kicker: "Bibliothèque de sources",
  title: "Sources découvertes",
  description:
    "Chaque source conserve son adresse normalisée, son type, ses informations de qualité et les affirmations auxquelles elle a contribué.",
  importLinks: "Importer des liens",
  desktopOnly: "Version bureau uniquement",
  qualityToggle: "Filtrer par qualité",
  empty: {
    title: "Aucune source pour l'instant",
    description:
      "Approuvez le plan de recherche et lancez une exécution ; les sources découvertes apparaîtront ici.",
  },
  summary: {
    all: "Toutes",
    high: "Haute qualité",
    medium: "Moyenne",
    pending: "À évaluer",
  },
  search: "Rechercher des sources ou des mots-clés",
  searchPlaceholder: "Rechercher des titres ou des adresses…",
  filter: {
    all: "Tous les types",
    paper: "Articles",
    documentation: "Documentations officielles",
  },
  count: "{{total}} sources",
  noMatch: "Aucune source correspondante ; essayez d'autres mots-clés ou réinitialisez les filtres.",
};

export default sources;
