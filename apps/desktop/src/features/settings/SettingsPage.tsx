import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Globe, Palette, ScrollText, Server, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  useToast,
} from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { THEME_PREVIEW_COLORS } from "@/components/themePreviewColors";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { THEME_IDS, useThemeStore } from "@/stores/themeStore";
import { LANGUAGES } from "@/i18n";
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
 * All chrome strings go through t() (ADR-023, "settings" namespace).
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

/**
 * 外观主题卡的展示元数据：皮肤名称/描述是 i18n 资源键（settings 命名空间，
 * `theme.<id>.name|description`），组件在渲染时经 t() 解析；store 保持
 * data-only（文案跟随 workspaceStore 先例）。
 */
const THEME_IDS_LITERAL = THEME_IDS;

/**
 * Preview swatches moved to `@/components/themePreviewColors` (I3): the
 * Topbar skin quick menu renders the same per-skin fixed palette, so the
 * sanctioned literals live in one shared module.
 */

/**
 * Shared roving-tabindex keyboard handler for the card radiogroups (theme +
 * language, I3): Arrow keys move the selection one option (linear order,
 * both ends wrapping), Home/End jump; selection follows focus (WAI-ARIA
 * radiogroup). `select` receives the bounded index and the option buttons so
 * the card can apply its store write and move focus.
 */
function handleRovingKeydown(
  event: KeyboardEvent<HTMLDivElement>,
  count: number,
  select: (index: number, radios: HTMLButtonElement[]) => void,
) {
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
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
  else if (event.key === "End") next = count - 1;
  if (next === null) return;
  event.preventDefault();
  select(((next % count) + count) % count, radios);
}

/**
 * 界面语言卡 (I3): the full ten-language selection replaces the former
 * 2-option SegmentedControl row (maintainer feedback — two options were too
 * exclusive, and the row had no room for ten). Radiogroup grid of
 * locale-invariant self-names (native name primary, English name as the
 * quiet secondary line for users who cannot yet read the script) — the same
 * radiogroup contract as the theme options above (role=radiogroup/radio +
 * aria-checked + roving tabindex via handleRovingKeydown, instant apply,
 * persisted to localStorage["morpho.lang"], <html lang> kept in lockstep).
 * The topbar quick menu covers the fast path; this card stays the
 * full-control surface.
 */
