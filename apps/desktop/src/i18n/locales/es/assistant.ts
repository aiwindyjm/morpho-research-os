/**
 * Spanish assistant resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure). Saving to the journal is
 * always an explicit two-step action; the copy keeps that emphasis.
 */
const assistant = {
  aria: "Asistente de investigación con IA",
  kicker: "Asistente del proyecto activo",
  closeAria: "Cerrar el asistente de IA",
  context: {
    loading: "Cargando el contexto del proyecto…",
    usingBefore: "Ahora usando ",
    usingAfter: " como contexto de investigación",
  },
  navAria: "Acciones del asistente",
  error: {
    title: "Acción no completada",
    fallback: "El asistente no está disponible temporalmente. Inténtalo de nuevo.",
  },
  decision: {
    empty: "Escribe primero el contenido de la decisión.",
    title: "Registrar decisión",
    hint: "Las decisiones se guardan solo dentro de este proyecto; nada se escribe hasta que hagas clic en «Guardar decisión».",
    inputAria: "Contenido de la decisión",
    inputPlaceholder: "p. ej., priorizar fuentes de artículos cuantitativos en la siguiente ronda",
    save: "Guardar decisión",
    saved: "Decisión guardada (guardado explícito; {{total}} en total).",
    listSummary: "Decisiones guardadas ({{total}})",
  },
  journalSave: {
    title: "Guardar la conversación en el diario",
    idle: "Esta conversación tiene {{total}} mensajes; no se escribe nada en el diario local hasta que hagas clic en «Confirmar guardado»: nada se guarda automáticamente.",
    groupAria: "Confirmar el guardado de la conversación",
    confirmDetail:
      "{{total}} mensajes se guardarán en el diario de hoy ({{date}}, solo local).",
    confirm: "Confirmar guardado",
    cancel: "Cancelar",
    arm: "Guardar en el diario",
    saved: "Se guardaron {{total}} mensajes en el diario de hoy.",
    viewJournal: "Ver diario →",
  },
  toast: {
    savedTitle: "Guardado en el diario",
    savedDetail: "{{total}} mensajes en total (solo local)",
  },
  entry: {
    header: "Conversación guardada desde el asistente de IA (proyecto: {{project}} · ID {{id}})",
    line: "[{{author}}] {{content}}",
    authorLabel: "Usuario",
    unknownProject: "Proyecto desconocido",
  },
  footer: {
    note: "La IA responde según el espacio de trabajo del proyecto actual",
    openJournal: "Diario",
  },
};

export default assistant;
