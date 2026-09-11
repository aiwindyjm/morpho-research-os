import { Badge, Button, Card } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { TaskProgress, TaskRow } from "@/components/cards";
import type { ResearchTask } from "@/types/domain";
import { usePlan, useRunActions, useRun, useTaskActions, useTasks } from "@/services/queries";
import { useToast } from "@morpho/ui";

/**
 * Tasks view (RES-02 frontend): the durable task DAG with user controls —
 * pause/resume/retry/cancel — and live progress while a run is active.
 */
export function TasksPage({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading, error, refetch } = useTasks(projectId);
  const { data: plan } = usePlan(projectId);
  const { data: run } = useRun(projectId);
  const actions = useTaskActions(projectId);
  const startRun = useRunActions(projectId);
  const { showToast } = useToast();

  const completed = (tasks ?? []).filter((t) => t.state === "COMPLETED").length;
  const sectionTitles = new Map(
    (plan?.sections ?? []).map((section) => [section.id, section.title]),
  );

  function taskActions(task: ResearchTask) {
    const buttons: Array<{ label: string; run: () => void; variant: "secondary" | "ghost" | "danger" }> = [];
    if (task.state === "RUNNING" || task.state === "PLANNING" || task.state === "PENDING") {
      buttons.push({
        label: "暂停",
        variant: "ghost",
        run: () => void actions.pause.mutateAsync(task.id).catch(() => undefined),
      });
    }
    if (task.state === "PAUSED") {
      buttons.push({
        label: "恢复",
        variant: "secondary",
        run: () => void actions.resume.mutateAsync(task.id).catch(() => undefined),
      });
    }
    if (task.state === "FAILED") {
      buttons.push({
        label: "重试",
        variant: "secondary",
        run: () => void actions.retry.mutateAsync(task.id).catch(() => undefined),
      });
    }
    if (task.state === "NEEDS_REVIEW") {
      buttons.push({
        label: "确认并继续",
        variant: "secondary",
        run: () => void actions.retry.mutateAsync(task.id).catch(() => undefined),
      });
    }
    if (!["COMPLETED", "CANCELLED", "NEEDS_REVIEW"].includes(task.state)) {
      buttons.push({
        label: "取消",
        variant: "danger",
        run: () => void actions.cancel.mutateAsync(task.id).catch(() => undefined),
      });
    }
    return buttons.map(({ label, run: fn, variant }) => (
      <Button key={label} size="sm" variant={variant} onClick={fn}>
        {label}
      </Button>
    ));
  }

  return (
    <PageShell
      title="任务"
      description="任务由 Orchestrator 统一调度，可暂停、重试、取消；中断后从检查点恢复。"
      actions={
        run === null && plan?.status === "approved" ? (
          <Button
            variant="primary"
            onClick={() =>
              void startRun.start
                .mutateAsync()
                .then(() =>
                  showToast({
                    title: "研究运行已开始",
                    detail: "任务将按依赖顺序执行。",
                    variant: "success",
                  }),
                )
                .catch(() => undefined)
            }
            loading={startRun.start.isPending}
          >
            开始运行
          </Button>
        ) : run ? (
          <Badge variant={run.state === "COMPLETED" ? "success" : "accent"}>
            运行状态：{run.state}
          </Badge>
        ) : null
      }
      toolbar={
        (tasks ?? []).length > 0 ? (
          <Card className="max-w-md">
            <TaskProgress completed={completed} total={(tasks ?? []).length} />
          </Card>
        ) : null
      }
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={(tasks ?? []).length === 0}
        empty={{
          title: "还没有任务",
          description:
            plan?.status === "approved"
              ? "计划已批准，点击右上角「开始运行」创建任务。"
              : plan?.status === "draft"
                ? "先到「研究计划」页审查并批准计划，批准后会创建任务。"
                : "先在「研究计划」页生成并批准一份计划。",
          action:
            plan?.status === "approved" ? (
              <Button variant="primary" onClick={() => void startRun.start.mutateAsync().catch(() => undefined)}>
                开始运行
              </Button>
            ) : undefined,
        }}
      >
        <ol className="flex flex-col gap-md">
          {(tasks ?? []).map((task) => (
            <li key={task.id}>
              <TaskRow
                task={task}
                sectionTitle={sectionTitles.get(task.section_id)}
                actions={taskActions(task)}
              />
            </li>
          ))}
        </ol>
      </PageStates>
    </PageShell>
  );
}
