/**
 * ko settings resources (ADR-023): Korean translation of the settings page.
 * Language option labels ("简体中文"/"English") are locale-invariant
 * self-names and stay in the component, as do the config page's
 * source-language checkboxes ("中文"). Glossary: API 키 / 키체인 /
 * 설정 파일 / 외관 테마.
 */
const settings = {
  language: {
    label: "언어",
    aria: "인터페이스 언어",
    description: "인터페이스 언어는 즉시 적용되며, 설정은 이 브라우저에만 저장됩니다.",
  },
  page: {
    kicker: "설정",
    title: "로컬 워크스페이스 설정",
    description: "설정은 최소로 유지하고, 리서치에 정말 필요한 항목만 설정하세요.",
  },
  theme: {
    title: "외관 테마",
    description: "변경 즉시 적용되며, 테마 설정은 이 브라우저에만 저장됩니다.",
    aria: "외관 테마",
    swatchTitle: "배경 / 강조 / 보조 강조",
    "lamplit-study": { name: "심야 연구실", description: "흑연과 황동 — 조용한 서재" },
    "bio-luminal": { name: "생체 발광", description: "심해의 어둠 — 시안과 보라빛" },
  },
  core: {
    title: "데스크톱 코어 연결",
    descriptionChecking: "Rust 리서치 코어와의 프로토콜 및 버전 호환성을 확인합니다.",
    descriptionOnline: "Rust 리서치 코어가 온라인입니다. 프로토콜 버전은 아래와 같습니다.",
    checking: "확인 중…",
    online: "온라인",
    offline: "오프라인",
    unreachable: "데스크톱 코어에 연결할 수 없습니다",
    retry: "연결 재시도",
    appVersion: "앱 버전",
    ipcProtocol: "IPC 프로토콜",
    workerProtocol: "Worker 프로토콜",
    dbSchema: "데이터베이스 스키마",
    transport: "전송 계층",
    transportIpc: "데스크톱 IPC",
    transportMock: "웹 미리보기 (목)",
  },
  providers: {
    title: "AI 프로바이더 키",
    description:
      "OpenAI 호환 또는 로컬 모델 서비스의 API 키를 저장합니다. 키는 시스템 키체인에만 저장됩니다.",
    count: "프로바이더 {{total}}개",
    empty: {
      title: "등록된 프로바이더가 없습니다",
      description:
        "데스크톱 앱의 설정 파일에 프로바이더를 등록하면 여기서 키를 저장할 수 있습니다.",
    },
    listAria: "프로바이더 키 목록",
    keyConfigured: "키 설정됨",
    keyMissing: "키 미설정",
    keyLabel: "{{provider}} API 키",
    keyPlaceholder: "{{provider}}의 API 키 입력 (시스템 키체인에 저장)",
    save: "키 저장",
    keyHint:
      "키는 운영체제 키체인({{ref}})에 기록되며 참조만 저장됩니다. UI에서 키 값을 다시 표시하지 않습니다.",
    toastSaved: {
      title: "키 저장됨",
      detail: "'{{provider}}'의 API 키를 시스템 키체인에 기록했습니다.",
    },
    toastFailed: {
      title: "키 저장 실패",
    },
  },
  journal: {
    title: "비공개 저널",
    description: "저널은 로컬에만 저장되며 리서치 태스크에 사용되지 않습니다.",
    enabled: "사용함",
    open: "저널 열기 →",
  },
};

export default settings;
