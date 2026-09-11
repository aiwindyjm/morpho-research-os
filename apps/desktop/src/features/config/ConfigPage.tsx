import { useState } from "react";
import { Alert, Button, Input } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import {
  PurposeSelect,
  ResearchDepthSelector,
  ResearchDimensionPicker,
} from "@/components/research";
import { researchConfigSchema } from "@/types/schemas";
import type { ResearchConfig } from "@/types/domain";
import { useConfig, useUpdateConfig } from "@/services/queries";
import { isMorphoError } from "@/services/errors";

/**
 * Research Configuration view (Form pattern). The structured config — not
 * an unbounded prompt — defines the project (docs/PRD.md §5).
 */
export function ConfigPage({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useConfig(projectId);
  const updateConfig = useUpdateConfig(projectId);
  const [draft, setDraft] = useState<ResearchConfig | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = draft ?? data;
  if (!current && (isLoading || error)) {
    return (
      <PageShell title="研究配置" description="定义研究问题的边界与来源偏好。">
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
      <PageShell title="研究配置" description="定义研究问题的边界与来源偏好。">
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

  return (
    <PageShell
      title="研究配置"
      description="结构化配置决定计划如何生成：主题、深度、维度、语言与来源类型。"
      actions={
        <>
          {dirty ? (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              放弃修改
            </Button>
          ) : null}
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
        className="grid max-w-3xl grid-cols-1 gap-lg md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-xs">
          <label htmlFor="config-domain" className="text-label text-text-secondary">
            研究领域
          </label>
          <Input
            id="config-domain"
            value={current.domain}
            onChange={(e) => update({ domain: e.target.value })}
            placeholder="例如：人工智能"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="config-topic" className="text-label text-text-secondary">
            研究主题 <span aria-hidden="true" className="text-error">*</span>
          </label>
          <Input
            id="config-topic"
            required
            value={current.topic}
            onChange={(e) => update({ topic: e.target.value })}
            placeholder="例如：大语言模型推理优化"
          />
        </div>

        <PurposeSelect
          value={current.purpose}
          onChange={(purpose) => update({ purpose })}
        />
        <div className="flex flex-col gap-xs">
          <label htmlFor="config-audience" className="text-label text-text-secondary">
            目标读者
          </label>
          <Input
            id="config-audience"
            value={current.audience}
            onChange={(e) => update({ audience: e.target.value })}
            placeholder="例如：机器学习工程师"
          />
        </div>

        <ResearchDepthSelector
          value={current.depth}
          onChange={(depth) => update({ depth })}
        />
        <div className="flex flex-col gap-xs">
          <label htmlFor="config-scope" className="text-label text-text-secondary">
            地理范围
          </label>
          <Input
            id="config-scope"
            value={current.geographic_scope}
            onChange={(e) => update({ geographic_scope: e.target.value })}
            placeholder="例如：global"
          />
        </div>

        <div className="md:col-span-2">
          <ResearchDimensionPicker
            selected={current.dimensions}
            onChange={(dimensions) => update({ dimensions })}
          />
        </div>

        <div className="flex flex-col gap-xs">
          <label htmlFor="config-languages" className="text-label text-text-secondary">
            语言（逗号分隔）
          </label>
          <Input
            id="config-languages"
            value={current.languages.join(", ")}
            onChange={(e) =>
              update({
                languages: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="zh, en"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="config-source-types" className="text-label text-text-secondary">
            来源类型（逗号分隔）
          </label>
          <Input
            id="config-source-types"
            value={current.source_types.join(", ")}
            onChange={(e) =>
              update({
                source_types: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="paper, documentation, web_page"
          />
        </div>

        <div className="md:col-span-2 rounded-md border border-border bg-surface p-md text-caption text-text-muted">
          更新频率当前固定为手动（update_frequency: manual）；自动增量研究将在后续版本提供。
        </div>
        <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
      </form>
    </PageShell>
  );
}
