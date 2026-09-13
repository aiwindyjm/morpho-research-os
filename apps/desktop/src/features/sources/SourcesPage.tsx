import { useState } from "react";
import { Button, Card, Chip, Input } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { SourceCard, isQualitySource } from "@/components/cards";
import { useSources } from "@/services/queries";

/**
 * Sources view (RES-03 frontend), prototype alignment (spec §4,
 * `view-sources`): a quality summary strip, a search + type-chip toolbar,
 * and compact prototype rows rendered by the registered SourceCard
 * (variant="row"). Quality describes authority and fitness for purpose
 * only — it never declares a low-rated source false (docs/PRD.md §6).
 */

const TYPE_FILTERS = [
  { id: "all", label: "全部类型" },
  { id: "paper", label: "论文" },
  { id: "documentation", label: "官方文档" },
] as const;

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
              <Chip
                key={id}
                selected={typeFilter === id}
                onClick={() => setTypeFilter(id)}
              >
                {label}
              </Chip>
            ))}
          </div>
          <span className="ml-auto text-caption text-text-muted" role="status">
            {visible.length} 个来源
          </span>
        </div>

        {/* Narrow table strategy: the rows share one horizontal scroll
            region so the row-grid minmax floors hold before squeezing. */}
        <div className="overflow-x-auto" data-testid="sources-table">
          <ol>
            {visible.map((source) => (
              <SourceCard key={source.id} source={source} variant="row" />
            ))}
          </ol>
        </div>
        {visible.length === 0 ? (
          <Card className="text-center text-body text-text-secondary">
            没有匹配的来源；试试更换关键词或清除筛选条件。
          </Card>
        ) : null}
      </PageStates>
    </PageShell>
  );
}
