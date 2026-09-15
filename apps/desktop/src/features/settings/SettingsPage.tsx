import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Palette, ScrollText, Server, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  SegmentedControl,
  useToast,
} from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  THEME_IDS,
  useThemeStore,
  type ThemeId,
} from "@/stores/themeStore";
import { useLanguageStore, type LanguageId } from "@/stores/languageStore";
import { getTransportKind } from "@/services/transportProvider";
import {
  useCoreInfo,
  useProviderKeys,
  useSetProviderKey,
} from "@/services/queries";
import { isMorphoError } from "@/services/errors";
import type { ProviderKeyStatus } from "@/types/domain";

/**
 * 本地工作区设置（spec §6.8）。真实桌面能力接线：
 *  - 桌面核心连接状态来自 core.info（Rust `core_info` 能力信封）；
 *  - AI Provider 密钥经 secrets.listProviders / secrets.setProviderKey 直达
 *    OS keychain（RUST-04）：密钥值只在提交动作期间存在（受控输入 +
 *    mutation 调用），绝不写入 localStorage、URL 或任何持久化状态；
 *    界面只回读 keychain 引用与“是否已配置”，永远拿不到值本身。
 */

function SettingsCard({
  icon: Icon,
  title,
  description,
  value,
  children,
  testId,
}: {
  /** lucide component (COMPONENT_REGISTRY.md "Iconography"), never a glyph. */
  icon: LucideIcon;
  title: string;
  description: string;
  value?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <Card
      data-testid={testId}
      className="grid grid-cols-[36px_1fr] items-start gap-md p-lg md:grid-cols-[36px_1fr_auto]"
    >
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-info"
      >
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <h2 className="text-h3 text-text-primary">{title}</h2>
        <p className="mb-sm text-caption text-text-secondary">{description}</p>
        {children}
      </div>
      {value !== undefined ? (
        <span className="pt-xs text-caption text-text-muted md:justify-self-end">
          {value}
        </span>
      ) : null}
    </Card>
  );
}

/** 外观主题卡的展示元数据（store 保持 data-only，文案跟随 workspaceStore 先例）。 */
const THEME_OPTION_META: Record<ThemeId, { name: string; description: string }> =
  {
    "lamplit-study": { name: "深夜研究室", description: "石墨黄铜·安静书房" },
    "bio-luminal": { name: "生物荧光", description: "深海暗场·荧光青紫" },
  };

/**
 * Preview-only palette literals (ADR-022 preview swatches): each option must
 * depict its own skin's FIXED palette — background / accent / accent-alt from
 * packages/ui/src/tokens.css — so these dots deliberately do NOT ride the
 * live theme tokens; reading tokens would render both options identically
 * and the preview would carry no information. This is the page's one
 * sanctioned literal use; all surrounding chrome still consumes tokens only
 * (DESIGN_TOKENS.md / ADR-013).
 */
const THEME_PREVIEW_COLORS: Record<ThemeId, [string, string, string]> = {
  "lamplit-study": ["#131312", "#d9a05b", "#7fa5a3"],
  "bio-luminal": ["#0c1220", "#53d7f5", "#b8a5ff"],
};

/**
 * Interface language row (ADR-023): the registered SegmentedControl primitive
 * drives the language store — instant apply, persisted to
 * localStorage["morpho.lang"], <html lang> kept in lockstep. Option labels
 * are locale-invariant self-names (each language in its own language), so
 * they are constants rather than resource strings. Radiogroup a11y comes
 * from the primitive (role=radiogroup/radio, aria-checked, roving tabindex,
 * Arrow/Home/End with wrap) — the same contract as the theme options above.
 */
function LanguageRow() {
  const { t } = useTranslation("settings");
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <div className="mt-sm flex items-center justify-between gap-sm border-t border-border pt-sm">
      <span className="text-caption text-text-secondary">
        {t("language.label")}
      </span>
      <SegmentedControl
        options={[
          { value: "zh-CN", label: "简体中文" },
          { value: "en", label: "English" },
        ]}
        value={language}
        onChange={(value) => setLanguage(value as LanguageId)}
        label={t("language.aria")}
      />
    </div>
  );
}

/**
 * 外观主题卡：双皮肤即时切换（无保存按钮）。A11y 沿用 SegmentedControl 的
 * radiogroup 模式（role=radiogroup/radio + aria-checked + roving tabindex，
 * Arrow/Home/End 移动选择、焦点跟随并首尾回绕）；选中态复用效果层
 * `option-selected` 类，与 ConfigPage 来源偏好卡的视觉一致。
 * 卡片底部附带界面语言行（ADR-023）。
 */
