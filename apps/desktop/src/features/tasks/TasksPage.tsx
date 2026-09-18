import { useState } from "react";
import { Ellipsis } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, Chip, Popover } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import type { ResearchRun, ResearchTask, TaskState } from "@/types/domain";
import { usePlan, useRunActions, useRun, useTasks } from "@/services/queries";
import { useToast } from "@morpho/ui";

/**
 * Tasks view (RES-02 frontend), prototype alignment (spec §4, `view-tasks`):
 * count tabs (全部/执行中/待审核/已完成) over the durable task table with
 * status pills. Run start keeps its plan gating; every task keeps its
 * pause/resume/retry/cancel controls behind the row-action popover. All
 * chrome strings go through t() (ADR-023, "tasks" namespace); non-pill task
 * states resolve through common:vocab.taskState.
 */

type TaskTab = "all" | "active" | "review" | "done";

/** Prototype pill mapping: special states get their own color and copy
 * (kept verbatim from the prototype — they differ from the canonical
 * vocab.taskState labels), the rest stay neutral with the canonical
 * common:vocab.taskState text. */
const TASK_STATE_PILL_KEYS: Partial<Record<TaskState, { pill: string; key: string }>> = {
  RUNNING: { pill: "pill-accent", key: "pill.running" },
  NEEDS_REVIEW: { pill: "pill-warning", key: "pill.needsReview" },
  COMPLETED: { pill: "pill-success", key: "pill.completed" },
};

/** States that count towards the 执行中 tab (in-flight or queued work). */
const ACTIVE_STATES: readonly TaskState[] = [
  "PENDING",
  "PLANNING",
  "RUNNING",
  "VALIDATING",
];

function statusPill(
  state: TaskState,
  t: (key: string, options?: Record<string, unknown>) => string,
): { pill: string; label: string } {
  const special = TASK_STATE_PILL_KEYS[state];
  if (special) return { pill: special.pill, label: t(special.key) };
  return {
    pill: "pill-neutral",
    label: t(`common:vocab.taskState.${state}`, { defaultValue: state }),
  };
}

/**
 * Prototype task-table grid (spec §4). Narrow-window strategy (shared with
 * the sources rows and the reports dimension table, docs/frontend/
 * DESIGN_TOKENS.md "narrow table strategy"): the fr tracks gain minmax()
 * floors and the header + rows scroll together inside one overflow-x-auto
 * region, so columns squeeze down to readable minimums and then scroll
 * instead of crushing text. Above the point where the floors stop binding
 * (≥sm) the tracks resolve to the exact same fr proportions as before, so
 * the desktop layout is unchanged.
 */
const TASK_GRID =
  "grid grid-cols-[minmax(150px,2.2fr)_minmax(84px,1.2fr)_minmax(76px,0.85fr)_25px] items-center gap-md border-b border-border";

