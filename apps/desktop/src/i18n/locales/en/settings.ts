/**
 * English settings resources (ADR-023). Only the language control is
 * extracted so far (I1); the remaining SettingsPage card copy is I2's
 * extraction scope. Language option labels ("简体中文"/"English") are
 * locale-invariant self-names and stay in the component.
 */
const settings = {
  language: {
    label: "Language",
    aria: "Interface language",
  },
};

export default settings;
