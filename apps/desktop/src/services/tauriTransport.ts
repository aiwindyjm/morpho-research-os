import { z } from "zod";
import type {
  Claim,
  CoverageReport,
  Evidence,
  GapReport,
  GraphNode,
  GraphProjection,
  KnowledgeNode,
  PlanTaskDraft,
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
 * Frontend commands the committed Rust surface cannot serve yet fail fast
 * with a typed NOT_FOUND error instead of fabricated data.
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
  /**
   * Per-transport session job registry (see `SessionJob`): records the
   * worker job each run.start launched so the project-scoped run.get /
   * run.cancel can bridge onto the job-keyed Rust commands.
   */
  sessionJobs: Map<string, SessionJob>;
  /**
   * Latest sectioned plan projection per project (see `PlanViewWire`).
   * `plan_list` carries plan records and tasks but no section rows, so the
   * full plan view returned by plan_regenerate / plan_update_task /
   * plan_reject is remembered here and re-served by plan.get while the
   * project's latest generation matches (ADR-020).
   */
  sessionPlans: Map<string, PlanViewWire>;
  /**
   * Gap proposal decisions taken this session (project → dimension →
   * outcome). Rust persists them in `gap_decisions` and merges them into
   * the gap_approve/dismiss responses, but no committed read command
   * exposes them — so the outcomes are merged into gap.list here,
   * mirroring the core's gap_report merge (src-tauri/src/projections.rs).
   */
  sessionGapDecisions: Map<string, Map<string, SessionGapDecision>>;
}

