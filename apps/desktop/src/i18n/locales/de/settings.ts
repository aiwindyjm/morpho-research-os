/**
 * Deutsche Settings-Ressourcen (ADR-023). Übersetzung der zh-CN-Referenz bzw.
 * der autorisierten en-Fassung — kompakte Produkt-UI auf Deutsch.
 * Sprachoptionen („简体中文“/„English“) sind gebietsschemaunabhängige
 * Eigennamen und bleiben in der Komponente, ebenso die
 * Quellsprachen-Kontrollkästchen der Konfigurationsseite. Designnamen und
 * -beschreibungen sind Marken-Texte des Produkts.
 */
const settings = {
  language: {
    label: "Sprache",
    aria: "Oberflächensprache",
    description:
      "Die Oberflächensprache wird sofort angewendet; die Einstellung wird nur in diesem Browser gespeichert.",
  },
  page: {
    kicker: "Einstellungen",
    title: "Einstellungen für den lokalen Arbeitsbereich",
    description: "Konfiguration minimal halten — nur festlegen, was die Forschung wirklich braucht.",
  },
  theme: {
    title: "Erscheinungsbild",
    description:
      "Änderungen gelten sofort; die Designauswahl wird nur in diesem Browser gespeichert.",
    aria: "Erscheinungsbild",
    swatchTitle: "Hintergrund / Akzent / Sekundärakzent",
    "lamplit-study": { name: "Lamplit Study", description: "Graphit & Messing — ein stilles Studierzimmer" },
    "bio-luminal": { name: "Bio-luminal", description: "Tiefsee-Dunkelfeld — schimmerndes Cyan & Violett" },
  },
  core: {
    title: "Verbindung zum Desktop-Kern",
    descriptionChecking:
      "Prüft Protokoll- und Versionskompatibilität mit dem Rust-Forschungskern.",
    descriptionOnline: "Der Rust-Forschungskern ist online; Protokollversionen unten.",
    checking: "Wird geprüft…",
    online: "Online",
    offline: "Offline",
    unreachable: "Desktop-Kern nicht erreichbar",
    retry: "Verbindung erneut versuchen",
    appVersion: "App-Version",
    ipcProtocol: "IPC-Protokoll",
    workerProtocol: "Worker-Protokoll",
    dbSchema: "Datenbankschema",
    transport: "Transport",
    transportIpc: "Desktop-IPC",
    transportMock: "Web-Vorschau (Mock)",
  },
  providers: {
    title: "KI-Anbieter-Schlüssel",
    description:
      "API-Schlüssel für OpenAI-kompatible oder lokale Modelldienste speichern; Schlüssel gelangen ausschließlich in den Schlüsselbund des Betriebssystems.",
    count: "{{total}} Anbieter",
    empty: {
      title: "Keine Anbieter konfiguriert",
      description:
        "Anbieter in der Konfigurationsdatei der Desktop-App registrieren, dann hier ihre Schlüssel speichern.",
    },
    listAria: "Anbieterschlüssel-Liste",
    keyConfigured: "Schlüssel konfiguriert",
    keyMissing: "Kein Schlüssel konfiguriert",
    keyLabel: "API-Schlüssel für {{provider}}",
    keyPlaceholder: "API-Schlüssel für {{provider}} eingeben (wird im Schlüsselbund des Betriebssystems gespeichert)",
    save: "Schlüssel speichern",
    keyHint:
      "Der Schlüssel wird im Schlüsselbund des Betriebssystems ({{ref}}) abgelegt; nur die Referenz wird gespeichert, und die Oberfläche zeigt den Wert nie wieder an.",
    toastSaved: {
      title: "Schlüssel gespeichert",
      detail: "Der API-Schlüssel für „{{provider}}“ wurde im Schlüsselbund des Betriebssystems abgelegt.",
    },
    toastFailed: {
      title: "Speichern des Schlüssels fehlgeschlagen",
    },
  },
  journal: {
    title: "Privates Journal",
    description: "Das Journal wird ausschließlich lokal gespeichert und nie in Forschungsaufgaben einbezogen.",
    enabled: "Aktiviert",
    open: "Journal öffnen →",
  },
};

export default settings;
