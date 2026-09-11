import type {
  Project,
  ResearchConfig,
  ResearchPlan,
  ResearchRun,
  ResearchTask,
  RunEvent,
} from "@/types/domain";
import { nextUuid } from "./ids";

/**
 * Mock orchestrator: simulates the documented task state machine
 * (docs/PRD.md §7) deterministically so the UI can be developed and tested
 * offline. Only the orchestrator transitions tasks; user actions request
 * transitions through commands (pause/resume/retry/cancel).
 *
 * A tick advances every runnable task by one phase:
 *   PENDING → PLANNING → RUNNING → VALIDATING → COMPLETED
 * with scripted exceptions exercising FAILED→retry and NEEDS_REVIEW.
 */

export type RevealLevel = "none" | "sources" | "knowledge";

export interface ProjectRuntimeState {
  project: Project;
  config: ResearchConfig;
  plan: ResearchPlan | null;
  run: ResearchRun | null;
  tasks: ResearchTask[];
  events: RunEvent[];
  reveal: RevealLevel;
}

export type NowFn = () => string;

export const defaultNow: NowFn = () => new Date().toISOString();

const TERMINAL: ResearchTask["state"][] = [
  "COMPLETED",
  "NEEDS_REVIEW",
  "FAILED",
  "CANCELLED",
];

function isTerminal(state: ResearchTask["state"]): boolean {
  return TERMINAL.includes(state);
}

export function dependenciesReady(
  task: ResearchTask,
  tasks: ResearchTask[],
): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return task.dependencies.every((depId) => {
    const dep = byId.get(depId);
    // A dependency parked in NEEDS_REVIEW blocks its dependents.
    return dep?.state === "COMPLETED";
  });
}

/** Build the runtime task DAG from an approved plan. */
export function createTasksFromPlan(
  projectId: string,
  plan: ResearchPlan,
  run: ResearchRun,
  now: string,
): ResearchTask[] {
  const draftToRuntime = new Map<string, string>();

  // Pre-create ids so forward references (validation depending on
  // normalization) can be resolved.
  for (const section of plan.sections) {
    for (const draft of section.tasks) {
      draftToRuntime.set(draft.id, nextUuid());
    }
  }

  const normalizationIds: string[] = [];
  const tasks: ResearchTask[] = [];

  for (const section of plan.sections) {
    let previous: string | null = null;
    for (const draft of section.tasks) {
      const id = draftToRuntime.get(draft.id);
      if (!id) continue;
      const dependencies =
        draft.kind === "validation"
          ? [...normalizationIds]
          : previous
            ? [previous]
            : [];
      if (draft.kind === "normalization") normalizationIds.push(id);
      tasks.push({
        id,
        project_id: projectId,
        run_id: run.id,
        section_id: section.id,
        title: draft.title,
        description: draft.description,
        kind: draft.kind,
        state: "PENDING",
        dependencies,
        attempt: 1,
        idempotency_key: `${run.id}:${draft.id}`,
        checkpoint: null,
        error_code: null,
        dimension: section.dimension,
        created_at: now,
        updated_at: now,
      });
      previous = id;
    }
  }

  return tasks;
}

export interface TickOptions {
  now: NowFn;
}

/**
 * Advance every runnable task by one phase, respecting dependencies.
 * Deterministic: same state in, same state out.
 */
export function tickProject(
  state: ProjectRuntimeState,
  options: TickOptions = { now: defaultNow },
): void {
  if (!state.run || state.tasks.length === 0) return;
  if (runSettled(state)) return;

  const now = options.now();
  let sawRunning = false;
  let sawValidating = false;
  let firstSourceEvalSeen = false;

  const ordered = topologicalOrder(state.tasks);

  for (const task of ordered) {
    if (isTerminal(task.state) || task.state === "PAUSED") continue;

    switch (task.state) {
      case "PENDING": {
        if (dependenciesReady(task, state.tasks)) {
          task.state = "PLANNING";
          task.updated_at = now;
        }
        break;
      }
      case "PLANNING": {
        task.state = "RUNNING";
        task.updated_at = now;
        sawRunning = true;
        break;
      }
      case "RUNNING": {
        task.checkpoint = `phase:${task.kind}:running`;
        task.state = "VALIDATING";
        task.updated_at = now;
        sawValidating = true;
        break;
      }
      case "VALIDATING": {
        const isFirstSourceEval =
          task.kind === "source_evaluation" && !firstSourceEvalSeen;
        if (isFirstSourceEval) firstSourceEvalSeen = true;

        if (isFirstSourceEval && task.attempt === 1) {
          task.state = "FAILED";
          task.error_code = "SOURCE_PARSE_FAILED";
          task.attempt = 1;
          task.updated_at = now;
          state.events.push({
            id: nextUuid(),
            run_id: state.run.id,
            seq: state.events.length + 1,
            timestamp: now,
            type: "task.failed",
            summary: `任务「${task.title}」内容解析失败，可重试。`,
          });
        } else if (task.kind === "validation") {
          task.state = "NEEDS_REVIEW";
          task.updated_at = now;
          state.events.push({
            id: nextUuid(),
            run_id: state.run.id,
            seq: state.events.length + 1,
            timestamp: now,
            type: "validation.needs_review",
            summary: "验证阶段发现待审核项，运行暂停等待用户处理。",
          });
        } else {
          task.state = "COMPLETED";
          task.checkpoint = null;
          task.updated_at = now;
          if (task.kind === "search" && state.reveal === "none") {
            state.reveal = "sources";
          }
          if (task.kind === "normalization" && state.reveal !== "knowledge") {
            state.reveal = "knowledge";
          }
        }
        break;
      }
      default:
        break;
    }
    if (task.state === "RUNNING") sawRunning = true;
    if (task.state === "VALIDATING") sawValidating = true;
  }

  updateRunState(state, now, sawRunning, sawValidating);
}