function ThemePickerCard() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const groupRef = useRef<HTMLDivElement>(null);

  function moveTo(index: number) {
    const count = THEME_IDS.length;
    const bounded = ((index % count) + count) % count;
    setTheme(THEME_IDS[bounded]);
    const radios = groupRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    );
    radios?.[bounded]?.focus();
  }

  function handleKeydown(event: KeyboardEvent<HTMLDivElement>) {
    const radios = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ??
        [],
    );
    if (radios.length === 0) return;
    const currentIndex = Math.max(
      0,
      radios.indexOf(document.activeElement as HTMLButtonElement),
    );
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = currentIndex + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = currentIndex - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = THEME_IDS.length - 1;
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  }

  return (
    <SettingsCard
      testId="theme-card"
      icon={Palette}
      title="外观主题"
      description="切换即时生效；皮肤偏好只保存在本机浏览器。"
      value={THEME_OPTION_META[theme].name}
    >
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="外观主题"
        onKeyDown={handleKeydown}
        data-testid="theme-options"
        className="grid grid-cols-1 gap-sm sm:grid-cols-2"
      >
        {THEME_IDS.map((id) => {
          const selected = id === theme;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-testid={`theme-option-${id}`}
              onClick={() => setTheme(id)}
              className={`grid cursor-pointer grid-cols-[auto_1fr] gap-sm rounded-md border p-md text-left transition-colors duration-[var(--morpho-motion-fast)] ${
                selected
                  ? "option-selected"
                  : "border-border hover:bg-overlay-hover"
              }`}
            >
              <span
                aria-hidden="true"
                title="背景 / 强调 / 次强调"
                className="flex flex-col justify-center gap-xs"
              >
                {THEME_PREVIEW_COLORS[id].map((hex) => (
                  <span
                    key={hex}
                    className="size-3 rounded-full border border-border"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </span>
              <span>
                <strong className="block text-caption text-text-primary">
                  {THEME_OPTION_META[id].name}
                </strong>
                <small className="mt-1 block text-caption text-text-muted">
                  {THEME_OPTION_META[id].description}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      <LanguageRow />
    </SettingsCard>
  );
}

/** 桌面核心连接状态卡：core.info 成功=在线，失败=离线（mock 传输下同样可显示）。 */
function CoreStatusCard() {
  const core = useCoreInfo();
  const transportKind = getTransportKind();

  if (core.isLoading) {
    return (
      <SettingsCard
        testId="core-status-card"
        icon={Server}
        title="桌面核心连接"
        description="检测 Rust 研究核心的协议与版本兼容性。"
        value={<span role="status">检测中…</span>}
      />
    );
  }
  if (core.isError) {
    return (
      <SettingsCard
        testId="core-status-card"
        icon={Server}
        title="桌面核心连接"
        description="检测 Rust 研究核心的协议与版本兼容性。"
        value={<Badge variant="warning">离线</Badge>}
      >
        <div className="flex flex-col gap-sm">
          <Alert variant="error" title="无法连接桌面核心">
            {isMorphoError(core.error)
              ? core.error.userMessage
              : "发生未知错误，请重试。"}
          </Alert>
          <Button size="sm" variant="secondary" onClick={() => void core.refetch()}>
            重试连接
          </Button>
        </div>
      </SettingsCard>
    );
  }
  const info = core.data;
  if (!info) {
    return (
      <SettingsCard
        testId="core-status-card"
        icon={Server}
        title="桌面核心连接"
        description="检测 Rust 研究核心的协议与版本兼容性。"
        value={<span role="status">检测中…</span>}
      />
    );
  }
  return (
    <SettingsCard
      testId="core-status-card"
      icon={Server}
      title="桌面核心连接"
      description="Rust 研究核心在线；协议版本如下。"
      value={
        <Badge variant="success" data-testid="core-status-badge">
          在线
        </Badge>
      }
    >
      <dl className="grid grid-cols-1 gap-xs text-caption sm:grid-cols-2" data-testid="core-info-grid">
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">应用版本</dt>
          <dd className="font-mono text-text-primary">{info.app_version}</dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">IPC 协议</dt>
          <dd className="font-mono text-text-primary">{info.ipc_schema_version}</dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">Worker 协议</dt>
          <dd className="font-mono text-text-primary">{info.worker_protocol_version}</dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">数据库 Schema</dt>
          <dd className="font-mono text-text-primary">v{info.database_schema_version}</dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">传输通道</dt>
          <dd className="font-mono text-text-primary" data-testid="core-transport">
            {transportKind === "tauri" ? "桌面 IPC" : "网页预览（mock）"}
          </dd>
        </div>
      </dl>
    </SettingsCard>
  );
}

/** 单个 Provider 的密钥录入行；值只活在受控输入里，提交后立即清除。 */
function ProviderKeyRow({
  provider,
  saving,
  onSave,
}: {
  provider: ProviderKeyStatus;
  saving: boolean;
  onSave: (provider: string, apiKey: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");

  function submit() {
    if (!apiKey.trim() || saving) return;
    // The value leaves with the submit action and is cleared right away —
    // it must never linger in component state past the click.
    onSave(provider.name, apiKey);
    setApiKey("");
  }

  const inputId = `provider-key-${provider.name}`;
  return (
    <li
      data-testid="provider-key-row"
      className="flex flex-col gap-sm rounded-md border border-border p-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="min-w-0">
          <strong className="text-body text-text-primary">{provider.name}</strong>
          <span className="ml-sm text-caption text-text-muted" title={provider.base_url}>
            {provider.model} · {provider.base_url}
          </span>
        </div>
        {provider.has_key ? (
          <Badge variant="success" data-testid="provider-key-status">
            密钥已配置
          </Badge>
        ) : (
          <Badge variant="neutral" data-testid="provider-key-status">
            未配置密钥
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-xs sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-xs">
          <label htmlFor={inputId} className="sr-only">
            {provider.name} API Key
          </label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={`输入 ${provider.name} 的 API Key（存入系统钥匙串）`}
            aria-describedby={`${inputId}-hint`}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={saving}
          disabled={!apiKey.trim()}
          onClick={submit}
        >
          保存密钥
        </Button>
      </div>
      <p id={`${inputId}-hint`} className="text-caption text-text-muted">
        密钥写入操作系统钥匙串（{provider.key_ref.provider}/{provider.key_ref.key_name}），
        仅保存引用；界面不会再次显示密钥值。
      </p>
    </li>
  );
}

/** AI Provider 密钥卡：列表 + 每行录入。 */
function ProviderKeysCard() {
  const providers = useProviderKeys();
  const setProviderKey = useSetProviderKey();
  const { showToast } = useToast();

  function save(provider: string, apiKey: string) {
    void setProviderKey
      .mutateAsync({ provider, api_key: apiKey })
      .then(() => {
        showToast({
          title: "密钥已保存",
          detail: `「${provider}」的 API Key 已写入系统钥匙串。`,
          variant: "success",
        });
      })
      .catch((error: unknown) => {
        showToast({
          title: "密钥保存失败",
          detail: isMorphoError(error)
            ? error.userMessage
            : "发生未知错误，请重试。",
          variant: "error",
        });
      });
  }

  return (
    <SettingsCard
      testId="provider-keys-card"
      icon={Sparkles}
      title="AI Provider 密钥"
      description="为 OpenAI-compatible 或本地模型服务保存 API Key；密钥只进入系统钥匙串。"
      value={
        providers.data ? (
          <span data-testid="provider-count">
            {providers.data.length} 个 Provider
          </span>
        ) : undefined
      }
    >
      <PageStates
        isLoading={providers.isLoading}
        error={providers.error}
        onRetry={() => void providers.refetch()}
        isEmpty={(providers.data ?? []).length === 0 && !providers.isLoading}
        empty={{
          title: "尚未配置 Provider",
          description: "在桌面版的应用配置文件中登记 Provider 后，可在此保存密钥。",
        }}
      >
        <ul className="flex flex-col gap-sm" aria-label="Provider 密钥列表">
          {(providers.data ?? []).map((provider) => (
            <ProviderKeyRow
              key={provider.name}
              provider={provider}
              saving={setProviderKey.isPending}
              onSave={save}
            />
          ))}
        </ul>
      </PageStates>
    </SettingsCard>
  );
}

export function SettingsPage() {
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);

  return (
    <PageShell
      kicker="设置"
      title="本地工作区设置"
      description="保持最少配置，只设置研究真正需要的内容。"
    >
      <div className="grid max-w-[850px] gap-md" data-testid="settings-grid">
        {/* 外观主题置顶：页面里唯一纯本地、同步、无加载/失败态的即时偏好，
            先给用户一个稳定可操作的锚点；其余三张卡都是集成面（连接诊断、
            钥匙串写入、日志导航），可能进入 loading/error。 */}
        <ThemePickerCard />
        <CoreStatusCard />
        <ProviderKeysCard />
        <SettingsCard
          icon={ScrollText}
          title="私有对话日志"
          description="日志默认只在本机保存，不参与研究任务。"
          value="已启用"
        >
          <Button size="sm" variant="ghost" onClick={() => setActiveView("journal")}>
            打开日志 →
          </Button>
        </SettingsCard>
      </div>
    </PageShell>
  );
}
