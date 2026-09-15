/**
 * Brazilian Portuguese shell resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure). Brand names
 * ("Morpho", "Research project" fragment) follow the en reference and stay
 * as-is.
 */
const shell = {
  // Workspace view nav labels (workspaceStore WORKSPACE_VIEWS).
  nav: {
    projects: "Minhas pesquisas",
    overview: "Resumo",
    config: "Configuração de pesquisa",
    plan: "Plano de pesquisa",
    tasks: "Tarefas",
    sources: "Fontes",
    knowledge: "Conhecimento",
    graph: "Grafo",
    journal: "Diário",
    settings: "Configurações",
    reports: "Relatórios",
  },

  // Topbar
  breadcrumb: "Trilha de navegação",
  noProjectSelected: "Nenhum projeto selecionado",
  saved: "Salvo",
  helpUnavailable: "A documentação de ajuda não está disponível na versão local",
  help: "Ajuda",
  localUser: "Usuário local",

  // Topbar quick menus (I3): language + skin popovers. The language options
  // themselves are locale-invariant self-names from `LANGUAGES` (src/i18n),
  // and skin names resolve through t("settings:theme.<id>.name").
  languageMenu: "Alternar o idioma da interface",
  languageList: "Idioma da interface",
  skinMenu: "Alternar o tema de aparência",
  skinList: "Tema de aparência",

  // Sidebar
  primaryNav: "Navegação principal",
  localWorkspace: "Espaço de trabalho local",
  dataStaysLocal: "Os dados ficam armazenados neste dispositivo",
  closeNavigation: "Fechar a navegação",
  navigationMenu: "Menu de navegação",

  // WorkspaceLayout + AssistantDock
  skipToContent: "Pular para o conteúdo principal",
  mainViewAria: "Visão de {{view}}",
  openNavigationMenu: "Abrir o menu de navegação",
  menu: "Menu",
  openAssistant: "Abrir o assistente de IA",
  assistant: "Assistente de IA",
  closeAssistantPanel: "Fechar o painel do assistente",
  assistantPanelAria: "Assistente de IA do Morpho",

  // ProjectSwitcher
  projectSwitcher: {
    loading: "Carregando…",
    noProjectSelected: "Nenhum projeto selecionado",
    researchProject: "Research project",
    currentWorkspace: "Espaço de trabalho atual",
    manageAll: "Gerenciar todos",
    projectListAria: "Lista de projetos",
    emptyProjects: "Ainda não há projetos — crie o primeiro.",
    newProject: "Novo projeto",
    newProjectDialogTitle: "Novo projeto de pesquisa",
    newProjectDialogDescription:
      "Cada projeto tem sua própria configuração, plano, tarefas, conhecimento e contexto do assistente.",
    nameLabel: "Nome do projeto",
    namePlaceholder: "ex.: otimização de inferência de LLM",
    descriptionLabel: "Descrição",
    descriptionPlaceholder:
      "Em uma frase, qual pergunta este projeto deve responder?",
    cancel: "Cancelar",
    create: "Criar projeto",
    nameRequired: "O nome do projeto não pode ficar vazio.",
    createFailed: "Falha ao criar. Tente novamente.",
    status: {
      draft: "Rascunho · não iniciado",
      inProgress: "Em andamento · {{percent}}%",
      paused: "Pausado · {{percent}}%",
    },
  },
};

export default shell;