function makeContext(
  invoke: TauriInvoke,
  sessionJobs: Map<string, SessionJob>,
  sessionPlans: Map<string, PlanViewWire>,
  sessionGapDecisions: Map<string, Map<string, SessionGapDecision>>,
  signal?: AbortSignal,
): AdapterContext {
  return {
    sessionJobs,
    sessionPlans,
    sessionGapDecisions,
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

/** Keychain reference path (src-tauri/src/secrets.rs `SecretRef`). */
interface SecretRefWire {
  provider: string;
  key_name: string;
}

/** `secrets_list_providers` row (commands.rs `ProviderKeyStatus`). */
interface ProviderKeyStatusWire {
  name: string;
  base_url: string;
  model: string;
  key_ref: SecretRefWire;
  has_key: boolean;
}

/** `vault_export_project` result (repositories/services.rs). */
interface VaultExportResultWire {
  written: number;
  unchanged: number;
  conflicts: number;
  skipped: number;
  sources: number;
  claims: number;
  maps: number;
  merge_proposals: Array<{
    path: string;
    node_id: string;
    ours: string;
    theirs_hash: string;
    reason: string;
  }>;
  vault_root: string;
}

/** `core_info` payload (commands.rs `CoreInfo`). */
interface CoreInfoWire {
  app_name: string;
  app_version: string;
  ipc_schema_version: string;
  event_envelope: string;
  worker_protocol_version: string;
  database_schema_version: number;
}

/**
 * `run_get` payload: the worker job-status envelope with the core-side
 * `task_rollup` attached when the envelope names a locally known run.
 * Free-form on purpose — the Rust side returns `serde_json::Value`.
 */
interface RunGetEnvelopeWire {
  job?: {
    job_id?: string;
    run_id?: string;
    status?: string;
    created_at?: string;
    updated_at?: string;
  };
  task_rollup?: {
    run_id: string;
    run_status: string;
    task_counts: Record<string, number>;
    tasks: Array<{ task_id: string; status: string }>;
  };
}

/* ------------------------------------------------------------------ */
/* Batch-2 projection wire shapes (src-tauri/src/projections.rs)        */
/* ------------------------------------------------------------------ */

/**
 * `research_config_get`/`research_config_put` payload
 * (`ResearchConfigView`): the frontend ResearchConfig shape plus persisted
 * bookkeeping. `time_range` is ALWAYS an object — never bare null — even
 * when unbounded.
 */
interface ResearchConfigViewWire {
  schema_version: string;
  config_id: string;
  project_id: string;
  domain: string;
  topic: string;
  purpose: string;
  audience: string;
  depth: number;
  dimensions: string[];
  time_range: { from: string | null; to: string | null };
  geographic_scope: string;
  languages: string[];
  source_types: string[];
  source_domains: string[];
  update_frequency: string;
  created_at: string;
  updated_at: string;
}

/** `plan_regenerate`/`plan_update_task`/`plan_reject` payload (`PlanView`). */
interface PlanViewWire {
  id: string;
  project_id: string;
  title: string;
  status: string;
  rationale: string;
  sections: Array<{
    id: string;
    title: string;
    dimension: string;
    rationale: string;
    objectives: string[];
    tasks: Array<{ id: string; title: string; description: string; kind: string }>;
  }>;
  created_at: string;
  updated_at: string;
}

/** `evidence_list_by_claim` row (`EvidenceView`). */
interface EvidenceViewWire {
  id: string;
  project_id: string;
  claim_id: string;
  source_id: string;
  quote: string;
  locator: { kind: string; value: string };
  retrieved_at: string;
  direction: string;
  extraction_method: string;
  created_at: string;
}

/**
 * `graph_get` payload (`GraphProjection`): the node type serializes under
 * the contract's `type` key (serde rename) and `year` is always present
 * (null for persisted nodes, which carry no year).
 */
interface GraphProjectionWire {
  project_id: string;
  nodes: Array<{
    id: string;
    type: string;
    title: string;
    confidence: string;
    dimension: string;
    source_count: number;
    claim_count: number;
    year: number | null;
  }>;
  relations: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    predicate: string;
    confidence: number;
  }>;
}

/** `gap_approve_proposal`/`gap_dismiss_proposal` payload (`GapReportView`). */
interface GapReportViewWire {
  project_id: string;
  gaps: Array<{
    id: string;
    project_id: string;
    dimension: string;
    trigger: string;
    rule: string;
    detail: string;
    quality_sources_found: number;
    coverage: number;
    proposed_task: { title: string; description: string; dimension: string };
    proposal_status: string;
    created_task_id: string | null;
  }>;
  computed_at: string;
}

/** A gap proposal outcome taken this session (see AdapterContext). */
interface SessionGapDecision {
  status: "approved" | "dismissed";
  createdTaskId: string | null;
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
/* Batch-2 projection conversions (wire → frontend domain)             */
/* ------------------------------------------------------------------ */

/**
 * `ResearchConfigView` → ResearchConfig. The view arrives in the frontend
 * shape (ISO-8601 bounds inside the always-object time_range); persisted
 * bookkeeping (config_id/created_at/updated_at) is dropped here because the
 * zod contract strips it anyway.
 */
function toResearchConfig(view: ResearchConfigViewWire): ResearchConfig {
  return {
    schema_version: "1.0",
    domain: view.domain,
    topic: view.topic,
    purpose: view.purpose as ResearchConfig["purpose"],
    audience: view.audience,
    depth: view.depth as ResearchConfig["depth"],
    dimensions: view.dimensions,
    time_range: { from: view.time_range.from, to: view.time_range.to },
    geographic_scope: view.geographic_scope,
    languages: view.languages,
    source_types: view.source_types,
    source_domains: view.source_domains,
    update_frequency: "manual",
  };
}

/** `PlanView` → ResearchPlan (the projection is already in the IPC shape). */
function toResearchPlanFromView(view: PlanViewWire): ResearchPlan {
  return {
    id: view.id,
    project_id: view.project_id,
    title: view.title,
    status: view.status as ResearchPlan["status"],
    rationale: view.rationale,
    sections: view.sections.map((section) => ({
      id: section.id,
      title: section.title,
      dimension: section.dimension,
      rationale: section.rationale,
      objectives: section.objectives,
      tasks: section.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        kind: task.kind as PlanTaskDraft["kind"],
      })),
    })),
    created_at: view.created_at,
    updated_at: view.updated_at,
  };
}

