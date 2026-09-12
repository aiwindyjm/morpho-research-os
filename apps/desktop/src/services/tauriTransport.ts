import { z } from "zod";
import type {
  Claim,
  CoverageReport,
  GapReport,
  KnowledgeNode,
  Project,
  Relation,
  ResearchConfig,
  ResearchGap,
  ResearchPlan,
  ResearchRun,
  ResearchTask,
  Source,
  TimelineEntry,
} from "@/types/domain";
import { ERROR_CODES, MorphoError, isAbortError, toMorphoError, type ErrorCode } from "./errors";
import {
  ENVELOPE_SCHEMA_VERSION,
  responseSchemas,
  type CommandName,
  type CommandRequest,
  type CommandResponse,
  type Transport,
} from "./commands";

/**
 * Tauri IPC Transport (W2-05): the real desktop bridge onto the committed
 * Rust command surface (apps/desktop/src-tauri/src/commands.rs).
 *
 * tauri.conf.json sets `app.withGlobalTauri = true`, so inside the desktop
 * window `window.__TAURI__.core.invoke` exists and no npm dependency is
 * needed. This module is the ONLY place allowed to touch that global.
 *
 * Responsibilities, mirroring the mock transport's guarantees:
 *  - wraps every call in the documented `{schema_version, request_id,
 *    data, error}` envelope (docs/API.md) — the Rust side receives
 *    `{ request: IpcRequest }` because every command parameter is named
 *    `request`;
 *  - maps the frontend command names (services/commands.ts) onto the Rust
 *    command names and adapts request/response shapes in BOTH directions,
 *    so React features never learn about the difference;
 *  - surfaces a Rust `CoreError` envelope as a typed `MorphoError` with
 *    code/user_message/retryable/correlation_id preserved;
 *  - validates every adapted response against the same schema registry
 *    before anything reaches a component (docs/PRD.md §11).
 *
 * Commands the committed Rust surface does not expose (yet) fail fast with
 * a typed NOT_FOUND error instead of fabricated data.
 */

/* ------------------------------------------------------------------ */
/* The global bridge (minimal local typing; no npm @tauri-apps/api)     */
/* ------------------------------------------------------------------ */

/** `window.__TAURI__.core.invoke` as this module needs it. */
export type TauriInvoke = (command: string, payload?: unknown) => Promise<unknown>;

/** `window.__TAURI__.event.listen` as this module needs it. */
export type TauriEventListener = (
  event: string,
  handler: (event: { payload: unknown }) => void,
) => Promise<() => void>;

interface TauriGlobal {
  core?: { invoke?: TauriInvoke };
  event?: { listen?: TauriEventListener };
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

function getTauriGlobal(): TauriGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate: unknown = window.__TAURI__;
  return typeof candidate === "object" && candidate !== null ? (candidate as TauriGlobal) : undefined;
}

/** True when the desktop bridge (`window.__TAURI__.core.invoke`) exists. */
export function hasTauriGlobal(): boolean {
  return typeof getTauriGlobal()?.core?.invoke === "function";
}

/* ------------------------------------------------------------------ */
/* Wire envelope (IpcRequest/IpcResponse, src-tauri/src/ipc.rs)         */
/* ------------------------------------------------------------------ */

interface WireCoreError {
  code: string;
  user_message: string;
  developer_detail: string;
  retryable: boolean;
  correlation_id: string;
  cause?: string;
}

const wireEnvelopeSchema = z.object({
  schema_version: z.string(),
  request_id: z.string(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      user_message: z.string(),
      developer_detail: z.string(),
      retryable: z.boolean(),
      correlation_id: z.string(),
      cause: z.string().optional(),
    })
    .optional(),
});

let requestCounter = 0;

function newRequestId(): string {
  requestCounter += 1;
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : String(Date.now());
  return `req-${requestCounter}-${suffix}`;
}

