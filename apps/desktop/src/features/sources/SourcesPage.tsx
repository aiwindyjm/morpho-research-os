import { useState } from "react";
import { useTranslation } from "react-i18next";
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
 * All chrome strings go through t() (ADR-023, "sources" namespace).
 */

/** Prototype type-filter chips; the copy differs from the canonical
 * vocab.sourceType labels ("官方文档" vs "技术文档") and stays verbatim. */
const TYPE_FILTERS = [
  { id: "all", key: "filter.all" },
  { id: "paper", key: "filter.paper" },
  { id: "documentation", key: "filter.documentation" },
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
  const { t } = useTranslation("sources");
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
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
      actions={
        <>
          <Button variant="secondary" disabled title={t("desktopOnly")}>
            {t("importLinks")}
          </Button>
          <Button
            variant="primary"
            aria-pressed={onlyQuality}
            onClick={() => setOnlyQuality((value) => !value)}
          >
            {t("qualityToggle")}
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
          title: t("empty.title"),
          description: t("empty.description"),
        }}
      >
        <div
          data-testid="source-summary"
          className="mb-lg grid grid-cols-2 gap-sm md:grid-cols-4"
        >
          <SummaryTile label={t("summary.all")} value={summary.all} tone="text-text-primary" />
          <SummaryTile label={t("summary.high")} value={summary.high} tone="text-success" />
          <SummaryTile label={t("summary.medium")} value={summary.medium} tone="text-warning" />
          <SummaryTile label={t("summary.pending")} value={summary.pending} tone="text-text-muted" />
        </div>

        <div className="mb-lg flex flex-wrap items-center gap-md">
          <Input
            type="search"
            aria-label={t("search")}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
          />
          <div className="flex items-center gap-sm">
            {TYPE_FILTERS.map(({ id, key }) => (
              <Chip
                key={id}
                selected={typeFilter === id}
                onClick={() => setTypeFilter(id)}
              >
                {t(key)}
              </Chip>
            ))}
          </div>
          <span className="ml-auto text-caption text-text-muted" role="status">
            {t("count", { total: visible.length })}
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
            {t("noMatch")}
          </Card>
        ) : null}
      </PageStates>
    </PageShell>
  );
}
