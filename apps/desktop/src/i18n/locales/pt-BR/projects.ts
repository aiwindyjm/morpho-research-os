/**
 * Brazilian Portuguese projects resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure; glossary: projeto,
 * plano, tarefa, fonte, conhecimento, cobertura).
 */
const projects = {
  kicker: "Minhas pesquisas",
  title: "Todos os projetos de pesquisa",
  description:
    "Cada tema é um espaço de pesquisa independente. Troque, continue ou inicie uma nova pesquisa a qualquer momento.",
  newResearch: "Nova pesquisa",
  empty: {
    title: "Ainda não há projetos de pesquisa",
    description:
      "Crie seu primeiro projeto e transforme uma pergunta de pesquisa em uma base de conhecimento em constante crescimento.",
  },
  search: "Buscar minhas pesquisas",
  count: "{{total}} projetos",
  createCard: {
    title: "Iniciar nova pesquisa",
    hint: "Comece com uma pergunta",
  },
  card: {
    openAria: "Abrir projeto",
    statusDraft: "Rascunho",
    statusInProgress: "Em andamento",
    statusPaused: "Pausado",
    coverage: "Cobertura de {{percent}}%",
    notStarted: "Não iniciado",
    taskCount: "{{total}} tarefas",
    updatedAt: "Atualizado em {{date}}",
    progressAria: "Progresso do projeto",
    enterWorkspace: "Abrir espaço de trabalho",
    switchTo: "Alternar para este projeto",
    configure: "Configuração de pesquisa",
  },
  dialog: {
    title: "Novo projeto de pesquisa",
    description:
      "Cada projeto tem sua própria configuração, plano, tarefas, conhecimento e contexto do assistente.",
    nameLabel: "Nome do projeto",
    namePlaceholder: "ex.: otimização de inferência de LLM",
    descriptionLabel: "Descrição",
    descriptionPlaceholder:
      "Em uma frase, qual pergunta este projeto deve responder?",
    cancel: "Cancelar",
    create: "Criar projeto",
  },
  error: {
    nameRequired: "O nome do projeto não pode ficar vazio.",
    createFailed: "Falha ao criar. Tente novamente.",
  },
};

export default projects;