/** `EvidenceView` → Evidence. */
function toEvidence(view: EvidenceViewWire): Evidence {
  return {
    id: view.id,
    project_id: view.project_id,
    claim_id: view.claim_id,
    source_id: view.source_id,
    quote: view.quote,
    locator: {
      kind: view.locator.kind as Evidence["locator"]["kind"],
      value: view.locator.value,
    },
    retrieved_at: view.retrieved_at,
    direction: view.direction as Evidence["direction"],
    extraction_method: view.extraction_method as Evidence["extraction_method"],
    created_at: view.created_at,
  };
}

/** `GraphProjection` → GraphProjection (node `type` key already renamed). */
function toGraphProjection(view: GraphProjectionWire): GraphProjection {
  return {
    project_id: view.project_id,
    nodes: view.nodes.map((node) => ({
      id: node.id,
      type: node.type as GraphNode["type"],
      title: node.title,
      confidence: node.confidence as GraphNode["confidence"],
      dimension: node.dimension,
      source_count: node.source_count,
      claim_count: node.claim_count,
      year: node.year,
    })),
    relations: view.relations.map((relation) => ({
      id: relation.id,
      source_node_id: relation.source_node_id,
      target_node_id: relation.target_node_id,
      predicate: relation.predicate,
      confidence: relation.confidence,
    })),
  };
}