function LanguagePickerCard() {
  const { t } = useTranslation("settings");
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <SettingsCard
      testId="language-card"
      icon={Globe}
      title={t("language.label")}
      description={t("language.description")}
      value={LANGUAGES.find((l) => l.id === language)?.nativeName}
    >
      <div
        role="radiogroup"
        aria-label={t("language.aria")}
        onKeyDown={(event) =>
          handleRovingKeydown(event, LANGUAGES.length, (index, radios) => {
            const next = LANGUAGES[index];
            if (!next) return;
            setLanguage(next.id);
            radios[index]?.focus();
          })
        }
        data-testid="language-options"
        className="grid grid-cols-2 gap-sm sm:grid-cols-3"
      >
        {LANGUAGES.map((l) => {
          const selected = l.id === language;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-testid={`language-option-${l.id}`}
              onClick={() => setLanguage(l.id as LanguageId)}
              className={`cursor-pointer rounded-md border p-md text-left transition-colors duration-[var(--morpho-motion-fast)] ${
                selected
                  ? "option-selected"
                  : "border-border hover:bg-overlay-hover"
              }`}
            >
              <strong className="block text-caption text-text-primary">
                {l.nativeName}
              </strong>
              <small className="mt-1 block text-caption text-text-muted">
                {l.englishName}
              </small>
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}

/**
 * 外观主题卡：双皮肤即时切换（无保存按钮）。A11y 沿用 radiogroup 模式
 * （role=radiogroup/radio + aria-checked + roving tabindex，Arrow/Home/End
 * 经共享的 handleRovingKeydown 移动选择、焦点跟随并首尾回绕）；选中态复用
 * 效果层 `option-selected` 类，与 ConfigPage 来源偏好卡的视觉一致。I3 起
 * 顶栏皮肤快捷菜单共享同一 store 与预览色板。
 */
function ThemePickerCard() {
  const { t } = useTranslation("settings");
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <SettingsCard
      testId="theme-card"
      icon={Palette}
      title={t("theme.title")}
      description={t("theme.description")}
      value={t(`theme.${theme}.name`)}
    >
      <div
        role="radiogroup"
        aria-label={t("theme.aria")}
        onKeyDown={(event) =>
          handleRovingKeydown(event, THEME_IDS_LITERAL.length, (index, radios) => {
            const next = THEME_IDS_LITERAL[index];
            if (!next) return;
            setTheme(next);
            radios[index]?.focus();
          })
        }
        data-testid="theme-options"
        className="grid grid-cols-1 gap-sm sm:grid-cols-2"
      >
        {THEME_IDS_LITERAL.map((id) => {
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
                title={t("theme.swatchTitle")}
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
                  {t(`theme.${id}.name`)}
                </strong>
                <small className="mt-1 block text-caption text-text-muted">
                  {t(`theme.${id}.description`)}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}

/** 桌面核心连接状态卡：core.info 成功=在线，失败=离线（mock 传输下同样可显示）。 */
function CoreStatusCard() {
  const { t } = useTranslation("settings");
  const core = useCoreInfo();
  const transportKind = getTransportKind();

  if (core.isLoading) {
    return (
      <SettingsCard
        testId="core-status-card"
        icon={Server}
        title={t("core.title")}
        description={t("core.descriptionChecking")}
        value={<span role="status">{t("core.checking")}</span>}
      />
    );
  }
  if (core.isError) {
    return (
      <SettingsCard
        testId="core-status-card"
        icon={Server}
        title={t("core.title")}
        description={t("core.descriptionChecking")}
        value={<Badge variant="warning">{t("core.offline")}</Badge>}
      >
        <div className="flex flex-col gap-sm">
          <Alert variant="error" title={t("core.unreachable")}>
            {isMorphoError(core.error)
              ? core.error.userMessage
              : t("common:error.unknown")}
          </Alert>
          <Button size="sm" variant="secondary" onClick={() => void core.refetch()}>
            {t("core.retry")}
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
        title={t("core.title")}
        description={t("core.descriptionChecking")}
        value={<span role="status">{t("core.checking")}</span>}
      />
    );
  }
  return (
    <SettingsCard
      testId="core-status-card"
      icon={Server}
      title={t("core.title")}
      description={t("core.descriptionOnline")}
      value={
        <Badge variant="success" data-testid="core-status-badge">
          {t("core.online")}
        </Badge>
      }
    >
      <dl className="grid grid-cols-1 gap-xs text-caption sm:grid-cols-2" data-testid="core-info-grid">
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">{t("core.appVersion")}</dt>
          <dd className="font-mono text-text-primary">{info.app_version}</dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">{t("core.ipcProtocol")}</dt>
          <dd className="font-mono text-text-primary">{info.ipc_schema_version}</dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">{t("core.workerProtocol")}</dt>
          <dd className="font-mono text-text-primary">{info.worker_protocol_version}</dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">{t("core.dbSchema")}</dt>
          <dd className="font-mono text-text-primary">v{info.database_schema_version}</dd>
        </div>
        <div className="flex justify-between gap-sm">
          <dt className="text-text-secondary">{t("core.transport")}</dt>
          <dd className="font-mono text-text-primary" data-testid="core-transport">
            {transportKind === "tauri" ? t("core.transportIpc") : t("core.transportMock")}
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
  const { t } = useTranslation("settings");
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
            {t("providers.keyConfigured")}
          </Badge>
        ) : (
          <Badge variant="neutral" data-testid="provider-key-status">
            {t("providers.keyMissing")}
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-xs sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-xs">
          <label htmlFor={inputId} className="sr-only">
            {t("providers.keyLabel", { provider: provider.name })}
          </label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("providers.keyPlaceholder", { provider: provider.name })}
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
          {t("providers.save")}
        </Button>
      </div>
      <p id={`${inputId}-hint`} className="text-caption text-text-muted">
        {t("providers.keyHint", {
          ref: `${provider.key_ref.provider}/${provider.key_ref.key_name}`,
        })}
      </p>
    </li>
  );
}

/** AI Provider 密钥卡：列表 + 每行录入。 */
function ProviderKeysCard() {
  const { t } = useTranslation("settings");
  const providers = useProviderKeys();
  const setProviderKey = useSetProviderKey();
  const { showToast } = useToast();

  function save(provider: string, apiKey: string) {
    void setProviderKey
      .mutateAsync({ provider, api_key: apiKey })
      .then(() => {
        showToast({
          title: t("providers.toastSaved.title"),
          detail: t("providers.toastSaved.detail", { provider }),
          variant: "success",
        });
      })
      .catch((error: unknown) => {
        showToast({
          title: t("providers.toastFailed.title"),
          detail: isMorphoError(error)
            ? error.userMessage
            : t("common:error.unknown"),
          variant: "error",
        });
      });
  }

  return (
    <SettingsCard
      testId="provider-keys-card"
      icon={Sparkles}
      title={t("providers.title")}
      description={t("providers.description")}
      value={
        providers.data ? (
          <span data-testid="provider-count">
            {t("providers.count", { total: providers.data.length })}
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
          title: t("providers.empty.title"),
          description: t("providers.empty.description"),
        }}
      >
        <ul className="flex flex-col gap-sm" aria-label={t("providers.listAria")}>
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
  const { t } = useTranslation("settings");
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);

  return (
    <PageShell
      kicker={t("page.kicker")}
      title={t("page.title")}
      description={t("page.description")}
    >
      <div className="grid max-w-[850px] gap-md" data-testid="settings-grid">
        {/* 外观主题置顶：页面里唯一纯本地、同步、无加载/失败态的即时偏好，
            先给用户一个稳定可操作的锚点；其余三张卡都是集成面（连接诊断、
            钥匙串写入、日志导航），可能进入 loading/error。 */}
        <ThemePickerCard />
        {/* 界面语言（I3）：从主题卡内的一行 SegmentedControl 升级为独立的
            十语言卡片（顶栏快捷菜单之外的全量控制面）。 */}
        <LanguagePickerCard />
        <CoreStatusCard />
        <ProviderKeysCard />
        <SettingsCard
          icon={ScrollText}
          title={t("journal.title")}
          description={t("journal.description")}
          value={t("journal.enabled")}
        >
          <Button size="sm" variant="ghost" onClick={() => setActiveView("journal")}>
            {t("journal.open")}
          </Button>
        </SettingsCard>
      </div>
    </PageShell>
  );
}
