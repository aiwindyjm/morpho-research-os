import { useState, type ReactNode } from "react";
import { Alert, Button, Card, Checkbox, Input } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { PurposeSelect } from "@/components/research";
import {
  DEFAULT_DIMENSIONS,
  DEPTH_LEVELS,
  type ResearchConfig,
  type SourceType,
} from "@/types/domain";
import {
  DEPTH_LABELS,
  SOURCE_TYPE_LABELS,
  dimensionLabel,
} from "@/types/labels";
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
 * server values while staying on the page.
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
 * SourceType vocabulary, presentation only. */
const SOURCE_TYPE_PREFERENCES: Array<{
  value: SourceType;
  icon: string;
  description: string;
}> = [
  { value: "paper", icon: "◈", description: "期刊、预印本与会议资料" },
  { value: "documentation", icon: "⌘", description: "官方文档与机构指南" },
  { value: "web_page", icon: "◌", description: "行业报道与专业媒体" },
  { value: "repository", icon: "⌗", description: "代码与开源实现" },
  { value: "dataset", icon: "▦", description: "公开数据与实验材料" },
  { value: "book", icon: "▭", description: "教材、专著与手册" },
  { value: "video", icon: "▷", description: "讲座与会议录像" },
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
  const { data, isLoading, error, refetch } = useConfig(projectId);
  const updateConfig = useUpdateConfig(projectId);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const [draft, setDraft] = useState<ResearchConfig | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = draft ?? data;
  if (!current && (isLoading || error)) {
    return (
      <PageShell
        kicker="研究配置"
        title="定义你的研究问题"
        description="这些信息会决定研究计划的范围、深度和来源选择。"
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
        kicker="研究配置"
        title="定义你的研究问题"
        description="这些信息会决定研究计划的范围、深度和来源选择。"
      >
        <Alert title="请先选择或创建项目">
          研究配置属于具体的项目；切换或新建项目后再来配置。
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
      setSaveError(`配置未通过校验：${first.path.join(".")} ${first.message}`);
      return;
    }
    try {
      await updateConfig.mutateAsync(parsed.data);
      setDraft(null);
    } catch (err) {
      setSaveError(
        isMorphoError(err)
          ? err.userMessage
          : "保存失败，请稍后重试。",
      );
    }
  }

  const dirty = draft !== null;

  const customDimensions = current.dimensions.filter(
    (dimension) => !(DEFAULT_DIMENSIONS as readonly string[]).includes(dimension),
  );

  return (
    <PageShell
      kicker="研究配置"
      title="定义你的研究问题"
      description="这些信息会决定研究计划的范围、深度和来源选择。"
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() =>
              setActiveView(projectId !== "" ? "overview" : "projects")
            }
          >
            取消
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(null);
              setSaveError(null);
            }}
            disabled={!dirty}
          >
            放弃修改
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            loading={updateConfig.isPending}
            disabled={!dirty}
          >
            保存配置
          </Button>
        </>
      }
    >
      {saveError ? (
        <div className="mb-lg">
          <Alert variant="error" title="无法保存">
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
            title="研究主题"
            help="先明确你要理解的对象和最终用途。"
          >
            <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="config-domain"
                  className="text-label text-text-secondary"
                >
                  研究领域
                </label>
                <Input
                  id="config-domain"
                  value={current.domain}
                  onChange={(e) => update({ domain: e.target.value })}
                  placeholder="例如：神经工程"
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="config-topic"
                  className="text-label text-text-secondary"
                >
                  研究主题 <span aria-hidden="true" className="text-error">*</span>
                </label>
                <Input
                  id="config-topic"
                  required
                  value={current.topic}
                  onChange={(e) => update({ topic: e.target.value })}
                  placeholder="例如：脑机接口在运动康复中的应用"
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
                  使用对象 / 受众
                </label>
                <Input
                  id="config-audience"
                  value={current.audience}
                  onChange={(e) => update({ audience: e.target.value })}
                  placeholder="例如：康复医学研究者"
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            number="02"
            title="研究范围"
            help="范围越清晰，计划越容易执行和复核。"
          >
            <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
              <div className="flex flex-col gap-xs">
                <span className="text-label text-text-secondary">研究深度</span>
                <div
                  role="group"
                  aria-label="研究深度"
                  className="flex"
                >
                  {DEPTH_LEVELS.map((level, index) => {
                    const selected = current.depth === level.value;
                    return (
                      <button
                        key={level.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => update({ depth: level.value })}
                        className={`h-9 w-[52px] border text-caption transition-colors duration-[var(--morpho-motion-fast)] ${
                          index > 0 ? "-ml-px" : ""
                        } ${
                          index === 0 ? "rounded-l-md" : ""
                        } ${
                          index === DEPTH_LEVELS.length - 1 ? "rounded-r-md" : ""
                        } ${
                          selected
                            ? "relative z-10 chip-selected"
                            : "border-border bg-surface text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {level.value}
                      </button>
                    );
                  })}
                </div>
                <small className="text-caption text-text-muted">
                  {DEPTH_LABELS[current.depth]}
                </small>
              </div>
              <div className="flex flex-col gap-xs">
                <span className="text-label text-text-secondary">时间范围</span>
                <div className="flex items-center gap-sm">
                  <YearInput
                    label="开始年份"
                    placeholder="如 2015"
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
                    至
                  </span>
                  <YearInput
                    label="结束年份"
                    placeholder="如 2026"
                    iso={current.time_range.to}
                    edge="end"
                    onCommit={(to) =>
                      update({ time_range: { ...current.time_range, to } })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-sm">
                <span className="text-label text-text-secondary">语言</span>
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
                  地域范围
                </label>
                <Input
                  id="config-scope"
                  value={current.geographic_scope}
                  onChange={(e) => update({ geographic_scope: e.target.value })}
                  placeholder="例如：global"
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            number="03"
            title="研究维度"
            help="选择计划必须覆盖的角度，可在生成计划后继续调整。"
          >
            <div className="flex flex-wrap gap-sm">
              {[...DEFAULT_DIMENSIONS, ...customDimensions].map((dimension) => {
                const selected = current.dimensions.includes(dimension);
                return (
                  <button
                    key={dimension}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      update({
                        dimensions: toggleValue(current.dimensions, dimension),
                      })
                    }
                    className={`rounded-full border px-md py-1.5 text-caption transition-colors duration-[var(--morpho-motion-fast)] ${
                      selected
                        ? "chip-selected"
                        : "border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {dimensionLabel(dimension)}
                  </button>
                );
              })}
              <button
                type="button"
                disabled
                title="桌面版提供"
                className="rounded-full border border-dashed border-border px-md py-1.5 text-caption text-accent-alt disabled:cursor-not-allowed disabled:text-text-muted"
              >
                ＋ 自定义维度
              </button>
            </div>
          </FormSection>

          <FormSection
            number="04"
            title="来源偏好"
            help="Morpho 会优先搜索这些来源，并保留每个结论的出处。"
          >
            <div className="grid grid-cols-1 gap-sm md:grid-cols-2 xl:grid-cols-4">
              {SOURCE_TYPE_PREFERENCES.map((preference) => {
                const checked = current.source_types.includes(preference.value);
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
                      aria-label={SOURCE_TYPE_LABELS[preference.value]}
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
                      className="text-body leading-caption text-info"
                    >
                      {preference.icon}
                    </span>
                    <span>
                      <strong className="block text-caption text-text-primary">
                        {SOURCE_TYPE_LABELS[preference.value]}
                      </strong>
                      <small className="mt-1 block text-caption text-text-muted">
                        {preference.description}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </FormSection>
        </Card>

        <p className="py-md text-caption text-text-muted">
          更新频率当前固定为手动（update_frequency: manual）；自动增量研究将在后续版本提供。
        </p>
        <button type="submit" className="sr-only" />
      </form>
    </PageShell>
  );
}
