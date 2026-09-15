/**
 * Deutsche Assistant-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch. Das
 * Speichern im Journal bleibt stets eine explizite Zweistufen-Aktion; der
 * Text behält diese Betonung bei.
 */
const assistant = {
  aria: "KI-Forschungsassistent",
  kicker: "Assistent des aktiven Projekts",
  closeAria: "KI-Assistent schließen",
  context: {
    loading: "Projektkontext wird geladen…",
    usingBefore: "Jetzt wird ",
    usingAfter: " als Forschungskontext verwendet",
  },
  navAria: "Assistentenaktionen",
  error: {
    title: "Aktion nicht abgeschlossen",
    fallback: "Der Assistent ist vorübergehend nicht verfügbar. Bitte erneut versuchen.",
  },
  decision: {
    empty: "Zuerst den Entscheidungsinhalt schreiben.",
    title: "Entscheidung festhalten",
    hint: "Entscheidungen werden nur innerhalb dieses Projekts gespeichert; geschrieben wird erst beim Klick auf „Entscheidung speichern“.",
    inputAria: "Entscheidungsinhalt",
    inputPlaceholder: "z. B. Quantitative Paper-Quellen in der nächsten Runde bevorzugen",
    save: "Entscheidung speichern",
    saved: "Entscheidung gespeichert (explizites Speichern; insgesamt {{total}}).",
    listSummary: "Gespeicherte Entscheidungen ({{total}})",
  },
  journalSave: {
    title: "Gespräch im Journal speichern",
    idle: "Dieses Gespräch hat {{total}} Nachrichten; in das lokale Journal wird erst geschrieben, wenn „Speichern bestätigen“ geklickt wird — nichts wird automatisch gespeichert.",
    groupAria: "Speichern des Gesprächs bestätigen",
    confirmDetail:
      "{{total}} Nachrichten werden im heutigen Journal gespeichert ({{date}}, nur lokal).",
    confirm: "Speichern bestätigen",
    cancel: "Abbrechen",
    arm: "Im Journal speichern",
    saved: "{{total}} Nachrichten im heutigen Journal gespeichert.",
    viewJournal: "Journal ansehen →",
  },
  toast: {
    savedTitle: "Im Journal gespeichert",
    savedDetail: "Insgesamt {{total}} Nachrichten (nur lokal)",
  },
  entry: {
    header: "Im KI-Assistenten gespeichertes Gespräch (Projekt: {{project}} · ID {{id}})",
    line: "[{{author}}] {{content}}",
    authorLabel: "Nutzer",
    unknownProject: "Unbekanntes Projekt",
  },
  footer: {
    note: "Die KI antwortet auf Basis des aktuellen Projektarbeitsbereichs",
    openJournal: "Journal",
  },
};

export default assistant;
