import { useCallback, useState } from "react";
import { Alert, Button, Card, Dialog, Input, Textarea, useToast } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { ResearchStatusBadge } from "@/components/cards";
import { PLAN_STATUS_LABELS, TASK_KIND_LABELS } from "@/types/labels";
import type { PlanTaskDraft, ResearchPlan } from "@/types/domain";
import {
  useClaims,
  useConfig,
  usePlan,
  usePlanActions,
  useRun,
  useRunActions,
  useSources,
  useTasks,
} from "@/services/queries";
import { isMorphoError } from "@/services/errors";

/** Zero-padded group index for the tree ("01", "02", …). */
function groupNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** Prototype `plan-summary` cell; every cell but the first gets a leading rule. */
function SummaryCell({
  label,
  value,
  first = false,
}: {
  label: string;
  value: string | number;
  first?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-xs ${first ? "" : "border-l border-border pl-lg"}`}>
      <span className="kicker">{label}</span>
      <strong className="text-h2 text-text-primary">{value}</strong>
    </div>
  );
}

/**
 * Plan review (RES-01 frontend): the planner only proposes; the user edits,
 * approves, or rejects. Approving gates the run (RES-02 flow starts there).
 * Prototype alignment (spec §4, `view-plan`): header kicker + actions, a
 * four-cell summary strip, and a collapsible plan tree. All review, run, and
 * task-editing interactions keep their existing behaviour and accessible
 * names (App.test.tsx pins 批准计划/拒绝计划/重新生成/开始运行).
 */
export function PlanPage({ projectId }: { projectId: string }) {
  const { data: plan, isLoading, error, refetch } = usePlan(projectId);
  const { data: run } = useRun(projectId);
  const { data: tasks } = useTasks(projectId);
  const { data: sources } = useSources(projectId);
  const { data: claims } = useClaims(projectId);
  const { data: config } = useConfig(projectId);
  const actions = usePlanActions(projectId);
  const runActions = useRunActions(projectId);
  const { showToast } = useToast();

  const [editing, setEditing] = useState<{ task: PlanTaskDraft } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  /** Section ids currently folded away in the plan tree. */
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  // Stable identity: Dialog re-runs its focus effect when onClose changes,
  // and an inline closure would steal focus back to the first field on
  // every keystroke (the description textarea became untypeable).
  const closeEditing = useCallback(() => setEditing(null), []);

  const hasRun = run !== null;
  const editable = plan?.status === "draft" && !hasRun;

  const plannedTasks = plan
    ? plan.sections.reduce((count, section) => count + section.tasks.length, 0)
    : 0;
  // 待审核结论口径 (same as the overview dashboard): unverified + conflicting.
  const reviewClaims = (claims ?? []).filter(
    (claim) => claim.status === "unverified" || claim.status === "conflicting",
  ).length;

  function toggleGroup(sectionId: string) {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  function openEditDialog(task: PlanTaskDraft) {
    setEditing({ task });
    setEditTitle(task.title);
    setEditDescription(task.description);
  }

  function reportError(err: unknown, fallback: string) {
    setActionError(isMorphoError(err) ? err.userMessage : fallback);
  }

  async function act(fn: () => Promise<ResearchPlan>) {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      reportError(err, "操作失败，请重试。");
    }
  }

  return (
    <PageShell
      kicker={
        plan
          ? `研究计划 / ${plan.status === "draft" ? "待确认" : PLAN_STATUS_LABELS[plan.status]}`
          : undefined
      }
      title={plan?.title ?? "研究计划"}
      description={
        plan
          ? plan.rationale
          : "Planner 只生成待审查的计划草案；批准之后才会创建可运行的任务。"
      }
      actions={
        plan ? (
          <>
            <ResearchStatusBadge state={plan.status} kind="plan" />
            {plan.status === "draft" && !hasRun ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void act(() => actions.regenerate.mutateAsync())}
                  loading={actions.regenerate.isPending}
                >
                  重新生成
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void act(() => actions.reject.mutateAsync())}
                  loading={actions.reject.isPending}
                >
                  拒绝计划
                </Button>
                <Button
                  variant="primary"
                  aria-label="批准计划"
                  onClick={() => void act(() => actions.approve.mutateAsync())}
                  loading={actions.approve.isPending}
                >
                  确认并开始
                </Button>
              </>
            ) : null}
            {plan.status === "approved" && !hasRun ? (
              <Button
                variant="primary"
                onClick={() =>
                  void runActions.start
                    .mutateAsync()
                    .then(() =>
                      showToast({
                        title: "研究运行已开始",
                        detail: "到「任务」页查看实时进度。",
                        variant: "success",
                      }),
                    )
                    .catch((err) => reportError(err, "启动运行失败。"))
                }
                loading={runActions.start.isPending}
              >
                开始运行
              </Button>
            ) : null}
            {plan.status === "rejected" ? (
              <Button
                variant="primary"
                onClick={() => void act(() => actions.regenerate.mutateAsync())}
                loading={actions.regenerate.isPending}
              >
                重新生成计划
              </Button>
            ) : null}
          </>
        ) : plan === null && !isLoading ? (
          <Button
            variant="primary"
            onClick={() => void act(() => actions.regenerate.mutateAsync())}
            loading={actions.regenerate.isPending}
          >
            生成研究计划
          </Button>
        ) : null
      }
    >
      {actionError ? (
        <div className="mb-lg">
          <Alert variant="error" title="操作未完成">
            {actionError}
          </Alert>
        </div>
      ) : null}

      {run ? (
        <div className="mb-lg">
          <Alert variant="info" title={`运行状态：${run.state}`}>
            计划已进入执行阶段（共 {(tasks ?? []).length} 个任务）；如需调整计划，
            请到「任务」页暂停或等待本轮运行结束。
          </Alert>
        </div>
      ) : null}

      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={plan === null}
        empty={{
          title: "还没有研究计划",
          description:
            "先完善研究配置，然后点击「生成研究计划」。计划会按维度列出检索与提取任务，等待你的审查。",
          action: (
            <Button variant="primary" onClick={() => void act(() => actions.regenerate.mutateAsync())}>
              生成研究计划
            </Button>
          ),
        }}
      >
        {plan ? (
          <Card className="overflow-hidden p-0">
            {/* 汇总条：全部来自真实查询，不用原型里的示意数字。 */}
            <div
              data-testid="plan-summary"
              className="grid grid-cols-4 border-b border-border bg-overlay-hairline px-lg py-md"
            >
              <SummaryCell label="预计任务" value={plannedTasks} first />
              <SummaryCell label="来源" value={(sources ?? []).length} />
              <SummaryCell label="研究维度" value={config?.dimensions.length ?? 0} />
              <SummaryCell label="需要审核" value={reviewClaims} />
            </div>
            <div data-testid="plan-tree" className="px-lg pb-lg">
              {plan.sections.map((section, sectionIndex) => {
                const isCollapsed = collapsedGroups.has(section.id);
                return (
                  <div key={section.id} className="border-b border-border last:border-b-0">
                    <div className="grid grid-cols-[22px_35px_1fr_auto_24px] items-center gap-sm py-md">
                      <span
                        aria-hidden="true"
                        className="text-caption text-text-muted select-none"
                      >
                        ⋮⋮
                      </span>
                      <span className="font-mono text-micro font-bold text-info">
                        {groupNumber(sectionIndex)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-label text-text-primary">{section.title}</p>
                        <p className="mt-xs text-caption text-text-muted">{section.rationale}</p>
                      </div>
                      <span className="text-caption text-text-muted">
                        {section.tasks.length} tasks
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={isCollapsed ? "展开分组" : "折叠分组"}
                        aria-expanded={!isCollapsed}
                        className="h-auto px-xs py-0 text-caption"
                        onClick={() => toggleGroup(section.id)}
                      >
                        {isCollapsed ? "⌄" : "⌃"}
                      </Button>
                    </div>
                    {isCollapsed
                      ? null
                      : section.tasks.map((task, taskIndex) => (
                          <div
                            key={task.id}
                            className="ml-[68px] grid grid-cols-[42px_1fr_auto] items-center gap-sm border-t border-border py-sm"
                          >
                            <span className="font-mono text-nano text-text-muted">
                              {groupNumber(sectionIndex)}.{taskIndex + 1}
                            </span>
                            <span className="min-w-0 text-body text-text-primary">
                              {task.title}
                            </span>
                            <span className="flex items-center gap-sm">
                              <span className="text-caption text-text-muted">
                                {TASK_KIND_LABELS[task.kind] ?? task.kind}
                              </span>
                              {editable ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditDialog(task)}
                                >
                                  编辑任务
                                </Button>
                              ) : null}
                            </span>
                          </div>
                        ))}
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}
        {!editable && plan?.status === "draft" ? (
          <div className="mt-lg">
            <Alert title="计划已锁定">
              本轮运行已创建，计划内容不再修改；可以暂停任务或在运行结束后重新生成计划。
            </Alert>
          </div>
        ) : null}
      </PageStates>

      <Dialog
        open={editing !== null}
        onClose={closeEditing}
        title="编辑计划任务"
        description="只修改标题与描述；任务类型与执行顺序由 Orchestrator 决定。"
      >
        <form
          className="flex flex-col gap-lg"
          onSubmit={(event) => {
            event.preventDefault();
            if (!editing) return;
            void actions.updateTask
              .mutateAsync({
                task_id: editing.task.id,
                title: editTitle,
                description: editDescription,
              })
              .then(() => setEditing(null))
              .catch((err) => reportError(err, "保存修改失败。"));
          }}
        >
          <div className="flex flex-col gap-xs">
            <label htmlFor="task-title" className="text-label text-text-secondary">
              任务标题
            </label>
            <Input
              id="task-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-xs">
            <label htmlFor="task-description" className="text-label text-text-secondary">
              任务描述
            </label>
            <Textarea
              id="task-description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-sm">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button variant="primary" type="submit" loading={actions.updateTask.isPending}>
              保存修改
            </Button>
          </div>
        </form>
      </Dialog>
    </PageShell>
  );
}
