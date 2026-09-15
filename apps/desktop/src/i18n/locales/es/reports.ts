/**
 * Spanish reports resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure; glossary: fuente, nodo de
 * conocimiento, afirmación, cobertura, ejecución).
 */
const reports = {
  kicker: "Informes",
  title: "Informe de investigación del proyecto",
  description:
    "Un resumen de una página generado a partir de las fuentes, el conocimiento y la cobertura del proyecto actual; la exportación completa llegará más adelante.",
  empty: {
    title: "Nada que informar todavía",
    description:
      "Cuando las ejecuciones de investigación produzcan fuentes, nodos de conocimiento y afirmaciones, el informe del proyecto se resumirá aquí.",
  },
  metrics: {
    sources: "Fuentes",
    knowledge: "Nodos de conocimiento",
    claims: "Afirmaciones",
    coverage: "Cobertura de investigación",
  },
  dimensions: {
    kicker: "Cobertura",
    title: "Tabla de cobertura por dimensión",
    caption: "Cobertura e insumos clave por dimensión de investigación",
    colDimension: "Dimensión",
    colCoverage: "Cobertura",
    colTasks: "Tareas completadas",
    colNodes: "Nodos de conocimiento",
    colQualitySources: "Fuentes de alta calidad",
  },
  runs: {
    kicker: "Historial de ejecuciones",
    title: "Ejecuciones de investigación recientes",
    empty: "Aún no hay ejecuciones de investigación; los eventos aparecerán aquí cuando inicie una.",
  },
  export: {
    kicker: "Exportación",
    soon: "Próximamente",
    title: "Exportar informe",
    description:
      "El informe completo y la exportación del Vault llegarán tras integrar el flujo; por ahora esta página resume los datos.",
  },
};

export default reports;
