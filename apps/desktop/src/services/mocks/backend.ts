import type {
  ResearchConfig,
  ResearchGap,
  ResearchTask,
  RunEvent,
  SavedDecision,
} from "@/types/domain";
import { researchConfigSchema } from "@/types/schemas";
import { MorphoError, type ErrorCode, type ErrorPayload } from "../errors";
import type { CommandName, CommandRequest, CommandResponse } from "../commands";
import {
  claimsA,
  configA,
  evidenceA,
  nodesA,
  planA,
  projectA,
  PROJECT_A_ID,
  PROJECT_B_ID,
  relationsA,
  sourcesA,
} from "./fixtures-a";
import {
  claimsB,
  configB,
  evidenceB,
  eventsB,
  nodesB,
  planB,
  projectB,
  relationsB,
  runB,
  sourcesB,
  tasksB,
} from "./fixtures-b";
import { nextUuid } from "./ids";
import {
  defaultNow,
  retryTask,
  runSettled,
  startRun,
  tickProject,
  type ProjectRuntimeState,
} from "./orchestrator";
import { generatePlanForConfig } from "./planner";
import {
  assistantRespond,
  collectPendingReviews,
  computeAssistantContext,
} from "./assistant";
import {
  buildTimeline,
  computeGaps,
  computeCoverage,
  toGraphProjection,
  type GapProposalRecord,
  type ProjectionInput,
  type ProjectDataset,
} from "./projections";

/**
 * In-memory mock backend: multi-project store, command handlers, fault
 * injection, and a deterministic simulation tick. Data never leaves the
 * process; there is no network, provider, filesystem, or SQLite access —
 * the mock stands in for the Rust/worker boundary until W2-05 lands.
 */

interface StoredProject {
  state: ProjectRuntimeState;
  dataset: ProjectDataset;
  decisions: Map<string, GapProposalRecord>;
  savedDecisions: SavedDecision[];
}

function wireReferences(dataset: ProjectDataset): void {
  // Fill reverse references so fixtures stay consistent: node.claim_ids and
  // claim.evidence_ids derive from the authoritative claim/evidence lists.
  const claimsByNode = new Map<string, string[]>();
  for (const claim of dataset.claims) {
    const list = claimsByNode.get(claim.subject_node_id) ?? [];
    list.push(claim.id);
    claimsByNode.set(claim.subject_node_id, list);
  }
  for (const node of dataset.nodes) {
    node.claim_ids = claimsByNode.get(node.id) ?? [];
  }
  const evidenceByClaim = new Map<string, string[]>();
  for (const evidence of dataset.evidence) {
    const list = evidenceByClaim.get(evidence.claim_id) ?? [];
    list.push(evidence.id);
    evidenceByClaim.set(evidence.claim_id, list);
  }
  for (const claim of dataset.claims) {
    claim.evidence_ids = evidenceByClaim.get(claim.id) ?? [];
  }
}

function seedProjectA(): StoredProject {
  const dataset: ProjectDataset = {
    sources: structuredClone(sourcesA),
    nodes: structuredClone(nodesA),
    claims: structuredClone(claimsA),
    evidence: structuredClone(evidenceA),
    relations: structuredClone(relationsA),
  };
  wireReferences(dataset);
  return {
    state: {
      project: structuredClone(projectA),
      config: structuredClone(configA),
      plan: structuredClone(planA),
      run: null,
      tasks: [],
      events: [],
      reveal: "none",
    },
    dataset,
    decisions: new Map(),
    savedDecisions: [],
  };
}

function seedProjectB(): StoredProject {
  const dataset: ProjectDataset = {
    sources: structuredClone(sourcesB),
    nodes: structuredClone(nodesB),
    claims: structuredClone(claimsB),
    evidence: structuredClone(evidenceB),
    relations: structuredClone(relationsB),
  };
  wireReferences(dataset);
  return {
    state: {
      project: structuredClone(projectB),
      config: structuredClone(configB),
      plan: structuredClone(planB),
      run: structuredClone(runB),
      tasks: structuredClone(tasksB),
      events: structuredClone(eventsB),
      reveal: "knowledge",
    },
    dataset,
    decisions: new Map(),
    savedDecisions: [],
  };
}

