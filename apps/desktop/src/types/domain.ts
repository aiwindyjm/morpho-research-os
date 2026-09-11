/**
 * Domain types mirroring the documented model:
 * docs/PRD.md §5–§7, docs/DATA_MODEL.md, docs/data/*.md.
 *
 * Identifiers are UUIDv7 strings and timestamps are UTC ISO-8601 strings
 * (docs/DATA_MODEL.md). Frontend code never invents a second vocabulary —
 * every enum here is quoted from the governing specification.
 */

/** Confidence vocabulary (docs/PRD.md §6, docs/data/CLAIM_SCHEMA.md). */
export const CONFIDENCE_STATES = [
  "confirmed",
  "high",
  "medium",
  "low",
  "unverified",
  "conflicting",
] as const;
export type ConfidenceState = (typeof CONFIDENCE_STATES)[number];

/** Knowledge node types (docs/PRD.md §6, docs/data/KNOWLEDGE_SCHEMA.md). */
export const KNOWLEDGE_NODE_TYPES = [
  "Concept",
  "Person",
  "Organization",
  "Company",
  "Paper",
  "Book",
  "Experiment",
  "Event",
  "Technology",
  "Product",
  "Application",
  "Policy",
  "Dataset",
  "Controversy",
] as const;
export type KnowledgeNodeType = (typeof KNOWLEDGE_NODE_TYPES)[number];

/** Research purposes (docs/PRD.md §5). */
export const RESEARCH_PURPOSES = [
  "learning",
  "teaching",
  "writing",
  "research",
  "industry",
  "product",
  "strategy",
  "custom",
] as const;
export type ResearchPurpose = (typeof RESEARCH_PURPOSES)[number];

