/**
 * Spanish settings resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure). Language option labels
 * ("简体中文"/"English") are locale-invariant self-names and stay in the
 * component, as do the config page's source-language checkboxes ("中文").
 * Theme names/descriptions are the product's skin brand copy.
 */
const settings = {
  language: {
    label: "Idioma",
    aria: "Idioma de la interfaz",
    description:
      "El idioma de la interfaz se aplica al instante; la preferencia se guarda solo en este navegador.",
  },
  page: {
    kicker: "Configuración",
    title: "Ajustes del espacio de trabajo local",
    description: "Mantén la configuración mínima: ajusta solo lo que la investigación necesita de verdad.",
  },
  theme: {
    title: "Tema de apariencia",
    description:
      "Los cambios se aplican al instante; la preferencia de tema se guarda solo en este navegador.",
    aria: "Tema de apariencia",
    swatchTitle: "Fondo / acento / acento secundario",
    "lamplit-study": { name: "Estudio nocturno", description: "Grafito y latón: un estudio tranquilo" },
    "bio-luminal": { name: "Bioluminiscencia", description: "Campo oscuro abisal: brillo cian y violeta" },
  },
  core: {
    title: "Conexión con el núcleo de escritorio",
    descriptionChecking:
      "Comprueba la compatibilidad de protocolo y versión con el núcleo de investigación Rust.",
    descriptionOnline: "El núcleo de investigación Rust está en línea; versiones de protocolo abajo.",
    checking: "Comprobando…",
    online: "En línea",
    offline: "Sin conexión",
    unreachable: "No se puede conectar con el núcleo de escritorio",
    retry: "Reintentar conexión",
    appVersion: "Versión de la app",
    ipcProtocol: "Protocolo IPC",
    workerProtocol: "Protocolo Worker",
    dbSchema: "Esquema de base de datos",
    transport: "Canal de transporte",
    transportIpc: "IPC de escritorio",
    transportMock: "Vista previa web (mock)",
  },
  providers: {
    title: "Claves de proveedores de IA",
    description:
      "Guarda claves de API para servicios compatibles con OpenAI o modelos locales; las claves solo entran en el llavero del sistema.",
    count: "{{total}} proveedores",
    empty: {
      title: "No hay proveedores configurados",
      description:
        "Registra los proveedores en el archivo de configuración de la app de escritorio y guarda sus claves aquí.",
    },
    listAria: "Lista de claves de proveedores",
    keyConfigured: "Clave configurada",
    keyMissing: "Sin clave configurada",
    keyLabel: "Clave de API de {{provider}}",
    keyPlaceholder: "Introduce la clave de API de {{provider}} (se guarda en el llavero del sistema)",
    save: "Guardar clave",
    keyHint:
      "La clave se escribe en el llavero del sistema operativo ({{ref}}); solo se almacena la referencia y la interfaz nunca vuelve a mostrar el valor.",
    toastSaved: {
      title: "Clave guardada",
      detail: "La clave de API de «{{provider}}» se escribió en el llavero del sistema.",
    },
    toastFailed: {
      title: "No se pudo guardar la clave",
    },
  },
  journal: {
    title: "Diario privado",
    description: "El diario se guarda solo localmente y nunca participa en tareas de investigación.",
    enabled: "Habilitado",
    open: "Abrir diario →",
  },
};

export default settings;
