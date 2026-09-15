/**
 * Russian settings resources (ADR-023). Translation of the en authored
 * strings (zh-CN is the reference for structure). Language option labels
 * ("简体中文"/"English") are locale-invariant self-names and stay in the
 * component, as do the config page's source-language checkboxes ("中文").
 * Theme names/descriptions are the product's skin brand copy.
 */
const settings = {
  language: {
    label: "Язык",
    aria: "Язык интерфейса",
    description:
      "Язык интерфейса применяется мгновенно; настройка хранится только в этом браузере.",
  },
  page: {
    kicker: "Настройки",
    title: "Настройки локальной рабочей области",
    description: "Держите конфигурацию минимальной — настраивайте только то, что действительно нужно исследованию.",
  },
  theme: {
    title: "Тема оформления",
    description:
      "Переключение применяется мгновенно; выбор темы хранится только в этом браузере.",
    aria: "Тема оформления",
    swatchTitle: "Фон / акцент / второй акцент",
    "lamplit-study": { name: "Ламповый кабинет", description: "Графит и латунь — тихий кабинет" },
    "bio-luminal": { name: "Биолюминесценция", description: "Глубоководная тьма — бирюзово-фиолетовое свечение" },
  },
  core: {
    title: "Подключение к ядру настольной версии",
    descriptionChecking:
      "Проверяет совместимость протокола и версии с исследовательским ядром Rust.",
    descriptionOnline: "Исследовательское ядро Rust в сети; версии протоколов ниже.",
    checking: "Проверка…",
    online: "В сети",
    offline: "Не в сети",
    unreachable: "Не удаётся подключиться к ядру настольной версии",
    retry: "Повторить подключение",
    appVersion: "Версия приложения",
    ipcProtocol: "Протокол IPC",
    workerProtocol: "Протокол Worker",
    dbSchema: "Схема базы данных",
    transport: "Транспорт",
    transportIpc: "Настольный IPC",
    transportMock: "Веб-предпросмотр (mock)",
  },
  providers: {
    title: "Ключи ИИ-провайдеров",
    description:
      "Сохраняйте API-ключи для сервисов, совместимых с OpenAI, или локальных моделей; ключи попадают только в связку ключей системы.",
    count: "Провайдеров: {{total}}",
    empty: {
      title: "Провайдеры не настроены",
      description:
        "Зарегистрируйте провайдеров в конфигурационном файле настольного приложения, затем сохраните их ключи здесь.",
    },
    listAria: "Список ключей провайдеров",
    keyConfigured: "Ключ настроен",
    keyMissing: "Ключ не настроен",
    keyLabel: "API-ключ {{provider}}",
    keyPlaceholder: "Введите API-ключ для {{provider}} (сохраняется в связке ключей системы)",
    save: "Сохранить ключ",
    keyHint:
      "Ключ записывается в связку ключей операционной системы ({{ref}}); сохраняется только ссылка, и интерфейс больше не показывает значение.",
    toastSaved: {
      title: "Ключ сохранён",
      detail: "API-ключ для «{{provider}}» записан в связку ключей системы.",
    },
    toastFailed: {
      title: "Не удалось сохранить ключ",
    },
  },
  journal: {
    title: "Личный журнал",
    description: "Журнал хранится только локально и никогда не участвует в исследовательских задачах.",
    enabled: "Включён",
    open: "Открыть журнал →",
  },
};

export default settings;