export function TasksPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation("tasks");
  const { data: tasks, isLoading, error, refetch } = useTasks(projectId);
  const { data: plan } = usePlan(projectId);
  const { data: run } = useRun(projectId);
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

  const tabLabels: Record<TaskTab, string> = {
    all: t("tabs.all"),
    active: t("tabs.active"),
    review: t("tabs.review"),
    done: t("tabs.done"),
  };
  const tabs: Array<{ id: TaskTab; label: string; count: number }> = [
    { id: "all", label: tabLabels.all, count: counts.all },
    { id: "active", label: tabLabels.active, count: counts.active },
    { id: "review", label: tabLabels.review, count: counts.review },
    { id: "done", label: tabLabels.done, count: counts.done },
  ];

  function taskActions(task: ResearchTask) {
    // Per-task controls need per-task dispatch (ADR-019 phase 2) and are
    // honestly disabled in V0.1: they stay visible with their state-gated
    // labels but explain themselves instead of pretending to work (audit
    // F6). Run-level control (cancel the whole run) is the supported path.
    const buttons: Array<{
      label: string;
      run: () => void;
      variant: "secondary" | "ghost" | "danger";
      disabled: boolean;
    }> = [];
    if (task.state === "RUNNING" || task.state === "PLANNING" || task.state === "PENDING") {
      buttons.push({
        label: t("action.pause"),
        variant: "ghost",
        run: () => undefined,
        disabled: true,
      });
    }
    if (task.state === "PAUSED") {
      buttons.push({
        label: t("action.resume"),
        variant: "secondary",
        run: () => undefined,
        disabled: true,
      });
    }
    if (task.state === "FAILED") {
      buttons.push({
        label: t("action.retry"),
        variant: "secondary",
        run: () => undefined,
        disabled: true,
      });
    }
    if (task.state === "NEEDS_REVIEW") {
      buttons.push({
        label: t("action.confirmContinue"),
        variant: "secondary",
        run: () => undefined,
        disabled: true,
      });
    }
    if (!["COMPLETED", "CANCELLED", "NEEDS_REVIEW"].includes(task.state)) {
      buttons.push({
        label: t("action.cancel"),
        variant: "danger",
        run: () => undefined,
        disabled: true,
      });
    }
    return buttons;
  }

  /** Failure feedback for run-level actions: the error's user message (for
   * example the plan-approval gate, ADR-024) surfaces instead of being
   * swallowed. */
  function reportRunFailure(error: unknown) {
    const detail =
      error instanceof Error ? error.message : t("runStartFailedToast.title");
    showToast({ title: t("runStartFailedToast.title"), detail, variant: "error" });
  }

  return (
    <PageShell
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
      actions={
        run === null && plan?.status === "approved" ? (
          <Button
            variant="primary"
            onClick={() =>
              void startRun.start
                .mutateAsync()
                .then(() =>
                  showToast({
                    title: t("runStartedToast.title"),
                    detail: t("runStartedToast.detail"),
                    variant: "success",
                  }),
                )
                .catch(reportRunFailure)
            }
            loading={startRun.start.isPending}
          >
            {t("continueRun")}
          </Button>
        ) : run ? (
          <RunStateBadge run={run} />
        ) : null
      }
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={list.length === 0}
        empty={{
          title: t("empty.title"),
          description:
            plan?.status === "approved"
              ? t("empty.approved")
              : plan?.status === "draft"
                ? t("empty.draft")
                : t("empty.generic"),
          action:
            plan?.status === "approved" ? (
              <Button
                variant="primary"
                onClick={() =>
                  void startRun.start.mutateAsync().catch(reportRunFailure)
                }
              >
                {t("continueRun")}
              </Button>
            ) : undefined,
        }}
      >
        <Card className="px-lg pb-sm">
          <div className="flex min-h-[63px] flex-wrap items-center justify-between gap-sm border-b border-border">
            <div role="group" aria-label={t("filterAria")} className="flex items-center gap-md">
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
              {t("lastUpdated", { date: list[0]?.updated_at.slice(0, 10) })}
            </span>
          </div>
          {/* Narrow table strategy: header + rows share one horizontal
              scroll region so the minmax floors keep columns readable. */}
          <div className="overflow-x-auto" data-testid="tasks-table">
            <div role="presentation" className={`${TASK_GRID} py-sm text-caption text-text-muted`}>
              <span>{t("col.task")}</span>
              <span>{t("col.stage")}</span>
              <span>{t("col.status")}</span>
              <span />
            </div>
            <ol className="flex flex-col">
              {visible.map((task) => {
                const pill = statusPill(task.state, t);
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
                        {t(`common:vocab.dimension.${task.dimension}`, { defaultValue: task.dimension })}
                      </small>
                    </div>
                    <span className="text-caption text-text-secondary">
                      {t(`common:vocab.taskKind.${task.kind}`, { defaultValue: task.kind })}
                    </span>
                    <span className={`pill ${pill.pill}`}>{pill.label}</span>
                    {rowActions.length > 0 ? (
                      <Popover
                        align="end"
                        trigger={({ onClick, "aria-expanded": expanded }) => (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t("action.menuAria")}
                            aria-expanded={expanded}
                            onClick={onClick}
                            className="px-xs"
                          >
                            <Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" />
                          </Button>
                        )}
                      >
                        <div className="flex flex-col gap-sm">
                          {rowActions.map(({ label, run: fn, variant, disabled }) => (
                            <Button
                              key={label}
                              size="sm"
                              variant={variant}
                              disabled={disabled}
                              title={disabled ? t("action.unsupportedHint") : undefined}
                              aria-disabled={disabled}
                              onClick={fn}
                            >
                              {label}
                              {disabled ? (
                                <span className="text-caption text-text-muted">
                                  {t("action.unsupportedTitle")}
                                </span>
                              ) : null}
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
          </div>
        </Card>
      </PageStates>
    </PageShell>
  );
}/** The run badge never claims full completion before the results are
 * committed (migration 006): a COMPLETED execution with pending or failed
 * result delivery renders as delivering/undelivered instead. */
function RunStateBadge({ run }: { run: ResearchRun }) {
  const { t } = useTranslation("tasks");
  const undelivered =
    run.state === "COMPLETED" &&
    (run.delivery_status === "pending" || run.delivery_status === "failed");
  if (!undelivered) {
    return (
      <Badge variant={run.state === "COMPLETED" ? "success" : "accent"}>
        {t("runBadge", { state: run.state })}
      </Badge>
    );
  }
  return (
    <Badge variant="accent">
      {t(run.delivery_status === "failed" ? "runDeliveryFailed" : "runDeliveryPending")}
    </Badge>
  );
}
