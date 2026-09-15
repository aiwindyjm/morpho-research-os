/**
 * Spanish journal resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure). The journal is private local-only
 * data (never uploaded, never in Git).
 */
const journal = {
  kicker: "Diario privado",
  title: "Diario",
  description:
    "Las discusiones de hoy sobre arquitectura y producto se quedan en esta máquina: nunca en Git ni en el Vault de investigación.",
  downloadJson: "Descargar JSON",
  downloadMarkdown: "Descargar el Markdown de hoy",
  count: "{{total}} entradas",
  localOnly: "Solo local",
  authorUser: "Usuario",
  listEmpty: "Aún no hay entradas. Anota las decisiones de producto, preguntas o próximos pasos de hoy.",
  inputAria: "Entrada del diario",
  inputPlaceholder: "Registra las decisiones de producto, preguntas o próximos pasos de hoy…",
  errorEmpty: "Escribe primero algo para registrar.",
  storageNote: "Guardado en el almacenamiento local del navegador",
  save: "Guardar entrada",
  rules: {
    kicker: "Reglas de almacenamiento",
    title: "Un registro de desarrollo que es solo tuyo",
    items: {
      byLocalDate: "Agrupadas por fecha local",
      neverUploaded: "Nunca se suben, nunca entran en Git",
      explicitDownload: "Descarga explícita de Markdown cuando haga falta",
      privateFolder: "Se pueden mover a private/conversations/ manualmente",
    },
  },
  limits: {
    title: "Limitaciones actuales",
    detail:
      "La vista previa web no puede escribir directamente en el espacio de trabajo. En la versión de escritorio, el Rust Core añade los archivos locales a diario.",
  },
};

export default journal;
