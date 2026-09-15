import { useTranslation } from "react-i18next";
import { Button, Card, Table, TBody, TD, TH, THead, TR } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import {
  useClaims,
  useCoverage,
  useKnowledge,
  useSources,
  useTimeline,
} from "@/services/queries";

/**
 * Reports view (PRD §13): a minimal, read-only project summary assembled
 * from the existing mock backend queries — source/knowledge/claim counts,
 * the explainable coverage score with a dimension table, and recent run
 * events. Report export (Vault/Markdown briefing) stays an explicitly
 * disabled placeholder until the export pipeline lands; the page never
 * pretends the export works. All chrome strings go through t() (ADR-023,
 * "reports" namespace); dimension labels resolve through common:vocab.*.
 */

/** Prototype summary tile: one 21px number plus a caption. */
function SummaryTile({
  testId,
  label,
  value,
  tone = "text-text-primary",
  progress,
}: {
  testId: string;
  label: string;
  value: string;
  tone?: string;
  progress?: number;
}) {
  return (
    <Card data-testid={testId} className="p-md">
      <strong className={`block text-[21px] leading-7 ${tone}`}>{value}</strong>
      <span className="text-caption text-text-muted">{label}</span>
      {progress !== undefined ? (
        <div className="progress-track mt-xs">
          <span className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </Card>
  );
}

export function ReportsPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation("reports");
  const sources = useSources(projectId);
  const knowledge = useKnowledge(projectId);
  const claims = useClaims(projectId);
  const coverage = useCoverage(projectId);
  const timeline = useTimeline(projectId);

  const sourceList = sources.data ?? [];
  const nodeList = knowledge.data ?? [];
  const claimList = claims.data ?? [];
  const coverageData = coverage.data;
  const overallPct = coverageData ? Math.round(coverageData.overall * 100) : 0;
  const recentRuns = (timeline.data ?? [])
    .filter((entry) => entry.kind === "run")
    .slice(0, 5);

  return (
    <PageShell
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
    >
      <PageStates
        isLoading={
          sources.isLoading ||
          knowledge.isLoading ||
          claims.isLoading ||
          coverage.isLoading
        }
        error={sources.error ?? knowledge.error ?? claims.error ?? coverage.error}
        onRetry={() => {
          void sources.refetch();
          void knowledge.refetch();
          void claims.refetch();
          void coverage.refetch();
        }}
        isEmpty={
          sourceList.length === 0 &&
          nodeList.length === 0 &&
          claimList.length === 0
        }
        empty={{
          title: t("empty.title"),
          description: t("empty.description"),
        }}
      >
        <div data-testid="reports-page" className="flex flex-col gap-xl">
          {/* 汇总指标 */}
          <div
            data-testid="report-summary"
            className="grid grid-cols-2 gap-sm md:grid-cols-4"
          >
            <SummaryTile testId="report-metric-sources" label={t("metrics.sources")} value={String(sourceList.length)} />
            <SummaryTile
              testId="report-metric-knowledge"
              label={t("metrics.knowledge")}
              value={String(nodeList.length)}
            />
            <SummaryTile testId="report-metric-claims" label={t("metrics.claims")} value={String(claimList.length)} />
            <SummaryTile
              testId="report-metric-coverage"
              label={t("metrics.coverage")}
              value={`${overallPct}%`}
              tone="text-success"
              progress={overallPct}
            />
          </div>

          <div className="grid grid-cols-1 gap-xl xl:grid-cols-2">
            {/* 维度覆盖度表 */}
            <Card data-testid="report-dimensions" className="flex flex-col gap-md">
              <div>
                <p className="kicker">{t("dimensions.kicker")}</p>
                <h2 className="text-h2 text-text-primary">{t("dimensions.title")}</h2>
              </div>
              {/* Narrow table strategy (DESIGN_TOKENS.md): the real table
                  keeps its columns and scrolls horizontally below the point
                  where its 480px floor stops fitting; w-full keeps the
                  desktop width identical. */}
              <div className="overflow-x-auto" data-testid="report-dimensions-table">
                <Table className="w-full min-w-[480px] border-collapse text-body">
                <caption className="sr-only">
                  {t("dimensions.caption")}
                </caption>
                <THead>
                  <TR className="border-b border-border text-left text-label text-text-muted">
                    <TH scope="col" className="px-md py-sm">{t("dimensions.colDimension")}</TH>
                    <TH scope="col" className="px-md py-sm">{t("dimensions.colCoverage")}</TH>
                    <TH scope="col" className="px-md py-sm">{t("dimensions.colTasks")}</TH>
                    <TH scope="col" className="px-md py-sm">{t("dimensions.colNodes")}</TH>
                    <TH scope="col" className="px-md py-sm">{t("dimensions.colQualitySources")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {(coverageData?.dimensions ?? []).map((dimension) => (
                    <TR
                      key={dimension.dimension}
                      data-testid="report-dimension-row"
                      className="border-b border-border/60"
                    >
                      <TD className="px-md py-sm text-text-primary">
                        {t(`common:vocab.dimension.${dimension.dimension}`, {
                          defaultValue: dimension.dimension,
                        })}
                      </TD>
                      <TD className="px-md py-sm">
                        <div className="flex items-center gap-sm">
                          <div className="progress-track w-24">
                            <span
                              className="progress-fill"
                              style={{
                                width: `${Math.round(dimension.coverage * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-caption text-text-secondary">
                            {Math.round(dimension.coverage * 100)}%
                          </span>
                        </div>
                      </TD>
                      <TD className="px-md py-sm text-text-secondary">
                        {dimension.inputs.tasks_completed}/{dimension.inputs.tasks_total}
                      </TD>
                      <TD className="px-md py-sm text-text-secondary">
                        {dimension.inputs.knowledge_nodes}
                      </TD>
                      <TD className="px-md py-sm text-text-secondary">
                        {dimension.inputs.quality_sources}
                      </TD>
                    </TR>
                  ))}
                </TBody>
                </Table>
              </div>
            </Card>

            {/* 最近研究运行 */}
            <Card data-testid="report-recent-runs" className="flex flex-col gap-md">
              <div>
                <p className="kicker">{t("runs.kicker")}</p>
                <h2 className="text-h2 text-text-primary">{t("runs.title")}</h2>
              </div>
              <ul className="flex flex-col gap-sm">
                {recentRuns.length === 0 ? (
                  <li className="text-caption text-text-muted">
                    {t("runs.empty")}
                  </li>
                ) : (
                  recentRuns.map((entry) => (
                    <li
                      key={entry.id}
                      data-testid="report-run-event"
                      className="flex items-start gap-md border-b border-border/60 pb-sm last:border-b-0"
                    >
                      <span className="pt-xs font-mono text-[10px] text-text-muted">
                        {entry.timestamp.slice(0, 16).replace("T", " ")}
                      </span>
                      <p className="min-w-0 text-caption text-text-secondary">
                        {entry.detail}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </Card>
          </div>

          {/* 导出占位（诚实禁用） */}
          <Card data-testid="report-export" className="flex flex-col gap-sm p-lg">
            <div className="flex items-center gap-sm">
              <p className="kicker">{t("export.kicker")}</p>
              <span className="pill pill-neutral">{t("export.soon")}</span>
            </div>
            <h2 className="text-h3 text-text-primary">{t("export.title")}</h2>
            <p className="text-caption text-text-secondary">
              {t("export.description")}
            </p>
            <div>
              <Button variant="primary" disabled title={t("export.soon")}>
                {t("export.title")}
              </Button>
            </div>
          </Card>
        </div>
      </PageStates>
    </PageShell>
  );
}