export function defaultConfigForNewProject(topic: string): ResearchConfig {
  return {
    schema_version: "1.0",
    domain: "",
    topic,
    purpose: "learning",
    audience: "",
    depth: 2,
    dimensions: ["concepts", "technology", "applications"],
    time_range: { from: null, to: null },
    geographic_scope: "",
    languages: ["zh"],
    source_types: ["web_page", "paper"],
    source_domains: [],
    update_frequency: "manual",
  };
}

export class MockBackend {
  private projects = new Map<string, StoredProject>();
  private faultQueue: Array<{
    command?: CommandName;
    payload: ErrorPayload;
  }> = [];

  constructor() {
    this.reset();
  }

  /** Re-seed pristine fixture state (test isolation). */
  reset(): void {
    this.projects = new Map();
    this.projects.set(PROJECT_A_ID, seedProjectA());
    this.projects.set(PROJECT_B_ID, seedProjectB());
    this.faultQueue = [];
  }

  /** Queue a fault for the next matching invoke (fault injection). */
  armFault(options: { command?: CommandName; payload?: Partial<ErrorPayload> }): void {
    this.faultQueue.push({
      command: options.command,
      payload: {
        code: (options.payload?.code ?? "DATABASE_ERROR") as ErrorCode,
        user_message: options.payload?.user_message ?? "本地服务暂时不可用，请稍后重试。",
        developer_detail: options.payload?.developer_detail ?? "injected mock fault",
        retryable: options.payload?.retryable ?? true,
        correlation_id: options.payload?.correlation_id ?? nextUuid(),
      },
    });
  }

  /**
   * Advance the simulation by one tick for every project. Exposed for
   * deterministic tests; the demo UI uses the backend's interval instead.
   */
  step(): void {
    for (const stored of this.projects.values()) {
      tickProject(stored.state, { now: defaultNow });
    }
  }

  get storedProjects(): StoredProject[] {
    return [...this.projects.values()];
  }

  requireState(projectId: string): ProjectRuntimeState {
    const stored = this.projects.get(projectId);
    if (!stored) {
      throw new MorphoError({
        code: "NOT_FOUND",
        user_message: "项目不存在或已被删除。",
        developer_detail: `project ${projectId} not found in mock store`,
        retryable: false,
        correlation_id: nextUuid(),
      });
    }
    return stored.state;
  }

  private requireStored(projectId: string): StoredProject {
    const stored = this.projects.get(projectId);
    if (!stored) {
      throw new MorphoError({
        code: "NOT_FOUND",
        user_message: "项目不存在或已被删除。",
        developer_detail: `project ${projectId} not found in mock store`,
        retryable: false,
        correlation_id: nextUuid(),
      });
    }
    return stored;
  }

  private projectionInput(projectId: string): ProjectionInput {
    const stored = this.requireStored(projectId);
    return { state: stored.state, dataset: stored.dataset };
  }

  private pendingReviewItems(projectId: string) {
    return collectPendingReviews(this.projectionInput(projectId));
  }

