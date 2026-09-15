import { useCallback, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Dialog, Input, Textarea, useToast } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { ResearchStatusBadge } from "@/components/cards";
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

/**
 * Prototype `plan-summary` cell; every cell but the first gets a leading
 * rule from md up (the strip is 2×2 below md, where rules would read as row
 * separators instead of column dividers).
 */
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
    <div className={`flex flex-col gap-xs ${first ? "" : "md:border-l md:border-border md:pl-lg"}`}>
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
 * names (App.test.tsx pins 批准计划/拒绝计划/重新生成/开始运行). All chrome
 * strings go through t() (ADR-023, "plan" namespace); the task-kind and
 * plan-status vocabularies resolve through common:vocab.*.
 */
export function PlanPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation("plan");
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
      reportError(err, t("actionError.fallback"));
    }
  }

  const kicker = plan
    ? t("kicker", {
        status:
          plan.status === "draft"
            ? t("statusDraft")
            : t(`common:vocab.planStatus.${plan.status}`, { defaultValue: plan.status }),
      })
    : undefined;

  return (
    <PageShell
      kicker={kicker}
      title={plan?.title ?? t("fallbackTitle")}
      description={plan ? plan.rationale : t("noPlanDescription")}
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
                  {t("regenerate")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void act(() => actions.reject.mutateAsync())}
                  loading={actions.reject.isPending}
                >
                  {t("reject")}
                </Button>
                <Button
                  variant="primary"
                  aria-label={t("approveAria")}
                  onClick={() => void act(() => actions.approve.mutateAsync())}
                  loading={actions.approve.isPending}
                >
                  {t("approve")}
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
                        title: t("runStartedToast.title"),
                        detail: t("runStartedToast.detail"),
                        variant: "success",
                      }),
                    )
                    .catch((err) => reportError(err, t("runStartFailed")))
                }
                loading={runActions.start.isPending}
              >
                {t("startRun")}
              </Button>
            ) : null}
            {plan.status === "rejected" ? (
              <Button
                variant="primary"
                onClick={() => void act(() => actions.regenerate.mutateAsync())}
                loading={actions.regenerate.isPending}
              >
                {t("regenerateApproved")}
              </Button>
            ) : null}
          </>
        ) : plan === null && !isLoading ? (
          <Button
            variant="primary"
            onClick={() => void act(() => actions.regenerate.mutateAsync())}
            loading={actions.regenerate.isPending}
          >
            {t("generate")}
          </Button>
        ) : null
      }
    >
      {actionError ? (
        <div className="mb-lg">
          <Alert variant="error" title={t("actionError.title")}>
            {actionError}
          </Alert>
        </div>
      ) : null}

      {run ? (
        <div className="mb-lg">
          <Alert variant="info" title={t("runAlert.title", { state: run.state })}>
            {t("runAlert.detail", { total: (tasks ?? []).length })}
          </Alert>
        </div>
      ) : null}

      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={plan === null}
        empty={{
          title: t("empty.title"),
          description: t("empty.description"),
          action: (
            <Button variant="primary" onClick={() => void act(() => actions.regenerate.mutateAsync())}>
              {t("generate")}
            </Button>
          ),
        }}
      >
        {plan ? (
          <Card className="overflow-hidden p-0">
            {/* 汇总条：全部来自真实查询，不用原型里的示意数字。 */}
            <div
              data-testid="plan-summary"
              className="grid grid-cols-2 gap-y-md border-b border-border bg-overlay-hairline px-lg py-md md:grid-cols-4"
            >
              <SummaryCell label={t("summary.tasks")} value={plannedTasks} first />
              <SummaryCell label={t("summary.sources")} value={(sources ?? []).length} />
              <SummaryCell label={t("summary.dimensions")} value={config?.dimensions.length ?? 0} />
              <SummaryCell label={t("summary.reviews")} value={reviewClaims} />
            </div>
            <div data-testid="plan-tree" className="px-lg pb-lg">
              {plan.sections.map((section, sectionIndex) => {
                const isCollapsed = collapsedGroups.has(section.id);
                return (
                  <div key={section.id} className="border-b border-border last:border-b-0">
                    <div className="grid grid-cols-[22px_35px_1fr_auto_24px] items-center gap-sm py-md">
                      <span
                        aria-hidden="true"
                        className="flex justify-center text-caption text-text-muted select-none"
                      >
                        <GripVertical size={16} strokeWidth={1.75} />
                      </span>
                      <span className="font-mono text-micro font-bold text-info">
                        {groupNumber(sectionIndex)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-label text-text-primary">{section.title}</p>
                        <p className="mt-xs text-caption text-text-muted">{section.rationale}</p>
                      </div>
                      <span className="text-caption text-text-muted">
                        {t("group.taskCount", { total: section.tasks.length })}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={isCollapsed ? t("group.expandAria") : t("group.collapseAria")}
                        aria-expanded={!isCollapsed}
                        className="h-auto px-xs py-0 text-caption"
                        onClick={() => toggleGroup(section.id)}
                      >
                        <ChevronDown
                          size={16}
                          strokeWidth={1.75}
                          aria-hidden="true"
                          className={`transition-transform duration-[var(--morpho-motion-fast)] ${
                            isCollapsed ? "" : "rotate-180"
                          }`}
                        />
                      </Button>
                    </div>
                    {isCollapsed
                      ? null
                      : section.tasks.map((task, taskIndex) => (
                          <div
                            key={task.id}
                            className="ml-6 grid grid-cols-[42px_1fr] items-center gap-sm border-t border-border py-sm md:ml-[68px] md:grid-cols-[42px_1fr_auto]"
                          >
                            <span className="font-mono text-nano text-text-muted">
                              {groupNumber(sectionIndex)}.{taskIndex + 1}
                            </span>
                            <span className="min-w-0 text-body text-text-primary">
                              {task.title}
                            </span>
                            {/* Below md the kind/edit meta wraps to a second
                                row in the title column instead of crushing
                                the title against the tree indent. */}
                            <span className="col-start-2 flex items-center gap-sm md:col-start-auto">
                              <span className="text-caption text-text-muted">
                                {t(`common:vocab.taskKind.${task.kind}`, { defaultValue: task.kind })}
                              </span>
                              {editable ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditDialog(task)}
                                >
                                  {t("task.edit")}
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
            <Alert title={t("locked.title")}>
              {t("locked.detail")}
            </Alert>
          </div>
        ) : null}
      </PageStates>

      <Dialog
        open={editing !== null}
        onClose={closeEditing}
        title={t("editDialog.title")}
        description={t("editDialog.description")}
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
              .catch((err) => reportError(err, t("editDialog.saveFailed")));
          }}
        >
          <div className="flex flex-col gap-xs">
            <label htmlFor="task-title" className="text-label text-text-secondary">
              {t("editDialog.titleLabel")}
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
              {t("editDialog.descriptionLabel")}
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
              {t("editDialog.cancel")}
            </Button>
            <Button variant="primary" type="submit" loading={actions.updateTask.isPending}>
              {t("editDialog.save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </PageShell>
  );
}
