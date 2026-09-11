import { z, type ZodType } from "zod";
import type {
  AssistantContext,
  AssistantResponse,
  Claim,
  CoverageReport,
  Evidence,
  GapReport,
  GraphProjection,
  KnowledgeNode,
  Project,
  ResearchConfig,
  ResearchPlan,
  ResearchRun,
  ResearchTask,
  Relation,
  SavedDecision,
  Source,
  TimelineEntry,
} from "@/types/domain";
import {
  assistantContextSchema,
  assistantResponseSchema,
  claimSchema,
  coverageReportSchema,
  evidenceSchema,
  gapReportSchema,
  graphProjectionSchema,
  knowledgeNodeSchema,
  projectSchema,
  relationSchema,
  researchConfigSchema,
  researchPlanSchema,
  researchRunSchema,
  researchTaskSchema,
  savedDecisionSchema,
  sourceSchema,
  timelineEntrySchema,
} from "@/types/schemas";
import type { ErrorPayload } from "./errors";

/**
 * Typed command surface between the UI and the platform.
 *
 * IMPORTANT (W2-05 boundary): these command names and payloads describe the
 * frontend service contract used by the Mock Transport. They are NOT the
 * frozen Tauri IPC contract — that is defined by groups A/C (W2-01, W2-02,
 * RUST-01) and wired in W2-05. Until then, no real Tauri invoke is
 * implemented and no Rust types are imported.
 *
 * Envelope shape follows docs/API.md: { schema_version, request_id, data,
 * error }.
 */

export const ENVELOPE_SCHEMA_VERSION = "1.0" as const;

/* ------------------------------------------------------------------ */
/* Request payloads                                                    */
/* ------------------------------------------------------------------ */

export interface EmptyRequest {
  readonly _empty?: undefined;
}

export interface ProjectCreateRequest {
  name: string;
  description: string;
}

export interface ProjectScopedRequest {
  project_id: string;
}

export interface ConfigUpdateRequest extends ProjectScopedRequest {
  config: ResearchConfig;
}

export interface PlanTaskUpdateRequest extends ProjectScopedRequest {
  task_id: string;
  title: string;
  description: string;
}

export interface TaskActionRequest extends ProjectScopedRequest {
  task_id: string;
}

export interface ClaimEvidenceRequest extends ProjectScopedRequest {
  claim_id: string;
}

export interface GapActionRequest extends ProjectScopedRequest {
  gap_id: string;
}

export interface AssistantActRequest extends ProjectScopedRequest {
  action: "explain_progress" | "suggest_next_task" | "list_pending_reviews";
}

export interface AssistantRecordDecisionRequest extends ProjectScopedRequest {
  content: string;
}

/* ------------------------------------------------------------------ */
/* Command map                                                         */
/* ------------------------------------------------------------------ */

export interface CommandMap {
  "project.list": { request: EmptyRequest; response: Project[] };
  "project.create": { request: ProjectCreateRequest; response: Project };
  "project.get": { request: ProjectScopedRequest; response: Project };

  "config.get": { request: ProjectScopedRequest; response: ResearchConfig };
  "config.update": { request: ConfigUpdateRequest; response: ResearchConfig };

  "plan.get": { request: ProjectScopedRequest; response: ResearchPlan | null };
  "plan.regenerate": { request: ProjectScopedRequest; response: ResearchPlan };
  "plan.updateTask": { request: PlanTaskUpdateRequest; response: ResearchPlan };
  "plan.approve": { request: ProjectScopedRequest; response: ResearchPlan };
  "plan.reject": { request: ProjectScopedRequest; response: ResearchPlan };

  "run.get": { request: ProjectScopedRequest; response: ResearchRun | null };
  "run.start": { request: ProjectScopedRequest; response: ResearchRun };

  "task.list": { request: ProjectScopedRequest; response: ResearchTask[] };
  "task.pause": { request: TaskActionRequest; response: ResearchTask };
  "task.resume": { request: TaskActionRequest; response: ResearchTask };
  "task.retry": { request: TaskActionRequest; response: ResearchTask };
  "task.cancel": { request: TaskActionRequest; response: ResearchTask };

