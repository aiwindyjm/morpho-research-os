import { useState } from "react";
import { Alert, Button, Dialog, Input, Textarea, useToast } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { ResearchStatusBadge } from "@/components/cards";
import { ResearchPlanTree, type PlanTreeNode } from "@/components/research";
import type { ResearchPlan } from "@/types/domain";
import { usePlan, usePlanActions, useRunActions, useRun, useTasks } from "@/services/queries";
import { isMorphoError } from "@/services/errors";

/**
 * Plan review (RES-01 frontend): the planner only proposes; the user edits,
 * approves, or rejects. Approving gates the run (RES-02 flow starts there).
 */
export function PlanPage({ projectId }: { projectId: string }) {
  const { data: plan, isLoading, error, refetch } = usePlan(projectId);
  const { data: run } = useRun(projectId);
  const { data: tasks } = useTasks(projectId);
  const actions = usePlanActions(projectId);
  const runActions = useRunActions(projectId);
  const { showToast } = useToast();

  const [editing, setEditing] = useState<{ task: PlanTreeNode } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const hasRun = run !== null;
  const editable = plan?.status === "draft" && !hasRun;

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
      title="研究计划"
      description="Planner 只生成待审查的计划草案；批准之后才会创建可运行的任务。"
      actions={
        plan ? (
          <>
            <ResearchStatusBadge state={plan.status} kind="plan" />
            {plan.status === "draft" && !hasRun ? (
              <>
                <Button
                  variant="ghost"
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
                  onClick={() => void act(() => actions.approve.mutateAsync())}
                  loading={actions.approve.isPending}
                >
                  批准计划
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
          <div className="flex flex-col gap-lg">
            <div className="rounded-lg border border-border bg-surface p-lg">
              <h2 className="text-h2 text-text-primary">{plan.title}</h2>
              <p className="mt-xs text-body text-text-secondary">{plan.rationale}</p>
              <p className="mt-sm text-caption text-text-muted">
                更新于 {plan.updated_at.slice(0, 16).replace("T", " ")}（UTC）
              </p>
            </div>
            <ResearchPlanTree
              sections={plan.sections}
              editable={editable}
              onEditTask={({ task }) => {
                setEditing({ task });
                setEditTitle(task.title);
                setEditDescription(task.description);
              }}
            />
            {!editable && plan.status === "draft" ? (
              <Alert title="计划已锁定">
                本轮运行已创建，计划内容不再修改；可以暂停任务或在运行结束后重新生成计划。
              </Alert>
            ) : null}
          </div>
        ) : null}
      </PageStates>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
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
