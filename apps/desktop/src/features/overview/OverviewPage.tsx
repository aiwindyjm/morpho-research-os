import { useState } from "react";
import { Button, Card } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  COVERAGE_WEIGHTS,
  QUALITY_SOURCE_THRESHOLD,
  TERMINAL_TASK_STATES,
} from "@/types/domain";
import type {
  CoverageDimensionResult,
  ResearchTask,
  TimelineEntry,
} from "@/types/domain";
import {
  PLAN_STATUS_LABELS,
  TASK_STATE_LABELS,
  dimensionLabel,
} from "@/types/labels";
import {
  useClaims,
  useCoverage,
  useGaps,
  useGapActions,
  useKnowledge,
  usePlan,
  useProjects,
  useRun,
  useRunActions,
  useSources,
  useTasks,
  useTimeline,
} from "@/services/queries";

/**
 * Overview dashboard (spec §5, prototype `view-overview`): a read-only
 * projection of the active project — metrics, research path, live activity,
 * per-dimension coverage, and the top pending gap proposal. Every number is
 * derived from the existing queries; nothing is hard-coded from the
 * prototype's illustrative values.
 */

type PathState = "done" | "current" | "review" | "waiting";

function pathStateOf(task: ResearchTask): PathState {
  if (task.state === "COMPLETED") return "done";
  if (
    task.state === "RUNNING" ||
    task.state === "PLANNING" ||
    task.state === "VALIDATING"
  ) {
    return "current";
  }
  // Conflicts surfaced by validation need a human decision, not waiting.
  if (task.state === "NEEDS_REVIEW") return "review";
  return "waiting";
}

const PATH_MARKERS: Record<PathState, { glyph: string; className: string }> = {
  done: { glyph: "✓", className: "text-success" },
  current: { glyph: "→", className: "text-info" },
  review: { glyph: "!", className: "text-warning" },
  waiting: { glyph: "○", className: "text-text-muted" },
};

/** kind → icon colour: source 蓝 / knowledge 紫 / claim 橙 / run 绿 / task 灰. */
const ACTIVITY_ICONS: Record<
  TimelineEntry["kind"],
  { glyph: string; className: string }
> = {
  source: { glyph: "⌕", className: "text-info" },
  knowledge: { glyph: "◇", className: "text-accent-alt" },
  claim: { glyph: "!", className: "text-warning" },
  run: { glyph: "↗", className: "text-success" },
  task: { glyph: "✓", className: "text-text-secondary" },
};

