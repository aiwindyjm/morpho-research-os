/**
 * Ressources journal françaises (ADR-023). Traduction de la référence zh-CN /
 * de la version en faisant autorité — interface produit concise. Le journal
 * est une donnée privée, purement locale (jamais téléversée, jamais dans
 * Git).
 */
const journal = {
  kicker: "Journal privé",
  title: "Journal",
  description:
    "Les discussions d'architecture et de produit du jour restent sur cette machine — jamais dans Git ni dans le Vault de recherche.",
  downloadJson: "Télécharger le JSON",
  downloadMarkdown: "Télécharger le Markdown du jour",
  count: "{{total}} entrées",
  localOnly: "Local uniquement",
  authorUser: "Utilisateur",
  listEmpty: "Aucune entrée pour l'instant. Notez les décisions produit, questions ou prochaines étapes du jour.",
  inputAria: "Entrée de journal",
  inputPlaceholder: "Consignez les décisions produit, questions ou prochaines étapes du jour…",
  errorEmpty: "Écrivez d'abord quelque chose à consigner.",
  storageNote: "Enregistré dans le stockage local du navigateur",
  save: "Enregistrer l'entrée",
  rules: {
    kicker: "Règles de stockage",
    title: "Un carnet de développement qui n'appartient qu'à vous",
    items: {
      byLocalDate: "Groupé par date locale",
      neverUploaded: "Jamais téléversé, jamais dans Git",
      explicitDownload: "Téléchargement Markdown explicite au besoin",
      privateFolder: "Peut être déplacé manuellement vers private/conversations/",
    },
  },
  limits: {
    title: "Limites actuelles",
    detail:
      "L'aperçu web ne peut pas écrire directement dans l'espace de travail ; le noyau Rust de la version bureau ajoute chaque jour des fichiers locaux.",
  },
};

export default journal;
