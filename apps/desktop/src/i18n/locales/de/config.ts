/**
 * Deutsche Config-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch (Glossar:
 * Forschungskonfiguration, Plan, Dimension, Quelle, Aussage).
 */
const config = {
  kicker: "Forschungskonfiguration",
  title: "Forschungsfrage definieren",
  description:
    "Diese Angaben bestimmen Umfang, Tiefe und Quellenauswahl des Forschungsplans.",
  cancel: "Abbrechen",
  discard: "Änderungen verwerfen",
  save: "Konfiguration speichern",
  saveError: {
    title: "Speichern nicht möglich",
    validation: "Konfiguration hat die Validierung nicht bestanden: {{issue}}",
    failed: "Speichern fehlgeschlagen. Bitte später erneut versuchen.",
  },
  noProject: {
    title: "Zuerst ein Projekt auswählen oder erstellen",
    description:
      "Die Forschungskonfiguration gehört zu einem bestimmten Projekt; vor dem Konfigurieren zu einem Projekt wechseln oder eines erstellen.",
  },
  section01: {
    title: "Forschungsthema",
    help: "Zuerst klären, was verstanden werden soll und wofür.",
  },
  section02: {
    title: "Forschungsumfang",
    help: "Je klarer der Umfang, desto leichter ist der Plan auszuführen und zu prüfen.",
  },
  section03: {
    title: "Forschungsdimensionen",
    help: "Auswählen, welche Aspekte der Plan abdecken muss; nach der Planerstellung anpassbar.",
  },
  section04: {
    title: "Quellenpräferenzen",
    help: "Morpho durchsucht diese Quellen zuerst und bewahrt die Herkunft jeder Aussage.",
  },
  field: {
    domain: "Forschungsfeld",
    domainPlaceholder: "z. B. Neuroengineering",
    topic: "Forschungsthema",
    topicPlaceholder: "z. B. Brain-Computer-Schnittstellen in der motorischen Rehabilitation",
    purpose: "Forschungszweck",
    audience: "Zielgruppe",
    audiencePlaceholder: "z. B. Forschende der Rehabilitationsmedizin",
    depth: "Forschungstiefe",
    timeRange: "Zeitraum",
    yearStart: "Startjahr",
    yearStartPlaceholder: "z. B. 2015",
    yearEnd: "Endjahr",
    yearEndPlaceholder: "z. B. 2026",
    yearTo: "bis",
    languages: "Sprachen",
    geographicScope: "Geografischer Raum",
    geographicScopePlaceholder: "z. B. global",
  },
  dimensions: {
    custom: "Eigene Dimension",
    customTitle: "Nur im Desktop-Build",
  },
  sourcePref: {
    paper: "Journals, Preprints und Konferenzmaterial",
    documentation: "Offizielle Dokumentation und institutionelle Leitlinien",
    web_page: "Branchenberichterstattung und Fachmedien",
    repository: "Code und Open-Source-Implementierungen",
    dataset: "Öffentliche Daten und Experimentmaterial",
    book: "Lehrbücher, Monografien und Handbücher",
    video: "Vorlesungen und Konferenzmitschnitte",
  },
  footer:
    "Die Aktualisierungsfrequenz ist derzeit auf manuell festgelegt (update_frequency: manual); automatische inkrementelle Forschung folgt in einer späteren Version.",
};

export default config;