function MetricCard({
  testId,
  label,
  value,
  meta,
  metaWarning = false,
  accent = false,
  progress,
}: {
  testId: string;
  label: string;
  value: string;
  meta: string;
  metaWarning?: boolean;
  accent?: boolean;
  progress?: number;
}) {
  return (
    <Card
      data-testid={testId}
      className={`flex flex-col gap-xs ${accent ? "metric-accent" : ""}`}
    >
      <span className="kicker">{label}</span>
      <strong className="text-display text-text-primary">{value}</strong>
      <span
        className={`text-caption ${metaWarning ? "text-warning" : "text-text-muted"}`}
      >
        {meta}
      </span>
      {progress !== undefined ? (
        <div
          className="progress-track mt-xs"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="覆盖度进度"
        >
          <span className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * RES-10 explainability, ported from the former coverage view: a quiet
 * disclosure per dimension showing the weighted formula components with raw
 * inputs plus the computed reasons. Coverage stays an explainable
 * indicator, never a bare score.
 */
function CoverageDisclosure({ dimension }: { dimension: CoverageDimensionResult }) {
  return (
    <details className="text-caption text-text-muted">
      <summary className="cursor-pointer">为什么是这个分数？</summary>
      <ul className="mt-xs list-disc pl-lg">
        <li>
          任务完成度 {dimension.components.task_completion.toFixed(2)}（权重{" "}
          {COVERAGE_WEIGHTS.task_completion}）：
          {dimension.inputs.tasks_completed}/{dimension.inputs.tasks_total} 个任务完成
        </li>
        <li>
          知识广度 {dimension.components.knowledge_breadth.toFixed(2)}（权重{" "}
          {COVERAGE_WEIGHTS.knowledge_breadth}）：
          {dimension.inputs.knowledge_nodes} 个节点
        </li>
        <li>
          证据密度 {dimension.components.evidence_density.toFixed(2)}（权重{" "}
          {COVERAGE_WEIGHTS.evidence_density}）：
          {dimension.inputs.evidence_items} 条证据
        </li>
        <li>
          来源多样性 {dimension.components.source_diversity.toFixed(2)}（权重{" "}
          {COVERAGE_WEIGHTS.source_diversity}）：
          {dimension.inputs.quality_sources} 个独立高质量来源
        </li>
      </ul>
      <ul className="mt-xs list-disc pl-lg">
        {dimension.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </details>
  );
}

export function OverviewPage() {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);

  const projects = useProjects();
  const project = (projects.data ?? []).find((p) => p.id === activeProjectId);
  const plan = usePlan(activeProjectId);
  const run = useRun(activeProjectId);
  const tasks = useTasks(activeProjectId);
  const coverage = useCoverage(activeProjectId);
  const sources = useSources(activeProjectId);
  const knowledge = useKnowledge(activeProjectId);
  const claims = useClaims(activeProjectId);
  const gaps = useGaps(activeProjectId);
  const timeline = useTimeline(activeProjectId);
  const gapActions = useGapActions(activeProjectId);
  const runActions = useRunActions(activeProjectId);

  // The gap the user approved from this card; once the refetch marks it
  // "approved" the card confirms the created task (approve-before-read
  // semantics ported from the former coverage & gaps view).
  const [createdGapId, setCreatedGapId] = useState<string | null>(null);

  const hasProject = activeProjectId !== "";

  const taskList = tasks.data ?? [];
  const totalTasks = taskList.length;
  const completedTasks = taskList.filter((t) => t.state === "COMPLETED").length;
  const runProgressPct =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const sourceList = sources.data ?? [];
  const qualitySources = sourceList.filter(
    (s) =>
      s.quality !== null &&
      s.quality.authority >= QUALITY_SOURCE_THRESHOLD &&
      s.quality.fitness >= QUALITY_SOURCE_THRESHOLD,
  ).length;

  const knowledgeList = knowledge.data ?? [];
  const knowledgeTypes = new Set(knowledgeList.map((k) => k.type)).size;

  const claimList = claims.data ?? [];
  // 待审核结论口径: unverified and conflicting claims both await user review;
  // conflicting ones are the warning subset (prototype「N 个存在冲突」).
  const reviewClaims = claimList.filter(
    (c) => c.status === "unverified" || c.status === "conflicting",
  );
  const conflictingClaims = claimList.filter((c) => c.status === "conflicting");

  const coverageData = coverage.data;
  const overallPct = coverageData
    ? Math.round(coverageData.overall * 100)
    : 0;
  const strongDimensions = coverageData
    ? coverageData.dimensions.filter((d) => d.coverage >= 0.6).length
    : 0;

  const gapList = gaps.data?.gaps ?? [];
  const pendingGap = gapList.find(
    (g) => g.proposal_status === "pending_approval",
  );
  const createdGap = createdGapId
    ? gapList.find(
        (g) => g.id === createdGapId && g.proposal_status === "approved",
      )
    : undefined;
  // Spec overview.md: 按 timestamp 倒序取前 5 条。Query 返回顺序不作保证，
  // 这里对副本做防御性排序，绝不改动 query 缓存数据。
  const recentActivity = [...(timeline.data ?? [])]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);

  const planIsDraft = plan.data?.status === "draft";
  const runActive =
    run.data !== null && run.data !== undefined && !TERMINAL_TASK_STATES.includes(run.data.state);
  const runStateLabel = run.data
    ? TASK_STATE_LABELS[run.data.state]
    : plan.data
      ? PLAN_STATUS_LABELS[plan.data.status]
      : "未开始";

  return (
    <PageShell
      kicker={hasProject ? `研究项目 / ${runStateLabel}` : undefined}
      title={project?.name ?? "概览"}
      description={project?.description}
      actions={
        hasProject ? (
          <>
            <Button variant="secondary" onClick={() => setActiveView("config")}>
              编辑配置
            </Button>
            {runActive ? (
              <Button variant="primary" onClick={() => setActiveView("tasks")}>
                查看任务 →
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={planIsDraft}
                title={planIsDraft ? "先到研究计划页批准计划" : undefined}
                loading={runActions.start.isPending}
                onClick={() =>
                  void runActions.start.mutateAsync().catch(() => undefined)
                }
              >
                继续研究 →
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <PageStates
        isLoading={hasProject && (coverage.isLoading || tasks.isLoading)}
        error={coverage.error ?? tasks.error}
        onRetry={() => {
          void coverage.refetch();
          void tasks.refetch();
        }}
        isEmpty={!hasProject}
        empty={{
          title: "还没有选择项目",
          description:
            "先在「我的研究」页选择或创建一个研究项目，这里会展示它的研究概览。",
          action: (
            <Button variant="primary" onClick={() => setActiveView("projects")}>
              去我的研究
            </Button>
          ),
        }}
      >
        <div data-testid="overview-page" className="flex flex-col gap-xl">
          {/* 指标行 */}
          <div className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              testId="metric-coverage"
              label="研究覆盖度"
              value={`${overallPct}%`}
              meta={`核心维度已完成 ${strongDimensions} / ${coverageData?.dimensions.length ?? 0}`}
              accent
              progress={overallPct}
            />
            <MetricCard
              testId="metric-sources"
              label="来源"
              value={String(sourceList.length)}
              meta={`高质量 ${qualitySources} 个`}
            />
            <MetricCard
              testId="metric-knowledge"
              label="知识节点"
              value={String(knowledgeList.length)}
              meta={`${knowledgeTypes} 种类型`}
            />
            <MetricCard
              testId="metric-reviews"
              label="待审核结论"
              value={String(reviewClaims.length)}
              meta={`${conflictingClaims.length} 个存在冲突`}
              metaWarning
            />
          </div>

          <div className="grid grid-cols-1 gap-xl xl:grid-cols-2">
            {/* 研究路径 */}
            <Card data-testid="overview-path" className="flex flex-col gap-md">
              <div className="flex items-start justify-between gap-sm">
                <div>
                  <p className="kicker">研究进度</p>
                  <h2 className="text-h2 text-text-primary">当前研究路径</h2>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveView("tasks")}
                >
                  查看全部 →
                </Button>
              </div>
              <div className="timeline-list flex flex-col">
                {totalTasks === 0 ? (
                  <p className="text-caption text-text-muted">
                    还没有可执行任务；批准计划并开始运行后，任务会按依赖顺序出现在这里。
                  </p>
                ) : (
                  taskList.map((task, index) => {
                    const state = pathStateOf(task);
                    const marker = PATH_MARKERS[state];
                    const isLast = index === taskList.length - 1;
                    return (
                      <div
                        key={task.id}
                        data-testid="path-row"
                        data-state={state}
                        className={`relative flex items-start gap-md pb-md ${
                          isLast ? "" : "timeline-connector"
                        }`}
                      >
                        {state === "review" ? (
                          <span className="flex w-7 shrink-0 justify-center">
                            <span aria-hidden="true" className="pill pill-warning">
                              !
                            </span>
                          </span>
                        ) : (
                          <span
                            aria-hidden="true"
                            className={`w-7 shrink-0 text-center text-body ${marker.className} ${
                              state === "current" ? "pulse" : ""
                            }`}
                          >
                            {marker.glyph}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-body text-text-primary">
                            {task.title}
                          </p>
                          <p className="text-caption text-text-muted">
                            {state === "done" || state === "review"
                              ? TASK_STATE_LABELS[task.state]
                              : state === "current"
                                ? "正在执行"
                                : "等待前置任务"}
                          </p>
                          {state === "current" ? (
                            <div
                              className="progress-track mt-xs"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={runProgressPct}
                              aria-label="任务完成进度"
                            >
                              <span
                                className="progress-fill"
                                style={{ width: `${runProgressPct}%` }}
                              />
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 text-caption ${
                            state === "done"
                              ? "text-success"
                              : state === "current"
                                ? "text-info"
                                : state === "review"
                                  ? "text-warning"
                                  : "text-text-muted"
                          }`}
                        >
                          {state === "done"
                            ? "完成"
                            : state === "current"
                              ? `${runProgressPct}%`
                              : state === "review"
                                ? "待审核"
                                : "等待"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* 研究活动 */}
            <Card data-testid="overview-activity" className="flex flex-col gap-md">
              <div className="flex items-start justify-between gap-sm">
                <div>
                  <p className="kicker">研究活动</p>
                  <h2 className="text-h2 text-text-primary">刚刚发生</h2>
                </div>
                <span className="pill pill-success inline-flex items-center gap-xs">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-current"
                  />
                  实时
                </span>
              </div>
              <div className="flex flex-col gap-md">
                {recentActivity.length === 0 ? (
                  <p className="text-caption text-text-muted">
                    还没有活动事件；开始研究运行后，来源、论断与知识节点会按时间出现在这里。
                  </p>
                ) : (
                  recentActivity.map((entry) => {
                    const icon = ACTIVITY_ICONS[entry.kind] ?? ACTIVITY_ICONS.run;
                    return (
                      <div
                        key={entry.id}
                        data-testid="activity-item"
                        className="flex items-start gap-md"
                      >
                        <span
                          aria-hidden="true"
                          className={`text-body ${icon.className}`}
                        >
                          {icon.glyph}
                        </span>
                        <div className="min-w-0">
                          <p className="text-body text-text-primary">
                            {entry.title}
                          </p>
                          <p className="text-caption text-text-muted">
                            {entry.detail}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-xl xl:grid-cols-2">
            {/* 研究维度覆盖度 */}
            <Card data-testid="overview-dimensions" className="flex flex-col gap-md">
              <div className="flex items-start justify-between gap-sm">
                <div>
                  <p className="kicker">覆盖度</p>
                  <h2 className="text-h2 text-text-primary">研究维度</h2>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveView("knowledge")}
                >
                  查看知识 →
                </Button>
              </div>
              <div className="flex flex-col gap-md">
                {(coverageData?.dimensions ?? []).map((dim) => (
                  <div
                    key={dim.dimension}
                    data-testid="dimension-row"
                    className="flex flex-col gap-xs"
                  >
                    <div className="flex items-center justify-between gap-sm">
                      <span className="text-body text-text-secondary">
                        {dimensionLabel(dim.dimension)}
                      </span>
                      <span className="text-label text-text-primary">
                        {Math.round(dim.coverage * 100)}%
                      </span>
                    </div>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(dim.coverage * 100)}
                      aria-label={`${dimensionLabel(dim.dimension)}覆盖度进度`}
                    >
                      <span
                        className="progress-fill"
                        style={{ width: `${Math.round(dim.coverage * 100)}%` }}
                      />
                    </div>
                    <CoverageDisclosure dimension={dim} />
                  </div>
                ))}
              </div>
            </Card>

            {/* 下一步 */}
            <Card
              data-testid="overview-next"
              className={`flex flex-col gap-md ${
                pendingGap || createdGap ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-sm">
                <div>
                  <p className="kicker">下一步</p>
                  <h2 className="text-h2 text-text-primary">建议继续研究</h2>
                </div>
                {pendingGap && !createdGap ? (
                  <span className="pill pill-warning">
                    {pendingGap.trigger === "coverage_below_threshold"
                      ? "低覆盖"
                      : "来源不足"}
                  </span>
                ) : null}
              </div>
              {/* Approved-from-here confirmation wins over the next pending
                  proposal so the user sees the outcome of their action. */}
              {createdGap ? (
                <div className="flex flex-col gap-xs">
                  <p className="text-body text-text-primary">
                    已创建任务「{createdGap.proposed_task.title}」。
                  </p>
                  <p className="text-caption text-text-muted">
                    新任务出现在「任务」页，可随时暂停或重试。
                  </p>
                </div>
              ) : pendingGap ? (
                <>
                  <p className="text-body text-text-secondary">
                    {pendingGap.detail}
                  </p>
                  <div className="flex items-center gap-sm">
                    <Button
                      className="flex-1"
                      variant="secondary"
                      loading={gapActions.approve.isPending}
                      onClick={() =>
                        void gapActions.approve
                          .mutateAsync(pendingGap.id)
                          .then(() => setCreatedGapId(pendingGap.id))
                          .catch(() => undefined)
                      }
                    >
                      创建研究任务 →
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label="忽略该建议"
                      loading={gapActions.dismiss.isPending}
                      onClick={() =>
                        void gapActions.dismiss
                          .mutateAsync(pendingGap.id)
                          .catch(() => undefined)
                      }
                    >
                      忽略
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-body text-text-secondary">
                  暂无缺口建议，当前覆盖良好。
                </p>
              )}
            </Card>
          </div>
        </div>
      </PageStates>
    </PageShell>
  );
}
