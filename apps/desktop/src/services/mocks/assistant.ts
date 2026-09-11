import type {
  AssistantAction,
  AssistantContext,
  AssistantItem,
  AssistantResponse,
  Claim,
  ResearchGap,
  ResearchTask,
} from "@/types/domain";
import { dimensionLabel } from "@/types/labels";
import type { ProjectRuntimeState } from "./orchestrator";
import type { ProjectionInput } from "./projections";
import { computeGaps } from "./projections";

/**
 * Rule-based assistant responses (docs/PRD.md §12). The assistant is a
 * contextual research tool with exactly four first-round actions; it reads
 * project state only — no provider calls, no persistence beyond the
 * explicitly saved decisions.
 */

export function computeAssistantContext(
  state: ProjectRuntimeState,
  pendingReviews: number,
): AssistantContext {
  const total = state.tasks.length;
  const completed = state.tasks.filter((t) => t.state === "COMPLETED").length;
  return {
    project_id: state.project.id,
    project_name: state.project.name,
    topic: state.config.topic,
    plan_status: state.plan?.status ?? "none",
    tasks_total: total,
    tasks_completed: completed,
    pending_reviews: pendingReviews,
  };
}

export function assistantRespond(
  input: ProjectionInput,
  action: AssistantAction,
  pendingReviews: AssistantItem[],
): AssistantResponse {
  const { state } = input;
  const base = {
    project_id: state.project.id,
    created_at: new Date().toISOString(),
  };

  if (action === "explain_progress") {
    const completed = state.tasks.filter((t) => t.state === "COMPLETED").length;
    const total = state.tasks.length;
    const items: AssistantItem[] = state.plan
      ? state.plan.sections.map((section) => {
          const sectionTasks = state.tasks.filter(
            (t) => t.section_id === section.id,
          );
          const done = sectionTasks.filter((t) => t.state === "COMPLETED").length;
          return {
            label: section.title,
            detail:
              sectionTasks.length > 0
                ? `${done}/${sectionTasks.length} 个任务完成。`
                : "尚未开始执行。",
          };
        })
      : [{ label: "研究计划", detail: "尚未生成计划，请先配置并生成研究计划。" }];

    return {
      ...base,
      action,
      summary:
        total > 0
          ? `项目「${state.project.name}」共 ${total} 个任务，已完成 ${completed} 个；${
              state.run ? `当前运行状态 ${state.run.state}。` : "尚未开始运行。"
            }`
          : `项目「${state.project.name}」还没有可执行任务；${planAdvice(state)}。`,
      items,
    };
  }

  if (action === "suggest_next_task") {
    const suggestion = nextSuggestion(input, pendingReviews);
    return {
      ...base,
      action,
      summary: suggestion.summary,
      items: suggestion.items,
    };
  }

  // list_pending_reviews
  return {
    ...base,
    action,
    summary:
      pendingReviews.length > 0
        ? `当前有 ${pendingReviews.length} 个待审核项，处理后再继续综合阶段。`
        : "当前没有待审核项。",
    items: pendingReviews,
  };
}

function planAdvice(state: ProjectRuntimeState): string {
  if (!state.plan) return "请先生成研究计划";
  if (state.plan.status === "draft") return "计划等待审查批准";
  if (state.plan.status === "rejected") return "计划已拒绝，可调整配置后重新生成";
  return "计划已批准，可以开始运行";
}

function nextSuggestion(
  input: ProjectionInput,
  pendingReviews: AssistantItem[],
): { summary: string; items: AssistantItem[] } {
  const { state } = input;

  if (!state.plan || state.plan.status === "rejected") {
    return {
      summary: "下一步：生成或重新生成研究计划，审批后才能执行任务。",
      items: [],
    };
  }
  if (state.plan.status === "draft") {
    return {
      summary: "下一步：审查研究计划，可直接修改任务描述后批准或拒绝。",
      items: state.plan.sections.flatMap((s) =>
        s.tasks.slice(0, 1).map((t) => ({ label: s.title, detail: t.title })),
      ),
    };
  }

  const failed = state.tasks.find((t) => t.state === "FAILED");
  if (failed) {
    return {
      summary: `任务「${failed.title}」上次执行失败（${failed.error_code ?? "未知错误"}），建议先重试。`,
      items: [{ label: "重试任务", detail: failed.title }],
    };
  }

  const paused = state.tasks.find((t) => t.state === "PAUSED");
  if (paused) {
    return {
      summary: `任务「${paused.title}」处于暂停状态，恢复后可继续执行。`,
      items: [{ label: "恢复任务", detail: paused.title }],
    };
  }

  if (pendingReviews.length > 0) {
    return {
      summary: "存在待审核项，建议先处理审核队列。",
      items: pendingReviews,
    };
  }

  const runnable = state.tasks.find(
    (t) => t.state === "PENDING" || t.state === "PLANNING" || t.state === "RUNNING" || t.state === "VALIDATING",
  );
  if (runnable) {
    return {
      summary: `运行进行中，当前推进到「${runnable.title}」。`,
      items: [{ label: "运行中", detail: runnable.title }],
    };
  }

  if (state.tasks.length > 0) {
    const gaps = computeGaps(input, new Map());
    const firstGap: ResearchGap | undefined = gaps.gaps[0];
    if (firstGap) {
      return {
        summary: `本轮任务已全部收尾。建议按缺口研究补充「${dimensionLabel(firstGap.dimension)}」维度（需你批准后才会创建任务）。`,
        items: [
          { label: firstGap.proposed_task.title, detail: firstGap.rule },
        ],
      };
    }
    return {
      summary: "本轮任务已收尾且没有明显缺口，可以开启新一轮增量研究。",
      items: [],
    };
  }

  return {
    summary: "计划已批准，下一步：开始第一轮研究运行。",
    items: [],
  };
}

/** Items that currently require explicit user review. */
export function collectPendingReviews(input: ProjectionInput): AssistantItem[] {
  const { state, dataset } = input;
  const items: AssistantItem[] = [];

  for (const task of state.tasks) {
    if (task.state === "NEEDS_REVIEW") {
      items.push({
        label: `任务待审核：${task.title}`,
        detail: "验证阶段发现需要人工确认的内容。",
      });
    }
  }

  const conflicts: Claim[] =
    state.reveal === "knowledge"
      ? dataset.claims.filter((c) => c.status === "conflicting")
      : [];
  for (const claim of conflicts) {
    items.push({
      label: "矛盾论断待确认",
      detail: `「${claim.predicate} → ${claim.object_value}」同时存在支持与反驳证据，双方均已保留。`,
    });
  }

  return items;
}

export function pendingTaskReviews(state: ProjectRuntimeState): ResearchTask[] {
  return state.tasks.filter((t) => t.state === "NEEDS_REVIEW");
}
