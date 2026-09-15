/**
 * Brazilian Portuguese settings resources (ADR-023). Translation of the en
 * authored strings (zh-CN is the reference for structure). Language option
 * labels ("简体中文"/"English") are locale-invariant self-names and stay in
 * the component, as do the config page's source-language checkboxes ("中文").
 * Theme names/descriptions are the product's skin brand copy.
 */
const settings = {
  language: {
    label: "Idioma",
    aria: "Idioma da interface",
    description:
      "O idioma da interface é aplicado instantaneamente; a preferência é armazenada apenas neste navegador.",
  },
  page: {
    kicker: "Configurações",
    title: "Configurações do espaço de trabalho local",
    description: "Mantenha a configuração mínima — ajuste apenas o que a pesquisa realmente precisa.",
  },
  theme: {
    title: "Tema de aparência",
    description:
      "As trocas são aplicadas instantaneamente; a preferência de tema é armazenada apenas neste navegador.",
    aria: "Tema de aparência",
    swatchTitle: "Fundo / destaque / destaque secundário",
    "lamplit-study": { name: "Estudo noturno", description: "Grafite e latão — um estudo silencioso" },
    "bio-luminal": { name: "Bioluminescência", description: "Campo escuro abissal — brilho ciano e violeta" },
  },
  core: {
    title: "Conexão com o núcleo desktop",
    descriptionChecking:
      "Verifica a compatibilidade de protocolo e versão com o núcleo de pesquisa Rust.",
    descriptionOnline: "O núcleo de pesquisa Rust está on-line; versões de protocolo abaixo.",
    checking: "Verificando…",
    online: "Online",
    offline: "Offline",
    unreachable: "Não é possível conectar ao núcleo desktop",
    retry: "Tentar conexão novamente",
    appVersion: "Versão do app",
    ipcProtocol: "Protocolo IPC",
    workerProtocol: "Protocolo Worker",
    dbSchema: "Esquema do banco de dados",
    transport: "Canal de transporte",
    transportIpc: "IPC desktop",
    transportMock: "Pré-visualização web (mock)",
  },
  providers: {
    title: "Chaves de provedores de IA",
    description:
      "Salve chaves de API para serviços compatíveis com OpenAI ou modelos locais; as chaves vão apenas para o chaveiro do sistema.",
    count: "{{total}} provedores",
    empty: {
      title: "Nenhum provedor configurado",
      description:
        "Registre os provedores no arquivo de configuração do app desktop e salve as chaves aqui.",
    },
    listAria: "Lista de chaves de provedores",
    keyConfigured: "Chave configurada",
    keyMissing: "Nenhuma chave configurada",
    keyLabel: "Chave de API de {{provider}}",
    keyPlaceholder: "Digite a chave de API de {{provider}} (armazenada no chaveiro do sistema)",
    save: "Salvar chave",
    keyHint:
      "A chave é gravada no chaveiro do sistema operacional ({{ref}}); apenas a referência é armazenada e a interface nunca mais exibe o valor.",
    toastSaved: {
      title: "Chave salva",
      detail: "A chave de API de “{{provider}}” foi gravada no chaveiro do sistema.",
    },
    toastFailed: {
      title: "Falha ao salvar a chave",
    },
  },
  journal: {
    title: "Diário privado",
    description: "O diário é armazenado apenas localmente e nunca participa de tarefas de pesquisa.",
    enabled: "Ativado",
    open: "Abrir diário →",
  },
};

export default settings;
