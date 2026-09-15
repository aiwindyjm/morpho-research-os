/**
 * Spanish shell resources (ADR-023). Translation of the en authored strings
 * (zh-CN is the reference for structure). Brand names ("Morpho",
 * "Research project" fragment) follow the en reference and stay as-is.
 */
const shell = {
  // Workspace view nav labels (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "Mi investigación",
    overview: "Resumen",
    config: "Configuración de investigación",
    plan: "Plan de investigación",
    tasks: "Tareas",
    sources: "Fuentes",
    knowledge: "Conocimiento",
    graph: "Grafo",
    journal: "Diario",
    settings: "Configuración",
    reports: "Informes",
  },

  // Topbar
  breadcrumb: "Miga de pan",
  noProjectSelected: "No hay proyecto seleccionado",
  saved: "Guardado",
  helpUnavailable: "La documentación de ayuda no está disponible en la versión local",
  help: "Ayuda",
  localUser: "Usuario local",

  // Topbar quick menus (I3): language + skin popovers. The language options
  // themselves are locale-invariant self-names from `LANGUAGES` (src/i18n),
  // and skin names resolve through t("settings:theme.<id>.name").
  languageMenu: "Cambiar el idioma de la interfaz",
  languageList: "Idioma de la interfaz",
  skinMenu: "Cambiar el tema de apariencia",
  skinList: "Tema de apariencia",

  // Sidebar
  primaryNav: "Navegación principal",
  localWorkspace: "Espacio de trabajo local",
  dataStaysLocal: "Los datos se guardan en este dispositivo",
  closeNavigation: "Cerrar la navegación",
  navigationMenu: "Menú de navegación",

  // WorkspaceLayout + AssistantDock
  skipToContent: "Saltar al contenido principal",
  mainViewAria: "Vista de {{view}}",
  openNavigationMenu: "Abrir el menú de navegación",
  menu: "Menú",
  openAssistant: "Abrir el asistente de IA",
  assistant: "Asistente de IA",
  closeAssistantPanel: "Cerrar el panel del asistente",
  assistantPanelAria: "Asistente de IA de Morpho",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "Cargando…",
    noProjectSelected: "No hay proyecto seleccionado",
    researchProject: "Research project",
    currentWorkspace: "Espacio de trabajo actual",
    manageAll: "Gestionar todos",
    projectListAria: "Lista de proyectos",
    emptyProjects: "Aún no hay proyectos: crea el primero.",
    newProject: "Nuevo proyecto",
    newProjectDialogTitle: "Nuevo proyecto de investigación",
    newProjectDialogDescription:
      "Cada proyecto tiene su propia configuración, plan, tareas, conocimiento y contexto del asistente.",
    nameLabel: "Nombre del proyecto",
    namePlaceholder: "p. ej., optimización de inferencia de LLM",
    descriptionLabel: "Descripción",
    descriptionPlaceholder:
      "En una frase, ¿qué pregunta debe responder este proyecto?",
    cancel: "Cancelar",
    create: "Crear proyecto",
    nameRequired: "El nombre del proyecto no puede quedar vacío.",
    createFailed: "No se pudo crear. Inténtalo de nuevo.",
    status: {
      draft: "Borrador · sin iniciar",
      inProgress: "En curso · {{percent}}%",
      paused: "En pausa · {{percent}}%",
    },
  },
};

export default shell;