function topologicalOrder(tasks: ResearchTask[]): ResearchTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const ordered: ResearchTask[] = [];

  function visit(task: ResearchTask, stack: Set<string>) {
    if (visited.has(task.id) || stack.has(task.id)) return;
    stack.add(task.id);
    for (const depId of task.dependencies) {
      const dep = byId.get(depId);
      if (dep) visit(dep, stack);
    }
    stack.delete(task.id);
    visited.add(task.id);
    ordered.push(task);
  }

  for (const task of tasks) visit(task, new Set());
  return ordered;
}

function updateRunState(
  state: ProjectRuntimeState,
  now: string,
  sawRunning: boolean,
  sawValidating: boolean,
): void {
  const run = state.run;
  if (!run) return;

  if (runSettled(state)) {
    const hasNeedsReview = state.tasks.some((t) => t.state === "NEEDS_REVIEW");
    const hasOpenFailures = state.tasks.some((t) => t.state === "FAILED");
    const hasPaused = state.tasks.some((t) => t.state === "PAUSED");
    if (hasNeedsReview || hasOpenFailures) {
      if (run.state !== "NEEDS_REVIEW" && run.state !== "FAILED") {
        run.state = "NEEDS_REVIEW";
        run.updated_at = now;
        state.events.push({
          id: nextUuid(),
          run_id: run.id,
          seq: state.events.length + 1,
          timestamp: now,
          type: "run.needs_review",
          summary: "本轮研究运行进入待审核，请处理待审核项或重试失败任务。",
        });
      }
    } else if (hasPaused) {
      // A user-paused task keeps the run open but not completed.
      if (run.state !== "RUNNING") {
        run.state = "RUNNING";
        run.updated_at = now;
      }
    } else if (run.state !== "COMPLETED") {
      run.state = "COMPLETED";
      run.updated_at = now;
      state.events.push({
        id: nextUuid(),
        run_id: run.id,
        seq: state.events.length + 1,
        timestamp: now,
        type: "run.completed",
        summary: "本轮研究运行完成。",
      });
    }
    return;
  }

  if (sawValidating && run.state !== "VALIDATING") {
    run.state = "VALIDATING";
    run.updated_at = now;
  } else if (sawRunning && run.state !== "RUNNING") {
    run.state = "RUNNING";
    run.updated_at = now;
  } else if (run.state === "PLANNING") {
    run.state = "PLANNING";
  }
}

/** True when no task can advance further without user action. */
export function runSettled(state: ProjectRuntimeState): boolean {
  if (!state.run) return true;
  return state.tasks.every(
    (t) =>
      isTerminal(t.state) ||
      t.state === "PAUSED" ||
      (t.state === "PENDING" && !dependenciesReady(t, state.tasks)),
  );
}

export function startRun(
  state: ProjectRuntimeState,
  plan: ResearchPlan,
  now: string,
): ResearchRun {
  const run: ResearchRun = {
    id: nextUuid(),
    project_id: state.project.id,
    plan_id: plan.id,
    state: "PLANNING",
    config_snapshot: { ...state.config },
    plan_snapshot_title: plan.title,
    started_at: now,
    updated_at: now,
  };
  state.run = run;
  state.tasks = createTasksFromPlan(state.project.id, plan, run, now);
  state.reveal = "none";
  state.events = [
    {
      id: nextUuid(),
      run_id: run.id,
      seq: 1,
      timestamp: now,
      type: "run.started",
      summary: `研究运行开始，共 ${state.tasks.length} 个任务。`,
    },
  ];
  return run;
}

export function retryTask(state: ProjectRuntimeState, taskId: string): void {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.state !== "FAILED") return;
  task.attempt += 1;
  task.state = "RUNNING";
  task.error_code = null;
  task.updated_at = defaultNow();
  state.events.push({
    id: nextUuid(),
    run_id: state.run?.id ?? "",
    seq: state.events.length + 1,
    timestamp: task.updated_at,
    type: "task.retried",
    summary: `任务「${task.title}」已重试（第 ${task.attempt} 次尝试）。`,
  });
}