/** Task state machine (docs/PRD.md §7). Only the Orchestrator transitions. */
export const TASK_STATES = [
  "PENDING",
  "PLANNING",
  "RUNNING",
  "VALIDATING",
  "COMPLETED",
  "NEEDS_REVIEW",
  "PAUSED",
  "FAILED",
  "CANCELLED",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** Terminal/awaiting states that stop the simulation for a task. */
export const TERMINAL_TASK_STATES: readonly TaskState[] = [
  "COMPLETED",
  "NEEDS_REVIEW",
  "FAILED",
  "CANCELLED",
];

/** Default research dimensions (docs/PRD.md §5). */
export const DEFAULT_DIMENSIONS = [
  "concepts",
  "history",
  "theory",
  "technology",
  "experiments",
  "papers",
  "people",
  "organizations",
  "companies",
  "products",
  "applications",
  "industry",
  "policy",
  "market",
  "investment",
  "controversy",
  "risk",
  "recent_developments",
  "future_trends",
] as const;

/** Depth levels 1–5 (docs/PRD.md §5). */
export const DEPTH_LEVELS = [
  { value: 1, key: "orientation" },
  { value: 2, key: "system_understanding" },
  { value: 3, key: "structured_research" },
  { value: 4, key: "professional_research" },
  { value: 5, key: "frontier_mapping" },
] as const;

export type ResearchDepth = 1 | 2 | 3 | 4 | 5;

export function isResearchDepth(value: number): value is ResearchDepth {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

/** research_config time_range (packages/schemas/research-config.v1.json). */
export interface TimeRange {
  from: string | null;
  to: string | null;
}

/**
 * Research configuration. Structured per docs/PRD.md §5 and validated
 * against packages/schemas/research-config.v1.json (required subset) —
 * source_domains and update_frequency are PRD §5 fields beyond the
 * required schema properties.
 */
export interface ResearchConfig {
  schema_version: "1.0";
  domain: string;
  topic: string;
  purpose: ResearchPurpose;
  audience: string;
  depth: ResearchDepth;
  dimensions: string[];
  time_range: TimeRange;
  geographic_scope: string;
  languages: string[];
  source_types: string[];
  source_domains: string[];
  update_frequency: "manual";
}

export type PlanStatus = "draft" | "approved" | "rejected";

/** What a plan task instructs; refined from the worker pipeline roles. */
export type PlanTaskKind =
  | "search"
  | "source_evaluation"
  | "extraction"
  | "normalization"
  | "validation"
  | "synthesis";

export interface PlanTaskDraft {
  id: string;
  title: string;
  description: string;
  kind: PlanTaskKind;
}

export interface ResearchSection {
  id: string;
  title: string;
  dimension: string;
  rationale: string;
  objectives: string[];
  tasks: PlanTaskDraft[];
}

export interface ResearchPlan {
  id: string;
  project_id: string;
  title: string;
  status: PlanStatus;
  rationale: string;
  sections: ResearchSection[];
  created_at: string;
  updated_at: string;
}

export interface ResearchRun {
  id: string;
  project_id: string;
  plan_id: string;
  state: TaskState;
  config_snapshot: ResearchConfig;
  plan_snapshot_title: string;
  started_at: string | null;
  updated_at: string;
}

export interface ResearchTask {
  id: string;
  project_id: string;
  run_id: string | null;
  section_id: string;
  title: string;
  description: string;
  kind: PlanTaskKind;
  state: TaskState;
  dependencies: string[];
  attempt: number;
  idempotency_key: string;
  /** Checkpoint marker for resumable execution (docs/PRD.md §7). */
  checkpoint: string | null;
  error_code: string | null;
  dimension: string;
  created_at: string;
  updated_at: string;
}

export type SourceStatus =
  | "discovered"
  | "evaluated"
  | "fetched"
  | "indexed"
  | "rejected";

export type SourceType =
  | "web_page"
  | "paper"
  | "documentation"
  | "book"
  | "dataset"
  | "video"
  | "repository";

/**
 * Source quality describes authority and fitness for purpose; it never
 * declares that a low-rated source is false (docs/PRD.md §6).
 */
export interface SourceQuality {
  authority: number;
  fitness: number;
  rationale: string;
}

export interface Source {
  id: string;
  project_id: string;
  url: string;
  title: string;
  source_type: SourceType;
  status: SourceStatus;
  quality: SourceQuality | null;
  dimensions: string[];
  retrieved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeNode {
  id: string;
  project_id: string;
  type: KnowledgeNodeType;
  title: string;
  aliases: string[];
  summary: string;
  status: ConfidenceState;
  confidence: number;
  dimension: string;
  source_ids: string[];
  claim_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface Claim {
  id: string;
  project_id: string;
  subject_node_id: string;
  predicate: string;
  object_value: string;
  scope: string;
  status: ConfidenceState;
  confidence: number;
  source_ids: string[];
  evidence_ids: string[];
  created_at: string;
  updated_at: string;
}

export type EvidenceDirection = "support" | "contradict";

export type LocatorKind = "quote" | "page" | "section" | "url_fragment";

export interface EvidenceLocator {
  kind: LocatorKind;
  value: string;
}

export interface Evidence {
  id: string;
  project_id: string;
  claim_id: string;
  source_id: string;
  quote: string;
  locator: EvidenceLocator;
  retrieved_at: string;
  direction: EvidenceDirection;
  extraction_method: "llm_extraction" | "manual" | "search_snippet";
  created_at: string;
}

export interface Relation {
  id: string;
  project_id: string;
  subject_id: string;
  predicate: string;
  object_id: string;
  direction: "directed" | "undirected";
  confidence: number;
  status: "active" | "proposed" | "retired";
  claim_ids: string[];
  source_ids: string[];
}

/** Ordered, append-only projection of run activity (docs/API.md). */
export interface RunEvent {
  id: string;
  run_id: string;
  seq: number;
  timestamp: string;
  type: string;
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Coverage, gaps, timeline (docs/PRD.md §14, docs/architecture/       */
/* COVERAGE_AND_GAPS.md)                                               */
/* ------------------------------------------------------------------ */

/** PRD V0.1 fixed weights: 0.4/0.3/0.2/0.1. */
export const COVERAGE_WEIGHTS = {
  task_completion: 0.4,
  knowledge_breadth: 0.3,
  evidence_density: 0.2,
  source_diversity: 0.1,
} as const;

/** A gap exists below 0.6 coverage or with fewer than 2 quality sources. */
export const GAP_COVERAGE_THRESHOLD = 0.6;
export const GAP_MIN_QUALITY_SOURCES = 2;
/** A quality source needs authority ≥ 0.7 and fitness ≥ 0.7. */
export const QUALITY_SOURCE_THRESHOLD = 0.7;

export interface CoverageComponents {
  task_completion: number;
  knowledge_breadth: number;
  evidence_density: number;
  source_diversity: number;
}

export interface CoverageDimensionResult {
  dimension: string;
  coverage: number;
  components: CoverageComponents;
  inputs: {
    tasks_total: number;
    tasks_completed: number;
    knowledge_nodes: number;
    evidence_items: number;
    quality_sources: number;
    source_types: string[];
  };
  reasons: string[];
  updated_at: string;
}

export interface CoverageReport {
  project_id: string;
  overall: number;
  dimensions: CoverageDimensionResult[];
  computed_at: string;
}

export type GapTrigger =
  | "coverage_below_threshold"
  | "insufficient_quality_sources";

export interface ProposedTask {
  title: string;
  description: string;
  dimension: string;
}

export type GapProposalStatus = "pending_approval" | "approved" | "dismissed";

export interface ResearchGap {
  id: string;
  project_id: string;
  dimension: string;
  trigger: GapTrigger;
  rule: string;
  detail: string;
  quality_sources_found: number;
  coverage: number;
  proposed_task: ProposedTask;
  proposal_status: GapProposalStatus;
  /** Set once the user approves; this is the created task id. */
  created_task_id: string | null;
}

export interface GapReport {
  project_id: string;
  gaps: ResearchGap[];
  computed_at: string;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  kind: "run" | "task" | "source" | "claim" | "knowledge";
  title: string;
  detail: string;
}

/* ------------------------------------------------------------------ */
/* Graph projection (docs/PRD.md §13; RES-08)                          */
/* ------------------------------------------------------------------ */

export interface GraphNode {
  id: string;
  type: KnowledgeNodeType;
  title: string;
  confidence: ConfidenceState;
  dimension: string;
  source_count: number;
  claim_count: number;
}

export interface GraphRelation {
  id: string;
  source_node_id: string;
  target_node_id: string;
  predicate: string;
  confidence: number;
}

export interface GraphProjection {
  project_id: string;
  nodes: GraphNode[];
  relations: GraphRelation[];
}

/* ------------------------------------------------------------------ */
/* Assistant (docs/PRD.md §12)                                         */
/* ------------------------------------------------------------------ */

/** The four first-round assistant actions; nothing else is exposed. */
export const ASSISTANT_ACTIONS = [
  "explain_progress",
  "suggest_next_task",
  "list_pending_reviews",
  "record_decision",
] as const;
export type AssistantAction = (typeof ASSISTANT_ACTIONS)[number];

export interface AssistantContext {
  project_id: string;
  project_name: string;
  topic: string;
  plan_status: PlanStatus | "none";
  tasks_total: number;
  tasks_completed: number;
  pending_reviews: number;
}

export interface AssistantItem {
  label: string;
  detail: string;
}

export interface AssistantResponse {
  action: AssistantAction;
  project_id: string;
  summary: string;
  items: AssistantItem[];
  created_at: string;
}

export interface SavedDecision {
  id: string;
  project_id: string;
  content: string;
  saved_at: string;
}
