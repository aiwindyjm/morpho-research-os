/**
 * Ressources assistant françaises (ADR-023). Traduction de la référence
 * zh-CN / de la version en faisant autorité — interface produit concise.
 * L'enregistrement dans le journal reste toujours une action explicite en
 * deux étapes ; la copie conserve cette emphase.
 */
const assistant = {
  aria: "Assistant de recherche IA",
  kicker: "Assistant du projet actif",
  closeAria: "Fermer l'assistant IA",
  context: {
    loading: "Chargement du contexte du projet…",
    usingBefore: "Utilisation actuelle de ",
    usingAfter: " comme contexte de recherche",
  },
  navAria: "Actions de l'assistant",
  error: {
    title: "Action non aboutie",
    fallback: "L'assistant est temporairement indisponible. Merci de réessayer.",
  },
  decision: {
    empty: "Rédigez d'abord le contenu de la décision.",
    title: "Consigner une décision",
    hint: "Les décisions sont enregistrées uniquement dans ce projet ; rien n'est écrit tant que vous n'avez pas cliqué sur « Consigner la décision ».",
    inputAria: "Contenu de la décision",
    inputPlaceholder: "ex. privilégier les sources d'articles quantitatifs au prochain tour",
    save: "Consigner la décision",
    saved: "Décision consignée (enregistrement explicite ; {{total}} au total).",
    listSummary: "Décisions consignées ({{total}})",
  },
  journalSave: {
    title: "Enregistrer la conversation dans le journal",
    idle: "Cette conversation compte {{total}} messages ; rien n'est écrit dans le journal local tant que vous n'avez pas cliqué sur « Confirmer l'enregistrement » — rien n'est enregistré automatiquement.",
    groupAria: "Confirmer l'enregistrement de la conversation",
    confirmDetail:
      "{{total}} messages seront enregistrés dans le journal du jour ({{date}}, local uniquement).",
    confirm: "Confirmer l'enregistrement",
    cancel: "Annuler",
    arm: "Enregistrer dans le journal",
    saved: "{{total}} messages enregistrés dans le journal du jour.",
    viewJournal: "Voir le journal →",
  },
  toast: {
    savedTitle: "Enregistré dans le journal",
    savedDetail: "{{total}} messages au total (local uniquement)",
  },
  entry: {
    header: "Conversation enregistrée depuis l'assistant IA (projet : {{project}} · ID {{id}})",
    line: "[{{author}}] {{content}}",
    authorLabel: "Utilisateur",
    unknownProject: "Projet inconnu",
  },
  footer: {
    note: "L'IA répond à partir de l'espace de travail du projet actuel",
    openJournal: "Journal",
  },
};

export default assistant;
