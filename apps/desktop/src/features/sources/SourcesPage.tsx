import { useState } from "react";
import { Button, Card, Input } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { QUALITY_SOURCE_THRESHOLD, type Source } from "@/types/domain";
import { SOURCE_STATUS_LABELS, SOURCE_TYPE_LABELS } from "@/types/labels";
import { useSources } from "@/services/queries";

/**
 * Sources view (RES-03 frontend), prototype alignment (spec §4,
 * `view-sources`): a quality summary strip, a search + type-chip toolbar,
 * and compact source rows. Quality describes authority and fitness for
 * purpose only — it never declares a low-rated source false (docs/PRD.md §6).
 *
 * Prototype badge mapping (spec §4): paper/documentation → node-badge-alt
 * (紫), web_page → node-badge-accent (蓝), other source types → pill-neutral
 * (灰). Row grid keeps the prototype template; the quality caption and its
 * mono mean score share the third column, the ↗ external link closes the row.
 */

/** A source meets the documented quality bar on both axes. */
function isQualitySource(source: Source): boolean {
  return (
    source.quality !== null &&
    source.quality.authority >= QUALITY_SOURCE_THRESHOLD &&
    source.quality.fitness >= QUALITY_SOURCE_THRESHOLD
  );
}

/** Prototype type-badge class per source type. */
function sourceTypeBadgeClass(type: Source["source_type"]): string {
  if (type === "paper" || type === "documentation") return "badge-mono node-badge-alt";
  if (type === "web_page") return "badge-mono node-badge-accent";
  return "pill pill-neutral";
}

/** Normalized host for the row subtitle; falls back to a truncated URL. */
function sourceHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.length > 28 ? `${url.slice(0, 28)}…` : url;
  }
}

const TYPE_FILTERS = [
  { id: "all", label: "全部类型" },
  { id: "paper", label: "论文" },
  { id: "documentation", label: "官方文档" },
] as const;

const SOURCE_GRID =
  "grid grid-cols-[74px_1fr_70px_35px] items-center gap-md border-b border-border py-md min-h-[70px]";

/** Prototype `source-summary` tile: one 21px number plus a caption. */
function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="p-md">
      <strong className={`block text-[21px] leading-7 ${tone}`}>{value}</strong>
      <span className="text-caption text-text-muted">{label}</span>
    </Card>
  );
}

/** Sources view — every claim stays traceable to its origin. */
export function SourcesPage({ projectId }: { projectId: string }) {
  const { data: sources, isLoading, error, refetch } = useSources(projectId);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [onlyQuality, setOnlyQuality] = useState(false);

  const list = sources ?? [];
  const summary = {
    all: list.length,
    high: list.filter(isQualitySource).length,
    medium: list.filter((source) => source.quality !== null && !isQualitySource(source))
      .length,
    pending: list.filter((source) => source.quality === null && source.status === "discovered")
      .length,
  };

  const needle = search.trim().toLowerCase();
  const visible = list.filter((source) => {
    if (onlyQuality && !isQualitySource(source)) return false;
    if (typeFilter !== "all" && source.source_type !== typeFilter) return false;
    if (!needle) return true;
    return (
      source.title.toLowerCase().includes(needle) ||
      source.url.toLowerCase().includes(needle)
    );
  });

  return (
    <PageShell
      kicker="来源库"
      title="已发现的来源"
      description="每个来源都会保留规范化地址、来源类型、质量信息和贡献的结论。"
      actions={
        <>
          <Button variant="secondary" disabled title="桌面版提供">
            导入链接
          </Button>
          <Button
            variant="primary"
            aria-pressed={onlyQuality}
            onClick={() => setOnlyQuality((value) => !value)}
          >
            按质量筛选
          </Button>
        </>
      }
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={list.length === 0}
        empty={{
          title: "还没有来源",
          description: "批准研究计划并开始运行后，检索到的来源会出现在这里。",
        }}
      >
        <div
          data-testid="source-summary"
          className="mb-lg grid grid-cols-2 gap-sm md:grid-cols-4"
        >
          <SummaryTile label="全部" value={summary.all} tone="text-text-primary" />
          <SummaryTile label="高质量" value={summary.high} tone="text-success" />
          <SummaryTile label="中等" value={summary.medium} tone="text-warning" />
          <SummaryTile label="待审核" value={summary.pending} tone="text-text-muted" />
        </div>

        <div className="mb-lg flex flex-wrap items-center gap-md">
          <Input
            type="search"
            aria-label="搜索来源或关键词"
            placeholder="搜索标题或地址…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
          />
          <div className="flex items-center gap-sm">
            {TYPE_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={typeFilter === id}
                onClick={() => setTypeFilter(id)}
                className={`rounded-full border px-md py-1 text-caption transition-colors duration-[var(--morpho-motion-fast)] ${
                  typeFilter === id
                    ? "text-info border-[rgb(114_167_255/0.45)] bg-accent-soft"
                    : "text-text-muted border-border hover:text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-caption text-text-muted" role="status">
            {visible.length} 个来源
          </span>
        </div>

        <ol>
          {visible.map((source) => {
            const tier = source.quality
              ? isQualitySource(source)
                ? { label: "高质量", className: "text-success" }
                : { label: "中等", className: "text-warning" }
              : { label: "待审核", className: "text-text-muted" };
            return (
              <li key={source.id} data-testid="source-row" className={SOURCE_GRID}>
                <span className={sourceTypeBadgeClass(source.source_type)}>
                  {SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type}
                </span>
                <div className="min-w-0">
                  <strong className="text-body text-text-primary">{source.title}</strong>
                  <small className="mt-xs block truncate text-caption text-text-muted">
                    <span>{sourceHost(source.url)}</span>
                    <span aria-hidden="true"> · </span>
                    <span>
                      {SOURCE_STATUS_LABELS[source.status] ?? source.status}
                    </span>
                  </small>
                </div>
                <div className="flex flex-col gap-xs">
                  <span className={`text-caption ${tier.className}`}>{tier.label}</span>
                  <span className="font-mono text-[11px] text-text-muted">
                    {source.quality
                      ? ((source.quality.authority + source.quality.fitness) / 2).toFixed(2)
                      : "—"}
                  </span>
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="打开来源"
                  className="text-caption text-info hover:underline"
                >
                  ↗
                </a>
              </li>
            );
          })}
        </ol>
        {visible.length === 0 ? (
          <Card className="text-center text-body text-text-secondary">
            没有匹配的来源；试试更换关键词或清除筛选条件。
          </Card>
        ) : null}
      </PageStates>
    </PageShell>
  );
}
