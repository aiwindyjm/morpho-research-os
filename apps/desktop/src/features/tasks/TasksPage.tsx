import { useState } from "react";
import { Badge, Button, Card, Chip, Popover } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import type { ResearchTask, TaskState } from "@/types/domain";
import { TASK_KIND_LABELS, TASK_STATE_LABELS, dimensionLabel } from "@/types/labels";
import { usePlan, useRunActions, useRun, useTaskActions, useTasks } from "@/services/queries";
import { useToast } from "@morpho/ui";

/**
 * Tasks view (RES-02 frontend), prototype alignment (spec §4, `view-tasks`):
 * count tabs (全部/执行中/待审核/已完成) over the durable task table with
 * status pills. Run start keeps its plan gating; every task keeps its
 * pause/resume/retry/cancel controls behind the row-action popover.
 */

type TaskTab = "all" | "active" | "review" | "done";

/** States that count towards the 执行中 tab (in-flight or queued work). */
const ACTIVE_STATES: readonly TaskState[] = [
  "PENDING",
  "PLANNING",
  "RUNNING",
  "VALIDATING",
];

/** Prototype pill mapping: special states get their own color, the rest
 * stay neutral with the canonical TASK_STATE_LABELS text. */
const TASK_STATE_PILLS: Partial<Record<TaskState, { pill: string; label: string }>> = {
  RUNNING: { pill: "pill-accent", label: "执行中" },
  NEEDS_REVIEW: { pill: "pill-warning", label: "待审核" },
  COMPLETED: { pill: "pill-success", label: "已完成" },
};

function statusPill(state: TaskState): { pill: string; label: string } {
  return TASK_STATE_PILLS[state] ?? { pill: "pill-neutral", label: TASK_STATE_LABELS[state] };
}

const TASK_GRID =
  "grid grid-cols-[2.2fr_1.2fr_0.85fr_25px] items-center gap-md border-b border-border";

export function TasksPage({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading, error, refetch } = useTasks(projectId);
  const { data: plan } = usePlan(projectId);
  const { data: run } = useRun(projectId);
  const actions = useTaskActions(projectId);
  const startRun = useRunActions(projectId);
  const { showToast } = useToast();
  const [tab, setTab] = useState<TaskTab>("all");

  const list = tasks ?? [];
  const counts: Record<TaskTab, number> = {
    all: list.length,
    active: list.filter((t) => ACTIVE_STATES.includes(t.state)).length,
    review: list.filter((t) => t.state === "NEEDS_REVIEW").length,
    done: list.filter((t) => t.state === "COMPLETED").length,
  };
  const visible =
    tab === "all"
      ? list
      : tab === "active"
        ? list.filter((t) => ACTIVE_STATES.includes(t.state))
        : tab === "review"
          ? list.filter((t) => t.state === "NEEDS_REVIEW")
          : list.filter((t) => t.state === "COMPLETED");

  const tabs: Array<{ id: TaskTab; label: string; count: number }> = [
    { id: "all", label: "全部", count: counts.all },
    { id: "active", label: "执行中", count: counts.active },
    { id: "review", label: "待审核", count: counts.review },
    { id: "done", label: "已完成", count: counts.done },
  ];

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
    return buttons;
  }

  return (
    <PageShell
      kicker="研究任务"
      title="执行中的工作"
      description="每个任务都可以暂停、重试，并回到具体来源和结果。"
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
            继续运行
          </Button>
        ) : run ? (
          <Badge variant={run.state === "COMPLETED" ? "success" : "accent"}>
            运行状态：{run.state}
          </Badge>
        ) : null
      }
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={list.length === 0}
        empty={{
          title: "还没有任务",
          description:
            plan?.status === "approved"
              ? "计划已批准，点击右上角「继续运行」创建任务。"
              : plan?.status === "draft"
                ? "先到「研究计划」页审查并批准计划，批准后会创建任务。"
                : "先在「研究计划」页生成并批准一份计划。",
          action:
            plan?.status === "approved" ? (
              <Button variant="primary" onClick={() => void startRun.start.mutateAsync().catch(() => undefined)}>
                继续运行
              </Button>
            ) : undefined,
        }}
      >
        <Card className="px-lg pb-sm">
          <div className="flex min-h-[63px] flex-wrap items-center justify-between gap-sm border-b border-border">
            <div role="group" aria-label="任务状态筛选" className="flex items-center gap-md">
              {tabs.map(({ id, label, count }) => (
                <Chip
                  key={id}
                  selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label} <span>{count}</span>
                </Chip>
              ))}
            </div>
            <span className="text-caption text-text-muted">
              最后更新 {list[0]?.updated_at.slice(0, 10)}
            </span>
          </div>
          <div role="presentation" className={`${TASK_GRID} py-sm text-caption text-text-muted`}>
            <span>任务</span>
            <span>阶段</span>
            <span>状态</span>
            <span />
          </div>
          <ol className="flex flex-col">
            {visible.map((task) => {
              const pill = statusPill(task.state);
              const rowActions = taskActions(task);
              return (
                <li
                  key={task.id}
                  data-testid="task-row"
                  data-state={task.state}
                  className={`${TASK_GRID} py-md`}
                >
                  <div className="min-w-0">
                    <strong className="text-body text-text-primary" data-testid="task-title">
                      {task.title}
                    </strong>
                    <small className="block text-caption text-text-muted">
                      {dimensionLabel(task.dimension)}
                    </small>
                  </div>
                  <span className="text-caption text-text-secondary">
                    {TASK_KIND_LABELS[task.kind]}
                  </span>
                  <span className={`pill ${pill.pill}`}>{pill.label}</span>
                  {rowActions.length > 0 ? (
                    <Popover
                      align="end"
                      trigger={({ onClick, "aria-expanded": expanded }) => (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="任务操作"
                          aria-expanded={expanded}
                          onClick={onClick}
                          className="px-xs"
                        >
                          ⋯
                        </Button>
                      )}
                    >
                      <div className="flex flex-col gap-sm">
                        {rowActions.map(({ label, run: fn, variant }) => (
                          <Button key={label} size="sm" variant={variant} onClick={fn}>
                            {label}
                          </Button>
                        ))}
                      </div>
                    </Popover>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      </PageStates>
    </PageShell>
  );
}
