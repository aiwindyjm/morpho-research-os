/**
 * Ressources settings françaises (ADR-023). Traduction de la référence
 * zh-CN / de la version en faisant autorité — interface produit concise.
 * Les libellés d'options de langue (« 简体中文 »/« English ») sont des noms
 * propres invariants et restent dans le composant, de même que les cases à
 * cocher des langues sources de la page de configuration. Les noms et
 * descriptions de thèmes sont la copie de marque du produit.
 */
const settings = {
  language: {
    label: "Langue",
    aria: "Langue de l'interface",
    description:
      "La langue de l'interface s'applique immédiatement ; la préférence n'est conservée que dans ce navigateur.",
  },
  page: {
    kicker: "Paramètres",
    title: "Paramètres de l'espace de travail local",
    description: "Gardez la configuration minimale — ne définissez que ce que la recherche exige vraiment.",
  },
  theme: {
    title: "Thème d'apparence",
    description:
      "Les changements s'appliquent immédiatement ; la préférence de thème n'est conservée que dans ce navigateur.",
    aria: "Thème d'apparence",
    swatchTitle: "Arrière-plan / accent / accent secondaire",
    "lamplit-study": { name: "Lamplit Study", description: "Graphite et laiton — un cabinet de travail paisible" },
    "bio-luminal": { name: "Bio-luminal", description: "Champ sombre des abysses — lueur cyan et violette" },
  },
  core: {
    title: "Connexion au noyau de bureau",
    descriptionChecking:
      "Vérifie la compatibilité du protocole et de la version avec le noyau de recherche Rust.",
    descriptionOnline: "Le noyau de recherche Rust est en ligne ; versions du protocole ci-dessous.",
    checking: "Vérification…",
    online: "En ligne",
    offline: "Hors ligne",
    unreachable: "Impossible de joindre le noyau de bureau",
    retry: "Réessayer la connexion",
    appVersion: "Version de l'application",
    ipcProtocol: "Protocole IPC",
    workerProtocol: "Protocole worker",
    dbSchema: "Schéma de base de données",
    transport: "Transport",
    transportIpc: "IPC bureau",
    transportMock: "Aperçu web (mock)",
  },
  providers: {
    title: "Clés des fournisseurs IA",
    description:
      "Enregistrez les clés API des services compatibles OpenAI ou des modèles locaux ; elles ne vont que dans le trousseau du système.",
    count: "{{total}} fournisseurs",
    empty: {
      title: "Aucun fournisseur configuré",
      description:
        "Inscrivez les fournisseurs dans le fichier de configuration de l'application de bureau, puis enregistrez leurs clés ici.",
    },
    listAria: "Liste des clés de fournisseurs",
    keyConfigured: "Clé configurée",
    keyMissing: "Aucune clé configurée",
    keyLabel: "Clé API {{provider}}",
    keyPlaceholder: "Saisissez la clé API de {{provider}} (conservée dans le trousseau du système)",
    save: "Enregistrer la clé",
    keyHint:
      "La clé est écrite dans le trousseau du système d'exploitation ({{ref}}) ; seule la référence est conservée, et l'interface n'affiche plus jamais la valeur.",
    toastSaved: {
      title: "Clé enregistrée",
      detail: "La clé API de « {{provider}} » a été écrite dans le trousseau du système.",
    },
    toastFailed: {
      title: "Échec de l'enregistrement de la clé",
    },
  },
  journal: {
    title: "Journal privé",
    description: "Le journal est stocké uniquement en local et ne participe jamais aux tâches de recherche.",
    enabled: "Activé",
    open: "Ouvrir le journal →",
  },
};

export default settings;