  /** Central command dispatch used by the mock transport. */
  handle<K extends CommandName>(
    command: K,
    payload: CommandRequest<K>,
  ): CommandResponse<K> {
    const queued = this.faultQueue.findIndex(
      (f) => f.command === undefined || f.command === command,
    );
    if (queued >= 0) {
      const [fault] = this.faultQueue.splice(queued, 1);
      throw new MorphoError(fault.payload);
    }

    switch (command) {
      case "project.list":
        return [...this.projects.values()]
          .map((p) => p.state.project)
          .sort((a, b) => a.created_at.localeCompare(b.created_at)) as CommandResponse<K>;

      case "project.create": {
        const request = payload as CommandRequest<"project.create">;
        const name = request.name.trim();
        if (!name) {
          throw new MorphoError({
            code: "VALIDATION_FAILED",
            user_message: "项目名称不能为空。",
            developer_detail: "empty project name",
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        const now = new Date().toISOString();
        const project = {
          id: nextUuid(),
          name,
          description: request.description.trim(),
          created_at: now,
          updated_at: now,
        };
        const stored: StoredProject = {
          state: {
            project,
            config: defaultConfigForNewProject(name),
            plan: null,
            run: null,
            tasks: [],
            events: [],
            reveal: "none",
          },
          dataset: { sources: [], nodes: [], claims: [], evidence: [], relations: [] },
          decisions: new Map(),
          savedDecisions: [],
        };
        this.projects.set(project.id, stored);
        return project as CommandResponse<K>;
      }

      case "project.get":
        return this.requireState((payload as { project_id: string }).project_id)
          .project as CommandResponse<K>;

      case "config.get":
        return this.requireState((payload as { project_id: string }).project_id)
          .config as CommandResponse<K>;

      case "config.update": {
        const request = payload as CommandRequest<"config.update">;
        const state = this.requireState(request.project_id);
        // Parse → validate → normalize → persist (docs/PRD.md §11).
        const parsed = researchConfigSchema.safeParse(request.config);
        if (!parsed.success) {
          throw new MorphoError({
            code: "VALIDATION_FAILED",
            user_message: "研究配置未通过校验，请检查必填项。",
            developer_detail: parsed.error.issues.map((i) => i.message).join("; "),
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        state.config = parsed.data;
        state.project.updated_at = new Date().toISOString();
        return state.config as CommandResponse<K>;
      }

      case "plan.get":
        return (this.requireState((payload as { project_id: string }).project_id)
          .plan ?? null) as CommandResponse<K>;

      case "plan.regenerate": {
        const projectId = (payload as { project_id: string }).project_id;
        const state = this.requireState(projectId);
        const now = new Date().toISOString();
        const plan = generatePlan(state, now);
        state.plan = plan;
        return plan as CommandResponse<K>;
      }

      case "plan.updateTask": {
        const request = payload as CommandRequest<"plan.updateTask">;
        const state = this.requireState(request.project_id);
        if (!state.plan) {
          throw new MorphoError({
            code: "NOT_FOUND",
            user_message: "还没有研究计划，请先生成。",
            developer_detail: "plan.updateTask without plan",
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        if (state.plan.status !== "draft") {
          throw new MorphoError({
            code: "CONFLICT",
            user_message: "只有待审查的计划可以编辑。",
            developer_detail: `plan status ${state.plan.status}`,
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        for (const section of state.plan.sections) {
          for (const draft of section.tasks) {
            if (draft.id === request.task_id) {
              draft.title = request.title.trim() || draft.title;
              draft.description = request.description;
            }
          }
        }
        state.plan.updated_at = new Date().toISOString();
        return state.plan as CommandResponse<K>;
      }

      case "plan.approve": {
        const projectId = (payload as { project_id: string }).project_id;
        const state = this.requireState(projectId);
        if (!state.plan) {
          throw new MorphoError({
            code: "NOT_FOUND",
            user_message: "还没有研究计划，请先生成。",
            developer_detail: "plan.approve without plan",
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        state.plan.status = "approved";
        state.plan.updated_at = new Date().toISOString();
        return state.plan as CommandResponse<K>;
      }

      case "plan.reject": {
        const projectId = (payload as { project_id: string }).project_id;
        const state = this.requireState(projectId);
        if (!state.plan) {
          throw new MorphoError({
            code: "NOT_FOUND",
            user_message: "还没有研究计划，请先生成。",
            developer_detail: "plan.reject without plan",
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        state.plan.status = "rejected";
        state.plan.updated_at = new Date().toISOString();
        return state.plan as CommandResponse<K>;
      }

      case "run.get":
        return (this.requireState((payload as { project_id: string }).project_id)
          .run ?? null) as CommandResponse<K>;

      case "run.start": {
        const projectId = (payload as { project_id: string }).project_id;
        const state = this.requireState(projectId);
        if (!state.plan || state.plan.status !== "approved") {
          throw new MorphoError({
            code: "CONFLICT",
            user_message: "只有批准的计划才能开始运行。",
            developer_detail: "run.start requires an approved plan",
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        const run = startRun(state, state.plan, new Date().toISOString());
        return run as CommandResponse<K>;
      }

      case "task.list":
        return this.requireState((payload as { project_id: string }).project_id)
          .tasks as CommandResponse<K>;

      case "task.pause":
      case "task.resume":
      case "task.retry":
      case "task.cancel": {
        const request = payload as CommandRequest<"task.pause">;
        const state = this.requireState(request.project_id);
        return this.taskAction(state, command, request.task_id) as CommandResponse<K>;
      }

      case "source.list":
        return this.revealedSources((payload as { project_id: string }).project_id) as CommandResponse<K>;

      case "knowledge.list":
        return this.revealedNodes((payload as { project_id: string }).project_id) as CommandResponse<K>;

      case "claim.list":
        return this.revealedClaims((payload as { project_id: string }).project_id) as CommandResponse<K>;

      case "evidence.listByClaim": {
        const request = payload as CommandRequest<"evidence.listByClaim">;
        const stored = this.requireStored(request.project_id);
        if (stored.state.reveal !== "knowledge") return [] as CommandResponse<K>;
        return stored.dataset.evidence.filter(
          (e) => e.claim_id === request.claim_id,
        ) as CommandResponse<K>;
      }

      case "relation.list":
        return this.revealedRelations((payload as { project_id: string }).project_id) as CommandResponse<K>;

      case "graph.get":
        return toGraphProjection(
          this.projectionInput((payload as { project_id: string }).project_id),
        ) as CommandResponse<K>;

      case "coverage.get":
        return computeCoverage(
          this.projectionInput((payload as { project_id: string }).project_id),
        ) as CommandResponse<K>;

      case "gap.list":
        return computeGaps(
          this.projectionInput((payload as { project_id: string }).project_id),
          this.requireStored((payload as { project_id: string }).project_id)
            .decisions,
        ) as CommandResponse<K>;

      case "gap.approveProposal":
      case "gap.dismissProposal": {
        const request = payload as CommandRequest<"gap.approveProposal">;
        const stored = this.requireStored(request.project_id);
        const report = computeGaps(
          { state: stored.state, dataset: stored.dataset },
          stored.decisions,
        );
        const gap = report.gaps.find((g) => g.id === request.gap_id);
        if (!gap) {
          throw new MorphoError({
            code: "NOT_FOUND",
            user_message: "该缺口建议不存在或已失效。",
            developer_detail: `gap ${request.gap_id} not found`,
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        if (command === "gap.dismissProposal") {
          stored.decisions.set(gap.dimension, {
            status: "dismissed",
            created_task_id: null,
          });
        } else {
          if (gap.proposal_status === "approved") {
            return computeGaps(
              { state: stored.state, dataset: stored.dataset },
              stored.decisions,
            ) as CommandResponse<K>;
          }
          const task = this.createGapTask(stored, gap);
          stored.decisions.set(gap.dimension, {
            status: "approved",
            created_task_id: task.id,
          });
        }
        return computeGaps(
          { state: stored.state, dataset: stored.dataset },
          stored.decisions,
        ) as CommandResponse<K>;
      }

      case "timeline.get":
        return buildTimeline(
          this.projectionInput((payload as { project_id: string }).project_id),
        ) as CommandResponse<K>;

      case "assistant.getContext": {
        const projectId = (payload as { project_id: string }).project_id;
        return computeAssistantContext(
          this.requireState(projectId),
          this.pendingReviewItems(projectId).length,
        ) as CommandResponse<K>;
      }

      case "assistant.act": {
        const request = payload as CommandRequest<"assistant.act">;
        const input = this.projectionInput(request.project_id);
        const reviews = collectPendingReviews(input);
        return assistantRespond(input, request.action, reviews) as CommandResponse<K>;
      }

      case "assistant.saveDecision": {
        const request = payload as CommandRequest<"assistant.saveDecision">;
        const stored = this.requireStored(request.project_id);
        const content = request.content.trim();
        if (!content) {
          throw new MorphoError({
            code: "VALIDATION_FAILED",
            user_message: "决定内容不能为空。",
            developer_detail: "empty decision content",
            retryable: false,
            correlation_id: nextUuid(),
          });
        }
        const decision: SavedDecision = {
          id: nextUuid(),
          project_id: request.project_id,
          content,
          saved_at: new Date().toISOString(),
        };
        stored.savedDecisions.push(decision);
        return decision as CommandResponse<K>;
      }

      case "assistant.listDecisions":
        return this.requireStored((payload as { project_id: string }).project_id)
          .savedDecisions as CommandResponse<K>;

      default: {
        throw new MorphoError({
          code: "DATABASE_ERROR",
          user_message: "未知的内部命令。",
          developer_detail: `unhandled command: ${command satisfies never}`,
          retryable: false,
          correlation_id: nextUuid(),
        });
      }
    }
  }

  private taskAction(
    state: ProjectRuntimeState,
    command: "task.pause" | "task.resume" | "task.retry" | "task.cancel",
    taskId: string,
  ): ResearchTask {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new MorphoError({
        code: "NOT_FOUND",
        user_message: "任务不存在。",
        developer_detail: `task ${taskId} not found`,
        retryable: false,
        correlation_id: nextUuid(),
      });
    }
    const now = new Date().toISOString();

    switch (command) {
      case "task.pause":
        if (task.state !== "RUNNING" && task.state !== "PLANNING" && task.state !== "PENDING") {
          throw conflict(`只有运行中的任务可以暂停（当前 ${task.state}）。`, task.state);
        }
        task.state = "PAUSED";
        break;
      case "task.resume":
        if (task.state !== "PAUSED") {
          throw conflict("只有暂停中的任务可以恢复。", task.state);
        }
        task.state = "PENDING";
        task.checkpoint = "resumed";
        break;
      case "task.retry":
        if (task.state !== "FAILED" && task.state !== "NEEDS_REVIEW") {
          throw conflict("只有失败或待审核的任务可以重试。", task.state);
        }
        if (task.state === "FAILED") {
          retryTask(state, taskId);
          return state.tasks.find((t) => t.id === taskId) as ResearchTask;
        }
        // NEEDS_REVIEW → user accepted current content, resume pipeline.
        task.state = "COMPLETED";
        break;
      case "task.cancel":
        if (task.state === "COMPLETED" || task.state === "CANCELLED") {
          throw conflict("该任务已结束，不能取消。", task.state);
        }
        task.state = "CANCELLED";
        break;
    }
    task.updated_at = now;
    if (state.run) {
      state.run.updated_at = now;
      if (runSettled(state)) {
        const hasReview = state.tasks.some((t) => t.state === "NEEDS_REVIEW");
        state.run.state = hasReview ? "NEEDS_REVIEW" : "COMPLETED";
      }
    }
    return task;
  }

  private createGapTask(
    stored: StoredProject,
    gap: ResearchGap,
  ): ResearchTask {
    const now = new Date().toISOString();
    const task: ResearchTask = {
      id: nextUuid(),
      project_id: stored.state.project.id,
      run_id: stored.state.run?.id ?? null,
      section_id: stored.state.plan?.sections[0]?.id ?? nextUuid(),
      title: gap.proposed_task.title,
      description: gap.proposed_task.description,
      kind: "search",
      state: "PENDING",
      dependencies: [],
      attempt: 0,
      idempotency_key: `gap:${gap.id}`,
      checkpoint: null,
      error_code: null,
      dimension: gap.dimension,
      created_at: now,
      updated_at: now,
    };
    stored.state.tasks.push(task);
    stored.state.project.updated_at = now;
    const event: RunEvent = {
      id: nextUuid(),
      run_id: stored.state.run?.id ?? "",
      seq: stored.state.events.length + 1,
      timestamp: now,
      type: "task.created_from_gap",
      summary: `用户批准缺口建议，已创建任务「${task.title}」。`,
    };
    stored.state.events.push(event);
    return task;
  }

  private revealedSources(projectId: string) {
    const stored = this.requireStored(projectId);
    return stored.state.reveal === "none" ? [] : stored.dataset.sources;
  }

  private revealedNodes(projectId: string) {
    const stored = this.requireStored(projectId);
    return stored.state.reveal === "knowledge" ? stored.dataset.nodes : [];
  }

  private revealedClaims(projectId: string) {
    const stored = this.requireStored(projectId);
    return stored.state.reveal === "knowledge" ? stored.dataset.claims : [];
  }

  private revealedRelations(projectId: string) {
    const stored = this.requireStored(projectId);
    return stored.state.reveal === "knowledge" ? stored.dataset.relations : [];
  }
}

function conflict(message: string, detail: string): MorphoError {
  return new MorphoError({
    code: "CONFLICT",
    user_message: message,
    developer_detail: detail,
    retryable: false,
    correlation_id: nextUuid(),
  });
}

function generatePlan(
  state: ProjectRuntimeState,
  now: string,
): ReturnType<typeof generatePlanForConfig> {
  return generatePlanForConfig(state.project.id, state.config, now);
}

/** Shared singleton; tests call reset() for isolation. */
export const mockBackend = new MockBackend();
