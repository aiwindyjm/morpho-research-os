/**
 * Deutsche Knowledge-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Wissensknoten, Aussage, Beleg, Vault, Quelle).
 */
const knowledge = {
  kicker: "Wissensbasis",
  title: "Extrahiertes Wissen",
  description: "Knoten sind Entitäten und Konzepte; Aussagen und Belege werden separat gespeichert.",
  filterAria: "Nach Typ filtern",
  filterAll: "Alle Typen",
  exportVault: "Vault exportieren",
  exportTitle: "Wissen, Quellen und Aussagen als Markdown-Vault exportieren",
  toolbar: {
    sources: "Quellen {{total}}",
    nodes: "Wissensknoten {{total}}",
    claims: "Aussagen {{total}}",
  },
  empty: {
    title: "Die Wissensbasis ist noch leer",
    description:
      "Sobald ein Forschungslauf die Normalisierung abgeschlossen hat, erscheinen hier Entitäten, Aussagen und Belege.",
  },
  tabs: {
    label: "Wissensansichten",
    nodes: "Wissensknoten",
    claims: "Aussagen & Belege",
  },
  search: "Wissensknoten durchsuchen",
  searchPlaceholder: "Titel, Zusammenfassungen oder Aliasse durchsuchen…",
  nodeCount: "{{total}} Knoten",
  noMatch: "Keine passenden Wissensknoten; andere Stichwörter ausprobieren oder Filter zurücksetzen.",
  claimsIntro:
    "Aussagen sind unabhängig von Wissensknoten; widersprüchliche Aussagen koexistieren, jede mit eigenen Belegen.",
  unknownSubject: "Unbekanntes Subjekt",
  conflictBadge: "Widersprüchlich: stützende und widersprechende Belege bleiben beide erhalten",
  evidenceLoading: "Belege werden geladen…",
  toast: {
    conflictTitle: "Export abgeschlossen, aber Konflikte benötigen manuelle Bearbeitung",
    conflictDetail:
      "{{written}} Dateien geschrieben, {{unchanged}} unverändert; {{conflicts}} Dateien wegen lokaler Änderungen als Zusammenführungsvorschlag behalten ({{proposals}}). Exportverzeichnis: {{root}}",
    successTitle: "Vault-Export abgeschlossen",
    successDetail:
      "{{written}} Dateien geschrieben ({{sources}} Quellen, {{claims}} Aussagen, {{maps}} Zuordnungen), {{unchanged}} unverändert. Exportverzeichnis: {{root}}",
    errorTitle: "Vault-Export fehlgeschlagen",
    listSeparator: ", ",
    moreSuffix: "…",
  },
};

export default knowledge;
