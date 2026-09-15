import { useState, type ReactNode } from "react";
import {
  Book,
  BookMarked,
  Database,
  FileText,
  GitBranch,
  Globe,
  Play,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Checkbox, Chip, Input, SegmentedControl } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { PurposeSelect } from "@/components/research";
import {
  DEFAULT_DIMENSIONS,
  DEPTH_LEVELS,
  type ResearchConfig,
  type ResearchDepth,
  type SourceType,
} from "@/types/domain";
import { researchConfigSchema } from "@/types/schemas";
import { useConfig, useUpdateConfig } from "@/services/queries";
import { isMorphoError } from "@/services/errors";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Research Configuration view (Form pattern). The structured config — not
 * an unbounded prompt — defines the project (docs/PRD.md §5).
 * Prototype alignment (spec §6.2): one panel with four numbered sections —
 * 01 研究主题 / 02 研究范围 / 03 研究维度 / 04 来源偏好. Every input maps
 * to an existing ResearchConfig field; the useConfig/useUpdateConfig flow,
 * save validation, and error handling are unchanged. The 放弃修改 action
 * (spec States/Interactions) rolls the local draft back to the last-saved
 * server values while staying on the page. All chrome strings go through
 * t() (ADR-023, "config" namespace); the dimension/source-type/depth
 * vocabularies resolve through common:vocab.*.
 */

/** Year ⇄ ISO-8601 mapping for the prototype's year-range inputs. */
function isoToYear(iso: string | null): string {
  if (!iso) return "";
  return String(new Date(iso).getUTCFullYear());
}

const FULL_YEAR_PATTERN = /^(19|20)\d{2}$/;

/**
 * Only complete 19xx/20xx years are converted. Partial input must never
 * reach Date.UTC: it remaps years 0–99 to 1900+y, which would corrupt a
 * controlled input's value mid-typing.
 */
