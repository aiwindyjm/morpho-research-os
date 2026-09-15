/**
 * Deutsche Journal-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch. Das Journal
 * ist private, ausschließlich lokale Daten (nie hochgeladen, nie in Git).
 */
const journal = {
  kicker: "Privates Journal",
  title: "Journal",
  description:
    "Die heutigen Architektur- und Produktgespräche bleiben auf diesem Rechner — nie in Git oder im Forschungs-Vault.",
  downloadJson: "JSON herunterladen",
  downloadMarkdown: "Heutiges Markdown herunterladen",
  count: "{{total}} Einträge",
  localOnly: "Nur lokal",
  authorUser: "Nutzer",
  listEmpty: "Noch keine Einträge. Heutige Produktentscheidungen, Fragen oder nächste Schritte notieren.",
  inputAria: "Journaleintrag",
  inputPlaceholder: "Heutige Produktentscheidungen, Fragen oder nächste Schritte festhalten…",
  errorEmpty: "Zuerst etwas zum Festhalten schreiben.",
  storageNote: "Im Browser-Speicher abgelegt",
  save: "Eintrag speichern",
  rules: {
    kicker: "Speicherregeln",
    title: "Ein Entwicklungsprotokoll, das niemandem sonst gehört",
    items: {
      byLocalDate: "Nach lokalem Datum gruppiert",
      neverUploaded: "Niemals hochgeladen, nie in Git",
      explicitDownload: "Expliziter Markdown-Download bei Bedarf",
      privateFolder: "Kann manuell nach private/conversations/ verschoben werden",
    },
  },
  limits: {
    title: "Aktuelle Einschränkungen",
    detail:
      "Die Web-Vorschau kann nicht direkt in den Arbeitsbereich schreiben; der Rust-Kern des Desktop-Builds ergänzt täglich lokale Dateien.",
  },
};

export default journal;