  "source.list": { request: ProjectScopedRequest; response: Source[] };
  "knowledge.list": { request: ProjectScopedRequest; response: KnowledgeNode[] };
  "claim.list": { request: ProjectScopedRequest; response: Claim[] };
  "evidence.listByClaim": { request: ClaimEvidenceRequest; response: Evidence[] };
  "relation.list": { request: ProjectScopedRequest; response: Relation[] };
  "graph.get": { request: ProjectScopedRequest; response: GraphProjection };

  "coverage.get": { request: ProjectScopedRequest; response: CoverageReport };
  "gap.list": { request: ProjectScopedRequest; response: GapReport };
  "gap.approveProposal": { request: GapActionRequest; response: GapReport };
  "gap.dismissProposal": { request: GapActionRequest; response: GapReport };
  "timeline.get": { request: ProjectScopedRequest; response: TimelineEntry[] };

  "assistant.getContext": { request: ProjectScopedRequest; response: AssistantContext };
  "assistant.act": { request: AssistantActRequest; response: AssistantResponse };
  "assistant.saveDecision": {
    request: AssistantRecordDecisionRequest;
    response: SavedDecision;
  };
  "assistant.listDecisions": { request: ProjectScopedRequest; response: SavedDecision[] };
}

export type CommandName = keyof CommandMap;

export type CommandRequest<K extends CommandName> = CommandMap[K]["request"];
export type CommandResponse<K extends CommandName> = CommandMap[K]["response"];

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

export interface Envelope<T> {
  schema_version: typeof ENVELOPE_SCHEMA_VERSION;
  request_id: string;
  data?: T;
  error?: ErrorPayload;
}

export interface InvokeOptions {
  signal?: AbortSignal;
}

/**
 * Transport is the only way the UI reaches the backend. Components never
 * call invoke directly; they use services and query hooks. The real Tauri
 * transport arrives with W2-05 once the IPC contract is frozen.
 */
export interface Transport {
  invoke<K extends CommandName>(
    command: K,
    payload: CommandRequest<K>,
    options?: InvokeOptions,
  ): Promise<CommandResponse<K>>;
}

/* ------------------------------------------------------------------ */
/* Response schema registry                                            */
/* ------------------------------------------------------------------ */

/**
 * Every response payload is validated before it reaches components, so a
 * mock/demo dataset can never drift from the documented schemas
 * (docs/PRD.md §11: parse → validate → normalize → persist).
 */
export const responseSchemas: { [K in CommandName]: ZodType<CommandResponse<K>> } = {
  "project.list": z.array(projectSchema),
  "project.create": projectSchema,
  "project.get": projectSchema,
  "config.get": researchConfigSchema,
  "config.update": researchConfigSchema,
  "plan.get": researchPlanSchema.nullable(),
  "plan.regenerate": researchPlanSchema,
  "plan.updateTask": researchPlanSchema,
  "plan.approve": researchPlanSchema,
  "plan.reject": researchPlanSchema,
  "run.get": researchRunSchema.nullable(),
  "run.start": researchRunSchema,
  "task.list": z.array(researchTaskSchema),
  "task.pause": researchTaskSchema,
  "task.resume": researchTaskSchema,
  "task.retry": researchTaskSchema,
  "task.cancel": researchTaskSchema,
  "source.list": z.array(sourceSchema),
  "knowledge.list": z.array(knowledgeNodeSchema),
  "claim.list": z.array(claimSchema),
  "evidence.listByClaim": z.array(evidenceSchema),
  "relation.list": z.array(relationSchema),
  "graph.get": graphProjectionSchema,
  "coverage.get": coverageReportSchema,
  "gap.list": gapReportSchema,
  "gap.approveProposal": gapReportSchema,
  "gap.dismissProposal": gapReportSchema,
  "timeline.get": z.array(timelineEntrySchema),
  "assistant.getContext": assistantContextSchema,
  "assistant.act": assistantResponseSchema,
  "assistant.saveDecision": savedDecisionSchema,
  "assistant.listDecisions": z.array(savedDecisionSchema),
};