function yearToIso(year: string, edge: "start" | "end"): string | null {
  const trimmed = year.trim();
  if (!FULL_YEAR_PATTERN.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return edge === "start"
    ? new Date(Date.UTC(parsed, 0, 1)).toISOString()
    : new Date(Date.UTC(parsed, 11, 31, 23, 59, 59, 999)).toISOString();
}

/**
 * Year input with a local typing buffer. The draft config only receives
 * complete years (or an explicit empty), so the visible value follows the
 * keystrokes exactly; on blur an incomplete value reverts to the stored
 * config year.
 */
function YearInput({
  label,
  placeholder,
  iso,
  edge,
  onCommit,
}: {
  label: string;
  placeholder: string;
  iso: string | null;
  edge: "start" | "end";
  onCommit: (iso: string | null) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const visible = raw ?? isoToYear(iso);
  return (
    <Input
      type="number"
      aria-label={label}
      placeholder={placeholder}
      value={visible}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        if (next.trim() === "") {
          onCommit(null);
          return;
        }
        const parsed = yearToIso(next, edge);
        if (parsed !== null) onCommit(parsed);
      }}
      onBlur={() => setRaw(null)}
    />
  );
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

/** Source-type preference cards (04 来源偏好); values are the canonical
 * SourceType vocabulary, presentation only. Icons are lucide components
 * (COMPONENT_REGISTRY.md "Iconography"), never glyph characters. The
 * per-type descriptions are i18n resource keys ("config" namespace); the
 * visible type names come from common:vocab.sourceType. */
const SOURCE_TYPE_PREFERENCES: Array<{
  value: SourceType;
  icon: LucideIcon;
  descriptionKey: string;
}> = [
  { value: "paper", icon: FileText, descriptionKey: "paper" },
  { value: "documentation", icon: BookMarked, descriptionKey: "documentation" },
  { value: "web_page", icon: Globe, descriptionKey: "web_page" },
  { value: "repository", icon: GitBranch, descriptionKey: "repository" },
  { value: "dataset", icon: Database, descriptionKey: "dataset" },
  { value: "book", icon: Book, descriptionKey: "book" },
  { value: "video", icon: Play, descriptionKey: "video" },
];

/** Numbered form section from the prototype's form-panel (spec §6.2). */
function FormSection({
  number,
  title,
  help,
  children,
}: {
  number: string;
  title: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-[56px_1fr] gap-md border-b border-border py-lg last:border-b-0">
      <span
        aria-hidden="true"
        className="pt-[3px] font-mono text-micro font-bold text-info"
      >
        {number}
      </span>
      <div>
        <h2 className="text-h3 text-text-primary">{title}</h2>
        <p className="mb-lg mt-[7px] text-caption text-text-muted">{help}</p>
        {children}
      </div>
    </section>
  );
}

export function ConfigPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation("config");
  const { data, isLoading, error, refetch } = useConfig(projectId);
  const updateConfig = useUpdateConfig(projectId);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const [draft, setDraft] = useState<ResearchConfig | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = draft ?? data;
  if (!current && (isLoading || error)) {
    return (
      <PageShell
        kicker={t("kicker")}
        title={t("title")}
        description={t("description")}
      >
        <PageStates
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          isEmpty={false}
          empty={{ title: "", description: "" }}
        >
          {null}
        </PageStates>
      </PageShell>
    );
  }
  if (!current) {
    return (
      <PageShell
        kicker={t("kicker")}
        title={t("title")}
        description={t("description")}
      >
        <Alert title={t("noProject.title")}>
          {t("noProject.description")}
        </Alert>
      </PageShell>
    );
  }

  const update = (patch: Partial<ResearchConfig>) => {
    setDraft({ ...current, ...patch });
  };

  async function save() {
    setSaveError(null);
    const parsed = researchConfigSchema.safeParse(current);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setSaveError(
        t("saveError.validation", {
          issue: `${first.path.join(".")} ${first.message}`,
        }),
      );
      return;
    }
    try {
      await updateConfig.mutateAsync(parsed.data);
      setDraft(null);
    } catch (err) {
      setSaveError(
        isMorphoError(err)
          ? err.userMessage
          : t("saveError.failed"),
      );
    }
  }

  const dirty = draft !== null;

  const customDimensions = current.dimensions.filter(
    (dimension) => !(DEFAULT_DIMENSIONS as readonly string[]).includes(dimension),
  );

  return (
    <PageShell
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() =>
              setActiveView(projectId !== "" ? "overview" : "projects")
            }
          >
            {t("cancel")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(null);
              setSaveError(null);
            }}
            disabled={!dirty}
          >
            {t("discard")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            loading={updateConfig.isPending}
            disabled={!dirty}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      {saveError ? (
        <div className="mb-lg">
          <Alert variant="error" title={t("saveError.title")}>
            {saveError}
          </Alert>
        </div>
      ) : null}

      <form
        className="max-w-4xl"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Card className="px-xl py-sm">
          <FormSection
            number="01"
            title={t("section01.title")}
            help={t("section01.help")}
          >
            <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="config-domain"
                  className="text-label text-text-secondary"
                >
                  {t("field.domain")}
                </label>
                <Input
                  id="config-domain"
                  value={current.domain}
                  onChange={(e) => update({ domain: e.target.value })}
                  placeholder={t("field.domainPlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="config-topic"
                  className="text-label text-text-secondary"
                >
                  {t("field.topic")} <span aria-hidden="true" className="text-error">*</span>
                </label>
                <Input
                  id="config-topic"
                  required
                  value={current.topic}
                  onChange={(e) => update({ topic: e.target.value })}
                  placeholder={t("field.topicPlaceholder")}
                />
              </div>
              <div className="md:col-span-2">
                <PurposeSelect
                  value={current.purpose}
                  onChange={(purpose) => update({ purpose })}
                />
              </div>
              <div className="flex flex-col gap-xs md:col-span-2">
                <label
                  htmlFor="config-audience"
                  className="text-label text-text-secondary"
                >
                  {t("field.audience")}
                </label>
                <Input
                  id="config-audience"
                  value={current.audience}
                  onChange={(e) => update({ audience: e.target.value })}
                  placeholder={t("field.audiencePlaceholder")}
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            number="02"
            title={t("section02.title")}
            help={t("section02.help")}
          >
            <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
              <div className="flex flex-col gap-xs">
                <span className="text-label text-text-secondary">{t("field.depth")}</span>
                {/* Registered SegmentedControl: controlled radiogroup with
                    roving tabindex and arrow-key movement; the value is the
                    numeric depth level re-expressed as the primitive's
                    string option value. */}
                <SegmentedControl
                  label={t("field.depth")}
                  options={DEPTH_LEVELS.map((level) => ({
                    value: String(level.value),
                    label: String(level.value),
                  }))}
                  value={String(current.depth)}
                  onChange={(depth) =>
                    update({ depth: Number(depth) as ResearchDepth })
                  }
                />
                <small className="text-caption text-text-muted">
                  {t(`common:vocab.depth.${current.depth}`)}
                </small>
              </div>
              <div className="flex flex-col gap-xs">
                <span className="text-label text-text-secondary">{t("field.timeRange")}</span>
                <div className="flex items-center gap-sm">
                  <YearInput
                    label={t("field.yearStart")}
                    placeholder={t("field.yearStartPlaceholder")}
                    iso={current.time_range.from}
                    edge="start"
                    onCommit={(from) =>
                      update({ time_range: { ...current.time_range, from } })
                    }
                  />
                  <span
                    aria-hidden="true"
                    className="text-caption text-text-muted"
                  >
                    {t("field.yearTo")}
                  </span>
                  <YearInput
                    label={t("field.yearEnd")}
                    placeholder={t("field.yearEndPlaceholder")}
                    iso={current.time_range.to}
                    edge="end"
                    onCommit={(to) =>
                      update({ time_range: { ...current.time_range, to } })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-sm">
                <span className="text-label text-text-secondary">{t("field.languages")}</span>
                {/* Language self-names ("中文"/"English") are locale-invariant
                    — the same constant pattern as the settings language row. */}
                <div className="flex gap-lg">
                  <Checkbox
                    label="中文"
                    checked={current.languages.includes("zh")}
                    onChange={() =>
                      update({ languages: toggleValue(current.languages, "zh") })
                    }
                  />
                  <Checkbox
                    label="English"
                    checked={current.languages.includes("en")}
                    onChange={() =>
                      update({ languages: toggleValue(current.languages, "en") })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="config-scope"
                  className="text-label text-text-secondary"
                >
                  {t("field.geographicScope")}
                </label>
                <Input
                  id="config-scope"
                  value={current.geographic_scope}
                  onChange={(e) => update({ geographic_scope: e.target.value })}
                  placeholder={t("field.geographicScopePlaceholder")}
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            number="03"
            title={t("section03.title")}
            help={t("section03.help")}
          >
            <div className="flex flex-wrap gap-sm">
              {[...DEFAULT_DIMENSIONS, ...customDimensions].map((dimension) => {
                const selected = current.dimensions.includes(dimension);
                return (
                  <Chip
                    key={dimension}
                    selected={selected}
                    onClick={() =>
                      update({
                        dimensions: toggleValue(current.dimensions, dimension),
                      })
                    }
                    className="py-1.5"
                  >
                    {t(`common:vocab.dimension.${dimension}`, { defaultValue: dimension })}
                  </Chip>
                );
              })}
              <Chip disabled title={t("dimensions.customTitle")} className="gap-xs border-dashed text-accent-alt">
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                {t("dimensions.custom")}
              </Chip>
            </div>
          </FormSection>

          <FormSection
            number="04"
            title={t("section04.title")}
            help={t("section04.help")}
          >
            <div className="grid grid-cols-1 gap-sm md:grid-cols-2 xl:grid-cols-4">
              {SOURCE_TYPE_PREFERENCES.map((preference) => {
                const checked = current.source_types.includes(preference.value);
                const typeLabel = t(`common:vocab.sourceType.${preference.value}`, {
                  defaultValue: preference.value,
                });
                return (
                  <label
                    key={preference.value}
                    className={`grid cursor-pointer grid-cols-[auto_1fr] gap-sm rounded-md border p-md transition-colors duration-[var(--morpho-motion-fast)] ${
                      checked
                        ? "option-selected"
                        : "border-border hover:bg-overlay-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      aria-label={typeLabel}
                      checked={checked}
                      onChange={() =>
                        update({
                          source_types: toggleValue(
                            current.source_types,
                            preference.value,
                          ),
                        })
                      }
                    />
                    <span
                      aria-hidden="true"
                      className="flex items-center leading-caption text-info"
                    >
                      <preference.icon size={16} strokeWidth={1.75} />
                    </span>
                    <span>
                      <strong className="block text-caption text-text-primary">
                        {typeLabel}
                      </strong>
                      <small className="mt-1 block text-caption text-text-muted">
                        {t(`sourcePref.${preference.descriptionKey}`)}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </FormSection>
        </Card>

        <p className="py-md text-caption text-text-muted">
          {t("footer")}
        </p>
        {/* Hidden native submit target so Enter in any field submits the form. */}
        <Button type="submit" className="sr-only" />
      </form>
    </PageShell>
  );
}
