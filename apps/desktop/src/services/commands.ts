import { z, type ZodType } from "zod";
import type {
  AssistantContext,
  AssistantResponse,
  Claim,
  CoreInfo,
  CoverageReport,
  Evidence,
  GapReport,
  GraphProjection,
  KnowledgeNode,
  Project,
  ProviderKeyStatus,
  ResearchConfig,
  ResearchPlan,
  ResearchRun,
  ResearchTask,
  Relation,
  SavedDecision,
  SecretRef,
  Source,
  TimelineEntry,
  VaultExportSummary,
} from "@/types/domain";
import {
  assistantContextSchema,
  assistantResponseSchema,
  claimSchema,
  coreInfoSchema,
  coverageReportSchema,
  evidenceSchema,
  gapReportSchema,
  graphProjectionSchema,
  knowledgeNodeSchema,
  projectSchema,
  providerKeyStatusSchema,
  relationSchema,
  researchConfigSchema,
  researchPlanSchema,
  researchRunSchema,
  researchTaskSchema,
  savedDecisionSchema,
  secretRefSchema,
  sourceSchema,
  timelineEntrySchema,
  vaultExportSummarySchema,
} from "@/types/schemas";
import type { ErrorPayload } from "./errors";

/**
 * Typed command surface between the UI and the platform.
 *
 * The names and payloads here are the frontend service contract used by
 * BOTH transports: the mock transport (services/transport.ts over
 * mocks/backend.ts) and the real Tauri IPC transport
 * (services/tauriTransport.ts), which maps each frontend command onto the
 * committed Rust command surface (apps/desktop/src-tauri/src/commands.rs)
 * and adapts shapes in both directions. Rust types are never imported —
 * the wire shapes are mirrored as zod schemas and adapted in the transport.
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

export interface SecretsSetProviderKeyRequest {
  provider: string;
  /**
   * The secret value; crosses the boundary exactly once to be stored in the
   * OS keychain and is never returned, logged, or persisted by the frontend
   * beyond the submit action.
   */
  api_key: string;
}

export interface CorePingRequest {
  echo: string;
}

/* ------------------------------------------------------------------ */
/* Command map                                                         */
/* ------------------------------------------------------------------ */

export interface CommandMap {
  "project.list": { request: EmptyRequest; response: Project[] };
  "project.create": { request: ProjectCreateRequest; response: Project };
  "project.get": { request: ProjectScopedRequest; response: Project };
  /** Rust `project_archive`: null means the project id is unknown. */
  "project.archive": { request: ProjectScopedRequest; response: Project | null };

  "config.get": { request: ProjectScopedRequest; response: ResearchConfig };
  "config.update": { request: ConfigUpdateRequest; response: ResearchConfig };

  "plan.get": { request: ProjectScopedRequest; response: ResearchPlan | null };
  "plan.regenerate": { request: ProjectScopedRequest; response: ResearchPlan };
  "plan.updateTask": { request: PlanTaskUpdateRequest; response: ResearchPlan };
  "plan.approve": { request: ProjectScopedRequest; response: ResearchPlan };
  "plan.reject": { request: ProjectScopedRequest; response: ResearchPlan };

  "run.get": { request: ProjectScopedRequest; response: ResearchRun | null };
  "run.start": { request: ProjectScopedRequest; response: ResearchRun };
  /** Rust `run_cancel`: true once the cancel request was accepted. */
  "run.cancel": { request: ProjectScopedRequest; response: boolean };

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

  /** Rust `secrets_set_provider_key` → keychain reference (never a value). */
  "secrets.setProviderKey": {
    request: SecretsSetProviderKeyRequest;
    response: SecretRef;
  };
  /** Rust `secrets_list_providers` → provider rows with keychain presence. */
  "secrets.listProviders": { request: EmptyRequest; response: ProviderKeyStatus[] };

  /** Rust `vault_export_project` → export outcome summary. */
  "vault.exportProject": { request: ProjectScopedRequest; response: VaultExportSummary };

  /** Rust `core_info` → static capability/protocol versions. */
  "core.info": { request: EmptyRequest; response: CoreInfo };
  /** Rust `ping` → envelope round-trip echo. */
  "core.ping": { request: CorePingRequest; response: { echo: string } };
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
 * call invoke directly; they use services and query hooks. The active
 * implementation is selected in services/transportProvider.ts: the real
 * Tauri IPC transport inside the desktop window, the in-memory mock
 * everywhere else (web preview, vitest, Playwright).
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
  "project.archive": projectSchema.nullable(),
  "config.get": researchConfigSchema,
  "config.update": researchConfigSchema,
  "plan.get": researchPlanSchema.nullable(),
  "plan.regenerate": researchPlanSchema,
  "plan.updateTask": researchPlanSchema,
  "plan.approve": researchPlanSchema,
  "plan.reject": researchPlanSchema,
  "run.get": researchRunSchema.nullable(),
  "run.start": researchRunSchema,
  "run.cancel": z.boolean(),
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
  "secrets.setProviderKey": secretRefSchema,
  "secrets.listProviders": z.array(providerKeyStatusSchema),
  "vault.exportProject": vaultExportSummarySchema,
  "core.info": coreInfoSchema,
  "core.ping": z.object({ echo: z.string() }),
};
