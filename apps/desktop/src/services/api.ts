import {
  projectSchema,
  researchConfigSchema,
  savedDecisionSchema,
} from "@/types/schemas";
import type {
  AssistantAction,
  CoreInfo,
  Project,
  ProviderKeyStatus,
  ResearchConfig,
  ResearchPlan,
  ResearchRun,
  ResearchTask,
  SavedDecision,
  VaultExportSummary,
} from "@/types/domain";
import { getTransport } from "./transportProvider";
import type {
  AssistantActRequest,
  AssistantRecordDecisionRequest,
  ConfigUpdateRequest,
  GapActionRequest,
  PlanTaskUpdateRequest,
  ProjectCreateRequest,
  ProjectScopedRequest,
  SecretsSetProviderKeyRequest,
  TaskActionRequest,
} from "./commands";

/**
 * Typed service functions — the boundary features are allowed to call.
 * Every function validates its inputs against the documented schemas and
 * delegates to the transport; components never invoke the transport
 * directly.
 */

export const projectService = {
  list(): Promise<Project[]> {
    return getTransport().invoke("project.list", {});
  },
  create(request: ProjectCreateRequest): Promise<Project> {
    const name = projectSchema.shape.name.parse(request.name);
    return getTransport().invoke("project.create", { name, description: request.description });
  },
  /** Rust `project_archive`; null means the project id was unknown. */
  archive(request: ProjectScopedRequest): Promise<Project | null> {
    return getTransport().invoke("project.archive", request);
  },
};

export const configService = {
  get(request: ProjectScopedRequest): Promise<ResearchConfig> {
    return getTransport().invoke("config.get", request);
  },
  update(request: ConfigUpdateRequest): Promise<ResearchConfig> {
    // Parse → validate before crossing the boundary.
    const config = researchConfigSchema.parse(request.config);
    return getTransport().invoke("config.update", { ...request, config });
  },
};

export const planService = {
  get(request: ProjectScopedRequest): Promise<ResearchPlan | null> {
    return getTransport().invoke("plan.get", request);
  },
  regenerate(request: ProjectScopedRequest): Promise<ResearchPlan> {
    return getTransport().invoke("plan.regenerate", request);
  },
  updateTask(request: PlanTaskUpdateRequest): Promise<ResearchPlan> {
    const title = request.title.trim();
    if (!title) {
      return Promise.reject(
        new Error("任务标题不能为空。"),
      );
    }
    return getTransport().invoke("plan.updateTask", { ...request, title });
  },
  approve(request: ProjectScopedRequest): Promise<ResearchPlan> {
    return getTransport().invoke("plan.approve", request);
  },
  reject(request: ProjectScopedRequest): Promise<ResearchPlan> {
    return getTransport().invoke("plan.reject", request);
  },
};

export const runService = {
  get(request: ProjectScopedRequest): Promise<ResearchRun | null> {
    return getTransport().invoke("run.get", request);
  },
  start(request: ProjectScopedRequest): Promise<ResearchRun> {
    return getTransport().invoke("run.start", request);
  },
  /** Rust `run_cancel`: cancels the project's session run. */
  cancel(request: ProjectScopedRequest): Promise<boolean> {
    return getTransport().invoke("run.cancel", request);
  },
};

export const taskService = {
  list(request: ProjectScopedRequest): Promise<ResearchTask[]> {
    return getTransport().invoke("task.list", request);
  },
  pause(request: TaskActionRequest): Promise<ResearchTask> {
    return getTransport().invoke("task.pause", request);
  },
  resume(request: TaskActionRequest): Promise<ResearchTask> {
    return getTransport().invoke("task.resume", request);
  },
  retry(request: TaskActionRequest): Promise<ResearchTask> {
    return getTransport().invoke("task.retry", request);
  },
  cancel(request: TaskActionRequest): Promise<ResearchTask> {
    return getTransport().invoke("task.cancel", request);
  },
};

export const sourceService = {
  list(request: ProjectScopedRequest) {
    return getTransport().invoke("source.list", request);
  },
};

export const knowledgeService = {
  list(request: ProjectScopedRequest) {
    return getTransport().invoke("knowledge.list", request);
  },
};

export const claimService = {
  list(request: ProjectScopedRequest) {
    return getTransport().invoke("claim.list", request);
  },
  evidence(claimId: string, request: ProjectScopedRequest) {
    return getTransport().invoke("evidence.listByClaim", {
      ...request,
      claim_id: claimId,
    });
  },
};

export const graphService = {
  get(request: ProjectScopedRequest) {
    return getTransport().invoke("graph.get", request);
  },
};

export const coverageService = {
  get(request: ProjectScopedRequest) {
    return getTransport().invoke("coverage.get", request);
  },
};

export const gapService = {
  list(request: ProjectScopedRequest) {
    return getTransport().invoke("gap.list", request);
  },
  act(command: "gap.approveProposal" | "gap.dismissProposal", request: GapActionRequest) {
    return getTransport().invoke(command, request);
  },
};

export const timelineService = {
  get(request: ProjectScopedRequest) {
    return getTransport().invoke("timeline.get", request);
  },
};

export const assistantService = {
  context(request: ProjectScopedRequest) {
    return getTransport().invoke("assistant.getContext", request);
  },
  act(request: AssistantActRequest) {
    return getTransport().invoke("assistant.act", request);
  },
  recordDecision(request: AssistantRecordDecisionRequest): Promise<SavedDecision> {
    return getTransport().invoke("assistant.saveDecision", {
      ...request,
      content: savedDecisionSchema.shape.content.parse(request.content),
    });
  },
  listDecisions(request: ProjectScopedRequest) {
    return getTransport().invoke("assistant.listDecisions", request);
  },
};

/** Exposed for the Assistant UI action menu. */
export const ASSISTANT_ACTIONS_UI: AssistantAction[] = [
  "explain_progress",
  "suggest_next_task",
  "list_pending_reviews",
];

/* ------------------------------------------------------------------ */
/* Desktop-core surface                                                */
/* ------------------------------------------------------------------ */

/**
 * Provider key management through the OS keychain (RUST-04 boundary):
 * values cross the transport exactly once on set and never come back —
 * the UI only ever sees keychain references and presence flags.
 */
export const secretsService = {
  listProviders(): Promise<ProviderKeyStatus[]> {
    return getTransport().invoke("secrets.listProviders", {});
  },
  setProviderKey(request: SecretsSetProviderKeyRequest) {
    return getTransport().invoke("secrets.setProviderKey", request);
  },
};

/** Vault export (RES-07): the core resolves the export path from config. */
export const vaultService = {
  exportProject(request: ProjectScopedRequest): Promise<VaultExportSummary> {
    return getTransport().invoke("vault.exportProject", request);
  },
};

/** Core capability/liveness probes (connection status in Settings). */
export const coreService = {
  info(): Promise<CoreInfo> {
    return getTransport().invoke("core.info", {});
  },
  ping(): Promise<{ echo: string }> {
    return getTransport().invoke("core.ping", { echo: "status" });
  },
};
