import { Alert, Badge, Button, Card, Progress } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { COVERAGE_WEIGHTS, GAP_COVERAGE_THRESHOLD } from "@/types/domain";
import {
  GAP_TRIGGER_LABELS,
  dimensionLabel,
} from "@/types/labels";
import type { CoverageDimensionResult, ResearchGap } from "@/types/domain";
import { useCoverage, useGapActions, useGaps } from "@/services/queries";
import { useToast } from "@morpho/ui";

/**
 * Coverage & Gaps view (RES-10). Coverage is an explainable indicator using
 * the PRD V0.1 formula; gaps cite their rule; proposals stay read-only
 * until the user approves them.
 */
export function GapsPage({ projectId }: { projectId: string }) {
  const coverage = useCoverage(projectId);
  const gaps = useGaps(projectId);
  const actions = useGapActions(projectId);
  const { showToast } = useToast();

  const isLoading = coverage.isLoading || gaps.isLoading;
  const error = coverage.error ?? gaps.error;
  const isEmpty =
    (coverage.data?.dimensions ?? []).length === 0 && (gaps.data?.gaps ?? []).length === 0;

  return (
    <PageShell
      title="覆盖与缺口"
      description="覆盖度是可解释指标，不是精确评分；缺口建议在批准前保持只读。"
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => {
          void coverage.refetch();
          void gaps.refetch();
        }}
        isEmpty={isEmpty}
        empty={{
          title: "还没有覆盖度数据",
          description: "批准计划并开始运行后，这里会按维度展示覆盖度、原因与缺口建议。",
        }}
      >
        <div className="flex flex-col gap-xl">
          <section aria-labelledby="coverage-heading">
            <h2 id="coverage-heading" className="text-h2 text-text-primary">
              总体覆盖度
            </h2>
            {coverage.data ? (
              <Card className="mt-md max-w-xl">
                <div className="flex items-center justify-between">
                  <span className="text-display text-text-primary">
                    {(coverage.data.overall * 100).toFixed(1)}%
                  </span>
                  <span className="text-caption text-text-muted">
                    计算于 {coverage.data.computed_at.slice(0, 16).replace("T", " ")} UTC
                  </span>
                </div>
                <div className="mt-md">
                  <Progress
                    value={coverage.data.overall * 100}
                    label="总体覆盖度"
                  />
                </div>
                <p className="mt-md text-caption text-text-muted">
                  公式：任务完成度 {COVERAGE_WEIGHTS.task_completion} + 知识广度{" "}
                  {COVERAGE_WEIGHTS.knowledge_breadth} + 证据密度{" "}
                  {COVERAGE_WEIGHTS.evidence_density} + 来源多样性{" "}
                  {COVERAGE_WEIGHTS.source_diversity}（总体为各维度的平均值）
                </p>
              </Card>
            ) : null}
            <div className="mt-lg grid grid-cols-1 gap-lg lg:grid-cols-2">
              {(coverage.data?.dimensions ?? []).map((dim) => (
                <CoveragePanel key={dim.dimension} dimension={dim} />
              ))}
            </div>
          </section>

          <section aria-labelledby="gaps-heading">
            <h2 id="gaps-heading" className="text-h2 text-text-primary">
              研究缺口
            </h2>
            <p className="mt-xs text-caption text-text-secondary">
              触发规则：维度覆盖率低于 {GAP_COVERAGE_THRESHOLD}，或独立高质量来源少于 2 个。
            </p>
            {(gaps.data?.gaps ?? []).length === 0 ? (
              <div className="mt-md">
                <Alert variant="success" title="当前没有缺口">
                  所有维度的覆盖率与来源条件均达标，或尚未开始运行。
                </Alert>
              </div>
            ) : (
              <div className="mt-md grid grid-cols-1 gap-lg lg:grid-cols-2">
                {(gaps.data?.gaps ?? []).map((gap) => (
                  <GapCard
                    key={gap.id}
                    gap={gap}
                    onApprove={() =>
                      void actions.approve
                        .mutateAsync(gap.id)
                        .then(() =>
                          showToast({
                            title: "已创建补充任务",
                            detail: "新任务出现在「任务」页。",
                            variant: "success",
                          }),
                        )
                        .catch(() => undefined)
                    }
                    onDismiss={() =>
                      void actions.dismiss.mutateAsync(gap.id).catch(() => undefined)
                    }
                    pending={actions.approve.isPending || actions.dismiss.isPending}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </PageStates>
    </PageShell>
  );
}

/** Registered business component: CoveragePanel. */
export function CoveragePanel({ dimension }: { dimension: CoverageDimensionResult }) {
  const gap = dimension.coverage < GAP_COVERAGE_THRESHOLD;
  return (
    <Card className="flex flex-col gap-sm" data-testid="coverage-panel">
      <div className="flex items-center justify-between gap-sm">
        <h3 className="text-h3 text-text-primary">{dimensionLabel(dimension.dimension)}</h3>
        <Badge variant={gap ? "warning" : "success"}>
          {dimension.coverage.toFixed(2)}
        </Badge>
      </div>
      <Progress value={dimension.coverage * 100} label={`${dimensionLabel(dimension.dimension)} 覆盖度`} />
      <ul className="flex flex-col gap-xs text-caption text-text-secondary">
        <li>
          任务完成度 {dimension.components.task_completion.toFixed(2)}（权重{" "}
          {COVERAGE_WEIGHTS.task_completion}）：{dimension.inputs.tasks_completed}/
          {dimension.inputs.tasks_total} 个任务完成
        </li>
        <li>
          知识广度 {dimension.components.knowledge_breadth.toFixed(2)}（权重{" "}
          {COVERAGE_WEIGHTS.knowledge_breadth}）：{dimension.inputs.knowledge_nodes} 个节点
        </li>
        <li>
          证据密度 {dimension.components.evidence_density.toFixed(2)}（权重{" "}
          {COVERAGE_WEIGHTS.evidence_density}）：{dimension.inputs.evidence_items} 条证据
        </li>
        <li>
          来源多样性 {dimension.components.source_diversity.toFixed(2)}（权重{" "}
          {COVERAGE_WEIGHTS.source_diversity}）：
          {dimension.inputs.quality_sources} 个独立高质量来源
        </li>
      </ul>
      <details className="text-caption text-text-muted">
        <summary className="cursor-pointer">为什么是这个分数？</summary>
        <ul className="mt-xs list-disc pl-lg">
          {dimension.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

/** Gap card — proposal stays read-only until explicit user approval. */
export function GapCard({
  gap,
  onApprove,
  onDismiss,
  pending,
}: {
  gap: ResearchGap;
  onApprove: () => void;
  onDismiss: () => void;
  pending: boolean;
}) {
  return (
    <Card className="flex flex-col gap-sm border-warning/40" data-testid="gap-card">
      <div className="flex flex-wrap items-center gap-sm">
        <h3 className="text-h3 text-text-primary">{dimensionLabel(gap.dimension)}</h3>
        <Badge variant="warning">{GAP_TRIGGER_LABELS[gap.trigger]}</Badge>
        {gap.proposal_status === "approved" ? (
          <Badge variant="success">已批准</Badge>
        ) : null}
      </div>
      <p className="text-caption text-text-secondary">触发规则：{gap.rule}</p>
      <p className="text-body text-text-secondary">{gap.detail}</p>
      <div className="rounded-md border border-border bg-surface-raised p-md">
        <p className="text-label text-text-primary">
          建议任务：{gap.proposed_task.title}
        </p>
        <p className="mt-xs text-caption text-text-secondary">
          {gap.proposed_task.description}
        </p>
      </div>
      {gap.proposal_status === "pending_approval" ? (
        <p className="text-caption text-text-muted">
          建议保持只读；只有你批准后才会创建任务。
        </p>
      ) : gap.proposal_status === "approved" ? (
        <p className="text-caption text-text-muted">
          已按建议创建任务（{gap.created_task_id?.slice(0, 8)}…），可在「任务」页查看。
        </p>
      ) : null}
      <div className="flex gap-sm">
        {gap.proposal_status === "pending_approval" ? (
          <>
            <Button size="sm" variant="primary" onClick={onApprove} loading={pending}>
              批准并创建任务
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} loading={pending}>
              忽略此建议
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