/** `GapReportView` → GapReport (the projection carries the merge results). */
function toGapReport(view: GapReportViewWire): GapReport {
  return {
    project_id: view.project_id,
    gaps: view.gaps.map((gap) => ({
      id: gap.id,
      project_id: gap.project_id,
      dimension: gap.dimension,
      trigger: gap.trigger as ResearchGap["trigger"],
      rule: gap.rule,
      detail: gap.detail,
      quality_sources_found: gap.quality_sources_found,
      coverage: gap.coverage,
      proposed_task: gap.proposed_task,
      proposal_status: gap.proposal_status as ResearchGap["proposal_status"],
      created_task_id: gap.created_task_id,
    })),
    computed_at: view.computed_at,
  };
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

/**
 * Typed error for frontend commands the committed Rust surface cannot
 * serve yet. `what` names the capability gap precisely (e.g. a command
 * that exists but carries a different payload domain).
 */
function unsupported(command: CommandName, what: string): MorphoError {
  return new MorphoError({
    code: "NOT_FOUND",
    user_message: "该功能尚未接入桌面核心，目前仅在网页预览模式下可用。",
    developer_detail: `command '${command}' (${what}) has no counterpart in the committed Rust IPC surface (apps/desktop/src-tauri/src/commands.rs); wire it when the matching core command lands`,
    retryable: false,
    correlation_id: "local-unsupported",
  });
}

/**
 * Reads the project's current research configuration for run responses
 * (`research_config_get`, IPC batch 2). Runs exist only for persisted
 * projects whose config generation is resolvable, so a failure here is a
 * real broken state and surfaces rather than being papered over.
 */
async function researchConfigSnapshot(
  ctx: AdapterContext,
  projectId: string,
): Promise<ResearchConfig> {
  const view = (await ctx.call("research_config_get", {
    project_id: projectId,
  })) as ResearchConfigViewWire;
  return toResearchConfig(view);
}

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

/**
 * Records one gap-proposal outcome in the session decision map. Gap ids are
 * namespaced `gap:{project_id}:{dimension}` (the core's stable identity), so
 * the dimension is recovered by stripping the prefix; the created task id
 * comes from the decision-merged report the core returned.
 */
function rememberGapDecision(
  ctx: AdapterContext,
  projectId: string,
  gapId: string,
  report: GapReportViewWire,
  status: "approved" | "dismissed",
): void {
  const prefix = `gap:${projectId}:`;
  if (!gapId.startsWith(prefix)) return;
  const dimension = gapId.slice(prefix.length);
  const approved = report.gaps.find((gap) => gap.id === gapId);
  const decisions =
    ctx.sessionGapDecisions.get(projectId) ?? new Map<string, SessionGapDecision>();
  decisions.set(dimension, {
    status,
    createdTaskId: status === "approved" ? (approved?.created_task_id ?? null) : null,
  });
  ctx.sessionGapDecisions.set(projectId, decisions);
}

/* ------------------------------------------------------------------ */
/* Session job registry (run.get / run.cancel bridge)                  */
/* ------------------------------------------------------------------ */

/**
 * The committed Rust `run_get`/`run_cancel` commands key on the worker
 * `job_id` returned by `run_start`, and no IPC command enumerates a
 * project's jobs — so the frontend contract (project-scoped run.get /
 * run.cancel) is bridged through a session-scoped map owned by the
 * transport instance. It records the last run started from this window per
 * project; runs started before app launch are invisible until the core
 * exposes a job listing (Wave-2 candidate). Frontend-only transport state,
 * never persisted.
 */
interface SessionJob {
  job_id: string;
  run_id: string;
  plan_id: string;
  plan_title: string;
}

/** Worker job statuses and DB run statuses (lowercased) → TaskState. */
const RUN_STATE_BY_STATUS: Record<string, ResearchRun["state"]> = {
  queued: "PENDING",
  running: "RUNNING",
  paused: "PAUSED",
  needs_review: "NEEDS_REVIEW",
  succeeded: "COMPLETED",
  completed: "COMPLETED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

function runStateFrom(status: string | undefined): ResearchRun["state"] {
  return RUN_STATE_BY_STATUS[(status ?? "").toLowerCase()] ?? "RUNNING";
}

function isoOr(value: string | undefined, fallback: string): string;
function isoOr(value: string | undefined, fallback: null): string | null;
function isoOr(value: string | undefined, fallback: string | null): string | null {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  return fallback;
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
  "project.archive": async (ctx, payload) => {
    // Rust returns Option<ProjectRecord>: null for an unknown project id,
    // the archived record otherwise.
    const record = (await ctx.call("project_archive", {
      project_id: payload.project_id,
    })) as ProjectRecordWire | null;
    return record === null || record === undefined ? null : toProject(record);
  },

  "config.get": async (ctx, payload) => {
    // Research-config read (ADR-020). Distinct from the Rust `config_get`,
    // which transports the APP config (providers/worker/secrets wiring).
    const view = (await ctx.call("research_config_get", {
      project_id: payload.project_id,
    })) as ResearchConfigViewWire;
    return toResearchConfig(view);
  },
  "config.update": async (ctx, payload) => {
    // Appends a NEW research_configs generation (ADR-020); serde ignores
    // echoed bookkeeping keys inside `config`, and the response resolves the
    // new generation in the frontend shape.
    const view = (await ctx.call("research_config_put", {
      project_id: payload.project_id,
      config: payload.config,
    })) as ResearchConfigViewWire;
    return toResearchConfig(view);
  },

  "plan.get": async (ctx, payload) => {
    const plans = await planListWire(ctx, payload.project_id);
    if (plans.length === 0) return null;
    const latest = plans[plans.length - 1];
    // plan_list carries no section rows; when the cached sectioned view (from
    // a batch-2 plan command) describes the same generation, serve it with
    // the record's status/timestamps staying authoritative.
    const cached = ctx.sessionPlans.get(payload.project_id);
    if (cached && cached.id === latest.plan.id) {
      return toResearchPlanFromView({
        ...cached,
        status: latest.plan.status,
        created_at: epochMsToIso(latest.plan.created_at),
        updated_at: epochMsToIso(latest.plan.updated_at),
      });
    }
    return toResearchPlan(latest);
  },
  "plan.regenerate": async (ctx, payload) => {
    // Scripted V0.1 planner: supersedes earlier generations and returns the
    // new draft as a full PlanView (ADR-020).
    const view = (await ctx.call("plan_regenerate", {
      project_id: payload.project_id,
    })) as PlanViewWire;
    ctx.sessionPlans.set(payload.project_id, view);
    return toResearchPlanFromView(view);
  },
  "plan.updateTask": async (ctx, payload) => {
    // Edits one task of the current draft; a blank title keeps the old one
    // (Rust side; the service layer already trims and rejects blanks).
    const view = (await ctx.call("plan_update_task", {
      project_id: payload.project_id,
      task_id: payload.task_id,
      title: payload.title,
      description: payload.description,
    })) as PlanViewWire;
    ctx.sessionPlans.set(payload.project_id, view);
    return toResearchPlanFromView(view);
  },
  "plan.approve": async (ctx, payload) => {
    const entry = await latestPlanWire(ctx, payload.project_id);
    const approved = await ctx.call("plan_approve", { plan_id: entry.plan.id });
    if (approved === null || approved === undefined) {
      throw notFound("未找到该项目的研究计划。", `plan_approve returned no plan '${entry.plan.id}'`);
    }
    // Re-list so the response carries the refreshed status plus tasks.
    const refreshed = await planListWire(ctx, payload.project_id);
    const latest = refreshed[refreshed.length - 1] ?? entry;
    // plan_approve returns only the record; patch the cached sectioned view
    // so follow-up plan.get reads keep serving the full tree.
    const cached = ctx.sessionPlans.get(payload.project_id);
    if (cached && cached.id === latest.plan.id) {
      const patched: PlanViewWire = {
        ...cached,
        status: latest.plan.status,
        updated_at: epochMsToIso(latest.plan.updated_at),
      };
      ctx.sessionPlans.set(payload.project_id, patched);
      return toResearchPlanFromView(patched);
    }
    return toResearchPlan(latest);
  },
  "plan.reject": async (ctx, payload) => {
    // Marks the latest generation rejected and returns its full view.
    const view = (await ctx.call("plan_reject", {
      project_id: payload.project_id,
    })) as PlanViewWire;
    ctx.sessionPlans.set(payload.project_id, view);
    return toResearchPlanFromView(view);
  },

  "run.get": async (ctx, payload) => {
    // Bridged through the session job registry: no committed Rust command
    // maps a project onto its worker job, so a run that was not started
    // from this window reads as "no run" rather than fabricated state.
    const job = ctx.sessionJobs.get(payload.project_id);
    if (!job) return null;
    const envelope = (await ctx.call("run_get", {
      job_id: job.job_id,
    })) as RunGetEnvelopeWire;
    const now = new Date().toISOString();
    return {
      id: envelope.task_rollup?.run_id ?? envelope.job?.run_id ?? job.run_id,
      project_id: payload.project_id,
      plan_id: job.plan_id,
      // The orchestrator-projected rollup is the authority (PRD §7: SQLite
      // is authoritative); the worker envelope stands in when the run is
      // not yet resolvable locally.
      state: runStateFrom(envelope.task_rollup?.run_status ?? envelope.job?.status),
      config_snapshot: await researchConfigSnapshot(ctx, payload.project_id),
      plan_snapshot_title: job.plan_title,
      started_at: isoOr(envelope.job?.created_at, null),
      updated_at: isoOr(envelope.job?.updated_at, now),
    } satisfies ResearchRun;
  },
  "run.start": async (ctx, payload) => {
    const entry = await latestPlanWire(ctx, payload.project_id);
    const started = (await ctx.call("run_start", {
      plan_id: entry.plan.id,
      // Starting a run from the UI carries the plan-review decision; the
      // worker rejects the job without it (PLAN_NOT_APPROVED).
      approve_plan: true,
    })) as RunStartedWire;
    ctx.sessionJobs.set(payload.project_id, {
      job_id: started.job_id,
      run_id: started.run_id,
      plan_id: entry.plan.id,
      plan_title: entry.plan.title,
    });
    const now = new Date().toISOString();
    return {
      id: started.run_id,
      project_id: started.project_id,
      plan_id: entry.plan.id,
      state: "RUNNING",
      config_snapshot: await researchConfigSnapshot(ctx, payload.project_id),
      plan_snapshot_title: entry.plan.title,
      started_at: now,
      updated_at: now,
    } satisfies ResearchRun;
  },
  "run.cancel": async (ctx, payload) => {
    // Same session job registry as run.get — see its comment.
    const job = ctx.sessionJobs.get(payload.project_id);
    if (!job) {
      throw notFound(
        "该项目当前没有可取消的研究运行。",
        `no worker job recorded for project '${payload.project_id}' in this session`,
      );
    }
    return (await ctx.call("run_cancel", { job_id: job.job_id })) === true;
  },

  "task.list": async (ctx, payload) => {
    // Only the latest plan generation's tasks are actionable: regenerate
    // supersedes earlier generations whose task rows persist for history
    // and must not double-count in the UI. Gap follow-up tasks attach to
    // the latest plan's sections, so they stay listed.
    const plans = await planListWire(ctx, payload.project_id);
    const latest = plans[plans.length - 1];
    return latest ? latest.tasks.map((task) => toResearchTask(task, latest.plan.project_id)) : [];
  },
  "task.pause": async () => {
    throw unsupported("task.pause", "per-task worker dispatch (ADR-019 phase 2)");
  },
  "task.resume": async () => {
    throw unsupported("task.resume", "per-task worker dispatch (ADR-019 phase 2)");
  },
  "task.retry": async () => {
    throw unsupported("task.retry", "per-task worker dispatch (ADR-019 phase 2)");
  },
  "task.cancel": async () => {
    throw unsupported("task.cancel", "per-task worker dispatch (ADR-019 phase 2)");
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
  "evidence.listByClaim": async (ctx, payload) => {
    // Evidence joined through claim_evidence, project-scoped; an unknown
    // claim lists nothing (ADR-020).
    const views = (await ctx.call("evidence_list_by_claim", {
      project_id: payload.project_id,
      claim_id: payload.claim_id,
    })) as EvidenceViewWire[];
    return views.map(toEvidence);
  },
  "relation.list": async (ctx, payload) => {
    const records = (await ctx.call("relations_list", {
      project_id: payload.project_id,
    })) as RelationRecordWire[];
    return records.map(toRelation);
  },
  "graph.get": async (ctx, payload) => {
    // Nodes + relations projection with dangling edges filtered; empty for a
    // fresh project (ADR-020).
    const view = (await ctx.call("graph_get", {
      project_id: payload.project_id,
    })) as GraphProjectionWire;
    return toGraphProjection(view);
  },

  "coverage.get": async (ctx, payload) => {
    const report = (await ctx.call("coverage_get", {
      project_id: payload.project_id,
    })) as RustCoverageReportWire;
    return toCoverageReport(report);
  },
  "gap.list": async (ctx, payload) => {
    // The Rust coverage report already computes the gap rows; this
    // session's approve/dismiss outcomes are merged on top because no
    // committed read command exposes the persisted gap_decisions (the merge
    // mirrors the core's gap_report, src-tauri/src/projections.rs).
    const report = (await ctx.call("coverage_get", {
      project_id: payload.project_id,
    })) as RustCoverageReportWire;
    const decisions = ctx.sessionGapDecisions.get(payload.project_id);
    const gaps = report.gaps
      .filter((gap) => decisions?.get(gap.dimension)?.status !== "dismissed")
      .map((gap) => {
        const decision = decisions?.get(gap.dimension);
        const base = toResearchGap(gap, report.project_id);
        return decision?.status === "approved"
          ? { ...base, proposal_status: "approved" as const, created_task_id: decision.createdTaskId }
          : base;
      });
    return {
      project_id: report.project_id,
      gaps,
      computed_at: epochMsToIso(report.computed_at),
    } satisfies GapReport;
  },
  "gap.approveProposal": async (ctx, payload) => {
    // Creates the PENDING follow-up task (idempotent) and returns the
    // decision-merged report; the outcome is remembered for gap.list.
    const view = (await ctx.call("gap_approve_proposal", {
      project_id: payload.project_id,
      gap_id: payload.gap_id,
    })) as GapReportViewWire;
    rememberGapDecision(ctx, payload.project_id, payload.gap_id, view, "approved");
    return toGapReport(view);
  },
  "gap.dismissProposal": async (ctx, payload) => {
    // Persists the dismissal; the dimension disappears from the report.
    const view = (await ctx.call("gap_dismiss_proposal", {
      project_id: payload.project_id,
      gap_id: payload.gap_id,
    })) as GapReportViewWire;
    rememberGapDecision(ctx, payload.project_id, payload.gap_id, view, "dismissed");
    return toGapReport(view);
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
    throw unsupported("assistant.getContext", "assistant context projection");
  },
  "assistant.act": async () => {
    throw unsupported("assistant.act", "assistant actions");
  },
  "assistant.saveDecision": async () => {
    throw unsupported("assistant.saveDecision", "decision journal persistence");
  },
  "assistant.listDecisions": async () => {
    throw unsupported("assistant.listDecisions", "decision journal read");
  },

  "secrets.setProviderKey": async (ctx, payload) => {
    // The key value crosses IPC exactly once; the response is only the
    // keychain reference (RUST-04: values never leave the keychain).
    const reference = (await ctx.call("secrets_set_provider_key", {
      provider: payload.provider,
      api_key: payload.api_key,
    })) as SecretRefWire;
    return { provider: reference.provider, key_name: reference.key_name };
  },
  "secrets.listProviders": async (ctx) => {
    const providers = (await ctx.call("secrets_list_providers", {})) as ProviderKeyStatusWire[];
    return providers.map((provider) => ({
      name: provider.name,
      base_url: provider.base_url,
      model: provider.model,
      key_ref: {
        provider: provider.key_ref.provider,
        key_name: provider.key_ref.key_name,
      },
      has_key: provider.has_key,
    }));
  },

  "vault.exportProject": async (ctx, payload) => {
    const result = (await ctx.call("vault_export_project", {
      project_id: payload.project_id,
    })) as VaultExportResultWire;
    return {
      written: result.written,
      unchanged: result.unchanged,
      conflicts: result.conflicts,
      skipped: result.skipped,
      sources: result.sources,
      claims: result.claims,
      maps: result.maps,
      // `ours`/`theirs_hash` carry file content and hashes the UI has no
      // use for; the projection keeps the decision-relevant fields only.
      merge_proposals: result.merge_proposals.map((proposal) => ({
        path: proposal.path,
        node_id: proposal.node_id,
        reason: proposal.reason,
      })),
      vault_root: result.vault_root,
    };
  },

  "core.info": async (ctx) => {
    // `core_info` declares no IpcRequest parameter; Tauri ignores the
    // envelope argument, so it flows through the same call path.
    const info = (await ctx.call("core_info", {})) as CoreInfoWire;
    return info;
  },
  "core.ping": async (ctx, payload) => {
    const pong = (await ctx.call("ping", { echo: payload.echo })) as { echo: string };
    return { echo: pong.echo };
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
  // One registry per transport instance: the app uses a single transport
  // singleton (transportProvider), so run.start → run.get/run.cancel and the
  // batch-2 plan-view/gap-decision bridges share it for the whole session.
  const sessionJobs = new Map<string, SessionJob>();
  const sessionPlans = new Map<string, PlanViewWire>();
  const sessionGapDecisions = new Map<string, Map<string, SessionGapDecision>>();
  return {
    async invoke<K extends CommandName>(
      command: K,
      payload: CommandRequest<K>,
      invokeOptions?: { signal?: AbortSignal },
    ): Promise<CommandResponse<K>> {
      if (invokeOptions?.signal?.aborted) {
        throw new DOMException("The request was aborted", "AbortError");
      }
      const ctx = makeContext(invoke, sessionJobs, sessionPlans, sessionGapDecisions, invokeOptions?.signal);
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