/** Converts a Rust `CoreError` envelope into the typed frontend error. */
function morphoErrorFromCore(error: WireCoreError, fallbackCorrelationId: string): MorphoError {
  const known = (ERROR_CODES as readonly string[]).includes(error.code);
  return new MorphoError({
    code: known ? (error.code as ErrorCode) : "DATABASE_ERROR",
    user_message: error.user_message,
    developer_detail: known
      ? error.developer_detail
      : `[${error.code}] ${error.developer_detail}`,
    retryable: error.retryable,
    correlation_id: error.correlation_id || fallbackCorrelationId,
    cause: error.cause,
  });
}

/**
 * One Rust round-trip: build the IpcRequest envelope, invoke the command,
 * validate the IpcResponse envelope, and either return `data` or throw the
 * mapped CoreError. Tauri IPC has no cancellation primitive, so the signal
 * is checked before each hop; an aborted bridge stops between hops and any
 * hop already sent runs to completion on the Rust side.
 */
interface AdapterContext {
  call(rustCommand: string, data: unknown): Promise<unknown>;
}

function makeContext(invoke: TauriInvoke, signal?: AbortSignal): AdapterContext {
  return {
    async call(rustCommand: string, data: unknown): Promise<unknown> {
      if (signal?.aborted) {
        throw new DOMException("The request was aborted", "AbortError");
      }
      const requestId = newRequestId();
      const request = { schema_version: ENVELOPE_SCHEMA_VERSION, request_id: requestId, data };
      let raw: unknown;
      try {
        raw = await invoke(rustCommand, { request });
      } catch (error) {
        // A rejection here is a Tauri-level failure (unknown command, arg
        // deserialization, IPC shutdown) — normalize it through the same
        // error path as any other transport failure.
        if (isAbortError(error) || error instanceof MorphoError) throw error;
        throw toMorphoError(error);
      }
      const parsed = wireEnvelopeSchema.safeParse(raw);
      if (!parsed.success) {
        throw new MorphoError({
          code: "VALIDATION_FAILED",
          user_message: "桌面核心返回的数据格式异常，请重试或报告问题。",
          developer_detail: `${rustCommand}: response does not match the docs/API.md envelope (${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")})`,
          retryable: false,
          correlation_id: requestId,
        });
      }
      const envelope = parsed.data;
      if (envelope.schema_version !== ENVELOPE_SCHEMA_VERSION) {
        throw new MorphoError({
          code: "VALIDATION_FAILED",
          user_message: "桌面核心协议版本不兼容，请更新应用。",
          developer_detail: `${rustCommand}: expected schema_version ${ENVELOPE_SCHEMA_VERSION}, got ${envelope.schema_version}`,
          retryable: false,
          correlation_id: requestId,
        });
      }
      if (envelope.error !== undefined) {
        throw morphoErrorFromCore(envelope.error, envelope.request_id);
      }
      return envelope.data;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Wire record shapes (serde JSON of the Rust repositories)            */
/* ------------------------------------------------------------------ */

interface ProjectRecordWire {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface ProjectCreatedWire {
  project: ProjectRecordWire;
}

interface PlanRecordWire {
  id: string;
  project_id: string;
  research_config_id: string;
  title: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface TaskRecordWire {
  id: string;
  plan_id: string;
  section_id: string | null;
  run_id: string | null;
  title: string;
  task_type: string;
  status: string;
  idempotency_key: string;
  checkpoint: string | null;
  retry_count: number;
  created_at: number;
  updated_at: number;
}

interface PlanWithTasksWire {
  plan: PlanRecordWire;
  tasks: TaskRecordWire[];
}

interface RunStartedWire {
  project_id: string;
  run_id: string;
  job_id: string;
}

interface SourceRecordWire {
  id: string;
  project_id: string;
  url: string;
  canonical_url: string;
  title: string;
  source_type: string;
  status: string;
  retrieved_at: number;
  quality_score: number | null;
  created_at: number;
  updated_at: number;
}

interface KnowledgeNodeRecordWire {
  id: string;
  project_id: string;
  node_type: string;
  title: string;
  slug: string;
  summary: string;
  status: string;
  confidence: string;
  aliases: string[];
  tags: string[];
  source_ids: string[];
  claim_ids: string[];
  created_at: number;
  updated_at: number;
}

interface ClaimRecordWire {
  id: string;
  project_id: string;
  subject: string;
  predicate: string;
  object_value: string;
  scope: string;
  status: string;
  confidence: string;
  provenance: string;
  created_at: number;
  updated_at: number;
}

interface RelationRecordWire {
  id: string;
  project_id: string;
  from_node_id: string;
  to_node_id: string;
  relation_type: string;
  confidence: string;
  created_at: number;
}

interface CoverageComponentsWire {
  task_completion: number;
  knowledge_breadth: number;
  evidence_density: number;
  source_diversity: number;
}

interface RustGapReportWire {
  dimension: string;
  trigger: string;
  rule: string;
  detail: string;
  quality_sources_found: number;
  coverage: number;
}

interface DimensionCoverageWire {
  dimension: string;
  coverage: number;
  components: CoverageComponentsWire;
  tasks_total: number;
  tasks_completed: number;
  knowledge_nodes: number;
  evidence_items: number;
  quality_sources: number;
  source_types: string[];
  reasons: string[];
  gap: RustGapReportWire | null;
}

interface RustCoverageReportWire {
  project_id: string;
  overall: number;
  components: CoverageComponentsWire;
  dimensions: DimensionCoverageWire[];
  gaps: RustGapReportWire[];
  computed_at: number;
}

interface EventRecordWire {
  id: string;
  run_id: string;
  task_id: string | null;
  sequence: number;
  event_type: string;
  payload: string;
  created_at: number;
}

/* ------------------------------------------------------------------ */
/* Shape conversions (Rust wire → frontend domain)                     */
/* ------------------------------------------------------------------ */

/** Rust timestamps are unix epoch ms; the frontend contract is ISO-8601. */
function epochMsToIso(value: number): string {
  return new Date(value).toISOString();
}

/**
 * Rust stores confidence as a state string; the frontend wants both the
 * state (as `status`) and a numeric confidence. Grounded in the fixture
 * pairs (mocks/fixtures-a.ts): high→0.8, medium→0.7, confirmed→0.9/0.85,
 * unverified→0.4, conflicting→0.5. Unknown states fall back to the
 * unverified floor — schema validation on `status` still catches drift.
 */
const CONFIDENCE_TO_NUMBER: Record<string, number> = {
  confirmed: 0.9,
  high: 0.8,
  medium: 0.7,
  low: 0.5,
  unverified: 0.4,
  conflicting: 0.5,
};

function confidenceToNumber(state: string): number {
  return CONFIDENCE_TO_NUMBER[state] ?? 0.4;
}

/** Rust source_type vocabulary seen in the committed surface ("web"). */
const SOURCE_TYPE_ALIASES: Record<string, string> = {
  web: "web_page",
};

function mapSourceType(value: string): string {
  return SOURCE_TYPE_ALIASES[value] ?? value;
}

function toProject(record: ProjectRecordWire): Project {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    created_at: epochMsToIso(record.created_at),
    updated_at: epochMsToIso(record.updated_at),
  };
}

function toResearchPlan(entry: PlanWithTasksWire): ResearchPlan {
  return {
    id: entry.plan.id,
    project_id: entry.plan.project_id,
    title: entry.plan.title,
    status: entry.plan.status as ResearchPlan["status"],
    rationale: "",
    // The committed plan_list payload carries no section records; tasks are
    // exposed through the task.list bridge instead of a fabricated section
    // structure.
    sections: [],
    created_at: epochMsToIso(entry.plan.created_at),
    updated_at: epochMsToIso(entry.plan.updated_at),
  };
}

function toResearchTask(task: TaskRecordWire, projectId: string): ResearchTask {
  return {
    id: task.id,
    project_id: projectId,
    run_id: task.run_id,
    // Schema requires a uuid section anchor; sectionless tasks anchor to
    // their own plan.
    section_id: task.section_id ?? task.plan_id,
    title: task.title,
    description: "",
    kind: task.task_type as ResearchTask["kind"],
    state: task.status as ResearchTask["state"],
    dependencies: [],
    attempt: task.retry_count,
    idempotency_key: task.idempotency_key,
    checkpoint: task.checkpoint,
    error_code: null,
    dimension: "",
    created_at: epochMsToIso(task.created_at),
    updated_at: epochMsToIso(task.updated_at),
  };
}

function toSource(record: SourceRecordWire): Source {
  return {
    id: record.id,
    project_id: record.project_id,
    url: record.url,
    title: record.title,
    source_type: mapSourceType(record.source_type) as Source["source_type"],
    status: record.status as Source["status"],
    // A single quality_score cannot populate authority/fitness/rationale;
    // null is the schema's "not yet evaluated" state.
    quality: null,
    dimensions: [],
    retrieved_at: epochMsToIso(record.retrieved_at),
    created_at: epochMsToIso(record.created_at),
    updated_at: epochMsToIso(record.updated_at),
  };
}

function toKnowledgeNode(record: KnowledgeNodeRecordWire): KnowledgeNode {
  return {
    id: record.id,
    project_id: record.project_id,
    type: record.node_type as KnowledgeNode["type"],
    title: record.title,
    aliases: record.aliases,
    summary: record.summary,
    status: record.confidence as KnowledgeNode["status"],
    confidence: confidenceToNumber(record.confidence),
    dimension: "",
    source_ids: record.source_ids,
    claim_ids: record.claim_ids,
    created_at: epochMsToIso(record.created_at),
    updated_at: epochMsToIso(record.updated_at),
  };
}

function toClaim(record: ClaimRecordWire): Claim {
  return {
    id: record.id,
    project_id: record.project_id,
    subject_node_id: record.subject,
    predicate: record.predicate,
    object_value: record.object_value,
    scope: record.scope,
    status: record.confidence as Claim["status"],
    confidence: confidenceToNumber(record.confidence),
    source_ids: [],
    evidence_ids: [],
    created_at: epochMsToIso(record.created_at),
    updated_at: epochMsToIso(record.updated_at),
  };
}

function toRelation(record: RelationRecordWire): Relation {
  return {
    id: record.id,
    project_id: record.project_id,
    subject_id: record.from_node_id,
    predicate: record.relation_type,
    object_id: record.to_node_id,
    // from/to records are directed edges by construction.
    direction: "directed",
    confidence: confidenceToNumber(record.confidence),
    status: "active",
    claim_ids: [],
    source_ids: [],
  };
}

function toCoverageReport(report: RustCoverageReportWire): CoverageReport {
  return {
    project_id: report.project_id,
    overall: report.overall,
    dimensions: report.dimensions.map((dimension) => ({
      dimension: dimension.dimension,
      coverage: dimension.coverage,
      components: dimension.components,
      inputs: {
        tasks_total: dimension.tasks_total,
        tasks_completed: dimension.tasks_completed,
        knowledge_nodes: dimension.knowledge_nodes,
        evidence_items: dimension.evidence_items,
        quality_sources: dimension.quality_sources,
        source_types: dimension.source_types,
      },
      reasons: dimension.reasons,
      updated_at: epochMsToIso(report.computed_at),
    })),
    computed_at: epochMsToIso(report.computed_at),
  };
}

function toResearchGap(gap: RustGapReportWire, projectId: string): ResearchGap {
  return {
    id: `gap:${projectId}:${gap.dimension}`,
    project_id: projectId,
    dimension: gap.dimension,
    trigger: gap.trigger as ResearchGap["trigger"],
    rule: gap.rule,
    detail: gap.detail,
    quality_sources_found: gap.quality_sources_found,
    coverage: gap.coverage,
    proposed_task: {
      title: `补充研究：${gap.dimension}`,
      description: gap.detail,
      dimension: gap.dimension,
    },
    proposal_status: "pending_approval",
    created_task_id: null,
  };
}

function toTimelineEntry(record: EventRecordWire): TimelineEntry {
  return {
    id: record.id,
    timestamp: epochMsToIso(record.created_at),
    kind: timelineKindFor(record.event_type),
    title: record.event_type,
    detail: record.payload,
  };
}

function timelineKindFor(eventType: string): TimelineEntry["kind"] {
  if (eventType.startsWith("task.")) return "task";
  if (eventType.startsWith("source.")) return "source";
  if (eventType.startsWith("claim.")) return "claim";
  if (eventType.startsWith("knowledge.")) return "knowledge";
  return "run";
}

/* ------------------------------------------------------------------ */
/* Command mapping                                                     */
/* ------------------------------------------------------------------ */

function notFound(userMessage: string, developerDetail: string): MorphoError {
  return new MorphoError({
    code: "NOT_FOUND",
    user_message: userMessage,
    developer_detail: developerDetail,
    retryable: false,
    correlation_id: "local-not-found",
  });
}

/** Typed error for frontend commands without a committed Rust command. */
function unsupported(command: CommandName): MorphoError {
  return new MorphoError({
    code: "NOT_FOUND",
    user_message: "该功能尚未接入桌面核心，目前仅在网页预览模式下可用。",
    developer_detail: `command '${command}' has no counterpart in the committed Rust IPC surface (apps/desktop/src-tauri/src/commands.rs); wire it when the core command lands`,
    retryable: false,
    correlation_id: "local-unsupported",
  });
}

/**
 * The committed surface has no research-config read command, so a faithful
 * config snapshot cannot be assembled for run responses yet. This
 * schema-minimal placeholder (validated like any other payload) stands in
 * until the core exposes project config reads; run views must not treat
 * its defaults as user data.
 */
const RUN_CONFIG_SNAPSHOT_PLACEHOLDER: ResearchConfig = {
  schema_version: "1.0",
  domain: "",
  topic: "",
  purpose: "learning",
  audience: "",
  depth: 2,
  dimensions: [],
  time_range: { from: null, to: null },
  geographic_scope: "",
  languages: ["en"],
  source_types: [],
  source_domains: [],
  update_frequency: "manual",
};

async function planListWire(ctx: AdapterContext, projectId: string): Promise<PlanWithTasksWire[]> {
  return (await ctx.call("plan_list", { project_id: projectId })) as PlanWithTasksWire[];
}

/** plan_list orders by (created_at, id) — the last entry is the latest. */
async function latestPlanWire(ctx: AdapterContext, projectId: string): Promise<PlanWithTasksWire> {
  const plans = await planListWire(ctx, projectId);
  const latest = plans[plans.length - 1];
  if (!latest) {
    throw notFound("该项目尚无研究计划。", `plan_list returned no plans for project '${projectId}'`);
  }
  return latest;
}

type CommandAdapter<K extends CommandName> = (
  ctx: AdapterContext,
  payload: CommandRequest<K>,
) => Promise<CommandResponse<K>>;

/**
 * Frontend command → Rust command mapping. Direct commands forward the
 * (reshaped) payload and adapt the record; bridged commands compose
 * several Rust calls; the rest fail fast with a typed error.
 */
const adapters: { [K in CommandName]: CommandAdapter<K> } = {
  "project.list": async (ctx) => {
    const records = (await ctx.call("project_list", {})) as ProjectRecordWire[];
    return records.map(toProject);
  },
  "project.create": async (ctx, payload) => {
    // The Rust ProjectCreateRequest fills its config from serde defaults.
    const created = (await ctx.call("project_create", {
      name: payload.name,
      description: payload.description,
    })) as ProjectCreatedWire;
    return toProject(created.project);
  },
  "project.get": async (ctx, payload) => {
    const record = (await ctx.call("project_get", {
      project_id: payload.project_id,
    })) as ProjectRecordWire | null;
    if (record === null || record === undefined) {
      throw notFound("未找到该项目。", `project_get returned no record for '${payload.project_id}'`);
    }
    return toProject(record);
  },

  "config.get": async () => {
    throw unsupported("config.get");
  },
  "config.update": async () => {
    throw unsupported("config.update");
  },

  "plan.get": async (ctx, payload) => {
    const plans = await planListWire(ctx, payload.project_id);
    return plans.length > 0 ? toResearchPlan(plans[plans.length - 1]) : null;
  },
  "plan.regenerate": async () => {
    throw unsupported("plan.regenerate");
  },
  "plan.updateTask": async () => {
    throw unsupported("plan.updateTask");
  },
  "plan.approve": async (ctx, payload) => {
    const entry = await latestPlanWire(ctx, payload.project_id);
    const approved = await ctx.call("plan_approve", { plan_id: entry.plan.id });
    if (approved === null || approved === undefined) {
      throw notFound("未找到该项目的研究计划。", `plan_approve returned no plan '${entry.plan.id}'`);
    }
    // Re-list so the response carries the refreshed status plus tasks.
    const refreshed = await planListWire(ctx, payload.project_id);
    return toResearchPlan(refreshed[refreshed.length - 1] ?? entry);
  },
  "plan.reject": async () => {
    throw unsupported("plan.reject");
  },

  "run.get": async () => {
    throw unsupported("run.get");
  },
  "run.start": async (ctx, payload) => {
    const entry = await latestPlanWire(ctx, payload.project_id);
    const started = (await ctx.call("run_start", {
      plan_id: entry.plan.id,
      // Starting a run from the UI carries the plan-review decision; the
      // worker rejects the job without it (PLAN_NOT_APPROVED).
      approve_plan: true,
    })) as RunStartedWire;
    const now = new Date().toISOString();
    return {
      id: started.run_id,
      project_id: started.project_id,
      plan_id: entry.plan.id,
      state: "RUNNING",
      config_snapshot: RUN_CONFIG_SNAPSHOT_PLACEHOLDER,
      plan_snapshot_title: entry.plan.title,
      started_at: now,
      updated_at: now,
    } satisfies ResearchRun;
  },

  "task.list": async (ctx, payload) => {
    const plans = await planListWire(ctx, payload.project_id);
    return plans.flatMap((entry) =>
      entry.tasks.map((task) => toResearchTask(task, entry.plan.project_id)),
    );
  },
  "task.pause": async () => {
    throw unsupported("task.pause");
  },
  "task.resume": async () => {
    throw unsupported("task.resume");
  },
  "task.retry": async () => {
    throw unsupported("task.retry");
  },
  "task.cancel": async () => {
    throw unsupported("task.cancel");
  },

  "source.list": async (ctx, payload) => {
    const records = (await ctx.call("sources_list", {
      project_id: payload.project_id,
    })) as SourceRecordWire[];
    return records.map(toSource);
  },
  "knowledge.list": async (ctx, payload) => {
    const records = (await ctx.call("knowledge_list", {
      project_id: payload.project_id,
    })) as KnowledgeNodeRecordWire[];
    return records.map(toKnowledgeNode);
  },
  "claim.list": async (ctx, payload) => {
    const records = (await ctx.call("claims_list", {
      project_id: payload.project_id,
    })) as ClaimRecordWire[];
    return records.map(toClaim);
  },
  "evidence.listByClaim": async () => {
    throw unsupported("evidence.listByClaim");
  },
  "relation.list": async (ctx, payload) => {
    const records = (await ctx.call("relations_list", {
      project_id: payload.project_id,
    })) as RelationRecordWire[];
    return records.map(toRelation);
  },
  "graph.get": async () => {
    throw unsupported("graph.get");
  },

  "coverage.get": async (ctx, payload) => {
    const report = (await ctx.call("coverage_get", {
      project_id: payload.project_id,
    })) as RustCoverageReportWire;
    return toCoverageReport(report);
  },
  "gap.list": async (ctx, payload) => {
    // The Rust coverage report already computes the gap list.
    const report = (await ctx.call("coverage_get", {
      project_id: payload.project_id,
    })) as RustCoverageReportWire;
    return {
      project_id: report.project_id,
      gaps: report.gaps.map((gap) => toResearchGap(gap, report.project_id)),
      computed_at: epochMsToIso(report.computed_at),
    } satisfies GapReport;
  },
  "gap.approveProposal": async () => {
    throw unsupported("gap.approveProposal");
  },
  "gap.dismissProposal": async () => {
    throw unsupported("gap.dismissProposal");
  },
  "timeline.get": async (ctx, payload) => {
    const records = (await ctx.call("events_list", {
      project_id: payload.project_id,
      run_id: null,
      after_sequence: 0,
      limit: 100,
    })) as EventRecordWire[];
    return records
      .map(toTimelineEntry)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  "assistant.getContext": async () => {
    throw unsupported("assistant.getContext");
  },
  "assistant.act": async () => {
    throw unsupported("assistant.act");
  },
  "assistant.saveDecision": async () => {
    throw unsupported("assistant.saveDecision");
  },
  "assistant.listDecisions": async () => {
    throw unsupported("assistant.listDecisions");
  },
};

/* ------------------------------------------------------------------ */
/* Transport factory                                                   */
/* ------------------------------------------------------------------ */

export interface TauriTransportOptions {
  /**
   * Dependency injection for tests. Defaults to `window.__TAURI__.core.invoke`
   * (tauri.conf.json `app.withGlobalTauri = true`).
   */
  invoke?: TauriInvoke;
}

export function createTauriTransport(options: TauriTransportOptions = {}): Transport {
  const invoke = options.invoke ?? getTauriGlobal()?.core?.invoke;
  if (typeof invoke !== "function") {
    throw new Error(
      "createTauriTransport: window.__TAURI__.core.invoke is unavailable; outside the desktop window the mock transport is the fallback.",
    );
  }
  return {
    async invoke<K extends CommandName>(
      command: K,
      payload: CommandRequest<K>,
      invokeOptions?: { signal?: AbortSignal },
    ): Promise<CommandResponse<K>> {
      if (invokeOptions?.signal?.aborted) {
        throw new DOMException("The request was aborted", "AbortError");
      }
      const ctx = makeContext(invoke, invokeOptions?.signal);
      let candidate: unknown;
      try {
        candidate = await adapters[command](ctx, payload);
      } catch (error) {
        if (isAbortError(error) || error instanceof MorphoError) throw error;
        throw toMorphoError(error);
      }
      // Parse → validate before anything reaches a component, exactly like
      // the mock transport: a schema-invalid payload is a contract bug.
      const schema = responseSchemas[command];
      const parsed = schema.safeParse(candidate);
      if (!parsed.success) {
        throw new MorphoError({
          code: "VALIDATION_FAILED",
          user_message: "数据格式异常，请重试或报告问题。",
          developer_detail: `${command}: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
          retryable: false,
          correlation_id: "local-validation",
        });
      }
      return parsed.data;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Research events (morpho://events, src-tauri/src/state.rs)           */
/* ------------------------------------------------------------------ */

/** Tauri event channel the core re-emits forwarded research events on. */
export const MORPHO_EVENTS_CHANNEL = "morpho://events";

/** Canonical `research.event.v1` shape (ipc.rs `ResearchEvent`). */
export interface ResearchEvent {
  schema: string;
  run_id: string;
  task_id: string | null;
  sequence: number;
  /** Unix epoch milliseconds, UTC. */
  timestamp_ms: number;
  event_type: string;
  payload: unknown;
}

export type ResearchEventHandler = (event: ResearchEvent) => void;
export type UnlistenFn = () => void;

const researchEventSchema = z.object({
  schema: z.string(),
  run_id: z.string(),
  task_id: z.string().nullable(),
  sequence: z.number().int().nonnegative(),
  timestamp_ms: z.number().int().nonnegative(),
  event_type: z.string(),
  payload: z.unknown(),
});

/**
 * Subscribes to `morpho://events` through `window.__TAURI__.event.listen`.
 * Resolves to a no-op unlisten outside the desktop window. Events that
 * drift from the canonical shape are dropped rather than thrown — a
 * listener callback must never crash the emitter. Wiring the stream into
 * stores/query caches is deliberately out of scope here.
 */
export async function listenResearchEvents(
  handler: ResearchEventHandler,
): Promise<UnlistenFn> {
  const listen = getTauriGlobal()?.event?.listen;
  if (typeof listen !== "function") {
    return () => {};
  }
  return listen(MORPHO_EVENTS_CHANNEL, (event) => {
    const parsed = researchEventSchema.safeParse(event.payload);
    if (parsed.success) {
      // zod v3 infers `z.unknown()` keys as optional; the Rust envelope
      // always emits payload, so restate it as a required key.
      handler({ ...parsed.data, payload: parsed.data.payload });
    }
  });
}
