import { z } from "zod";
import {
  ASSISTANT_ACTIONS,
  CONFIDENCE_STATES,
  KNOWLEDGE_NODE_TYPES,
  RESEARCH_PURPOSES,
  TASK_STATES,
  type AssistantContext,
  type AssistantResponse,
  type Claim,
  type CoverageReport,
  type Evidence,
  type GapReport,
  type GraphProjection,
  type KnowledgeNode,
  type Project,
  type ResearchConfig,
  type ResearchGap,
  type ResearchPlan,
  type ResearchRun,
  type ResearchTask,
  type Relation,
  type SavedDecision,
  type Source,
  type TimelineEntry,
} from "./domain";

/**
 * Zod schemas for every payload that crosses the service boundary.
 *
 * researchConfigSchema mirrors packages/schemas/research-config.v1.json —
 * the canonical contract — field for field (its required list and
 * constraints), plus the two PRD §5 fields the schema permits as extra
 * properties (source_domains, update_frequency). Fixtures and mock
 * service responses are validated with these schemas in tests, so demo
 * data can never drift from the documented shape.
 */

export const confidenceStateSchema = z.enum(CONFIDENCE_STATES);
export const knowledgeNodeTypeSchema = z.enum(KNOWLEDGE_NODE_TYPES);
export const researchPurposeSchema = z.enum(RESEARCH_PURPOSES);
export const taskStateSchema = z.enum(TASK_STATES);
export const assistantActionSchema = z.enum(ASSISTANT_ACTIONS);

/** Depth levels 1–5 typed as their literal union (docs/PRD.md §5). */
export const researchDepthSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const uuidSchema = z.string().uuid();
const isoTimestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "timestamp must be an ISO-8601 date-time string",
  );

export const projectSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  description: z.string(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
}) satisfies z.ZodType<Project>;

export const timeRangeSchema = z.object({
  from: isoTimestampSchema.nullable(),
  to: isoTimestampSchema.nullable(),
});

/**
 * Mirrors packages/schemas/research-config.v1.json. Required fields and
 * constraints are identical; extraProperties are allowed by the schema.
 */
export const researchConfigSchema = z.object({
  schema_version: z.literal("1.0"),
  domain: z.string(),
  topic: z.string(),
  purpose: researchPurposeSchema,
  audience: z.string(),
  depth: researchDepthSchema,
  dimensions: z.array(z.string()),
  time_range: timeRangeSchema,
  geographic_scope: z.string(),
  languages: z.array(z.string()),
  source_types: z.array(z.string()),
  source_domains: z.array(z.string()),
  update_frequency: z.literal("manual"),
}) satisfies z.ZodType<ResearchConfig>;

export const planTaskDraftSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1),
  description: z.string(),
  kind: z.enum([
    "search",
    "source_evaluation",
    "extraction",
    "normalization",
    "validation",
    "synthesis",
  ]),
});

export const researchSectionSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1),
  dimension: z.string().min(1),
  rationale: z.string(),
  objectives: z.array(z.string()),
  tasks: z.array(planTaskDraftSchema),
});

export const researchPlanSchema = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  title: z.string().min(1),
  status: z.enum(["draft", "approved", "rejected"]),
  rationale: z.string(),
  sections: z.array(researchSectionSchema),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
}) satisfies z.ZodType<ResearchPlan>;

export const researchRunSchema = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  plan_id: uuidSchema,
  state: taskStateSchema,
  config_snapshot: researchConfigSchema,
  plan_snapshot_title: z.string(),
  started_at: isoTimestampSchema.nullable(),
  updated_at: isoTimestampSchema,
}) satisfies z.ZodType<ResearchRun>;

export const researchTaskSchema = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  run_id: uuidSchema.nullable(),
  section_id: uuidSchema,
  title: z.string().min(1),
  description: z.string(),
  kind: z.enum([
    "search",
    "source_evaluation",
    "extraction",
    "normalization",
    "validation",
    "synthesis",
  ]),
  state: taskStateSchema,
  dependencies: z.array(uuidSchema),
  attempt: z.number().int().min(0),
  idempotency_key: z.string().min(1),
  checkpoint: z.string().nullable(),
  error_code: z.string().nullable(),
  dimension: z.string(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
}) satisfies z.ZodType<ResearchTask>;

export const sourceQualitySchema = z.object({
  authority: z.number().min(0).max(1),
  fitness: z.number().min(0).max(1),
  rationale: z.string(),
});

export const sourceSchema = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  url: z.string().url(),
  title: z.string().min(1),
  source_type: z.enum([
    "web_page",
    "paper",
    "documentation",
    "book",
    "dataset",
    "video",
    "repository",
  ]),
  status: z.enum(["discovered", "evaluated", "fetched", "indexed", "rejected"]),
  quality: sourceQualitySchema.nullable(),
  dimensions: z.array(z.string()),
  retrieved_at: isoTimestampSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
}) satisfies z.ZodType<Source>;

export const knowledgeNodeSchema = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  type: knowledgeNodeTypeSchema,
  title: z.string().min(1),
  aliases: z.array(z.string()),
  summary: z.string(),
  status: confidenceStateSchema,
  confidence: z.number().min(0).max(1),
  dimension: z.string(),
  source_ids: z.array(uuidSchema),
  claim_ids: z.array(uuidSchema),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
}) satisfies z.ZodType<KnowledgeNode>;

export const claimSchema = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  subject_node_id: uuidSchema,
  predicate: z.string().min(1),
  object_value: z.string().min(1),
  scope: z.string(),
  status: confidenceStateSchema,
  confidence: z.number().min(0).max(1),
  source_ids: z.array(uuidSchema),
  evidence_ids: z.array(uuidSchema),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
}) satisfies z.ZodType<Claim>;

export const evidenceSchema = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  claim_id: uuidSchema,
  source_id: uuidSchema,
  quote: z.string().min(1),
  locator: z.object({
    kind: z.enum(["quote", "page", "section", "url_fragment"]),
    value: z.string().min(1),
  }),
  retrieved_at: isoTimestampSchema,
  direction: z.enum(["support", "contradict"]),
  extraction_method: z.enum(["llm_extraction", "manual", "search_snippet"]),
  created_at: isoTimestampSchema,
}) satisfies z.ZodType<Evidence>;

export const relationSchema = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  subject_id: uuidSchema,
  predicate: z.string().min(1),
  object_id: uuidSchema,
  direction: z.enum(["directed", "undirected"]),
  confidence: z.number().min(0).max(1),
  status: z.enum(["active", "proposed", "retired"]),
  claim_ids: z.array(uuidSchema),
  source_ids: z.array(uuidSchema),
}) satisfies z.ZodType<Relation>;

export const coverageDimensionResultSchema = z.object({
  dimension: z.string(),
  coverage: z.number().min(0).max(1),
  components: z.object({
    task_completion: z.number().min(0).max(1),
    knowledge_breadth: z.number().min(0).max(1),
    evidence_density: z.number().min(0).max(1),
    source_diversity: z.number().min(0).max(1),
  }),
  inputs: z.object({
    tasks_total: z.number().int().min(0),
    tasks_completed: z.number().int().min(0),
    knowledge_nodes: z.number().int().min(0),
    evidence_items: z.number().int().min(0),
    quality_sources: z.number().int().min(0),
    source_types: z.array(z.string()),
  }),
  reasons: z.array(z.string()),
  updated_at: isoTimestampSchema,
});

export const gapProposalStatusSchema = z.enum([
  "pending_approval",
  "approved",
  "dismissed",
]);

export const researchGapSchema = z.object({
  id: z.string().min(1),
  project_id: uuidSchema,
  dimension: z.string().min(1),
  trigger: z.enum(["coverage_below_threshold", "insufficient_quality_sources"]),
  rule: z.string().min(1),
  detail: z.string(),
  quality_sources_found: z.number().int().min(0),
  coverage: z.number().min(0).max(1),
  proposed_task: z.object({
    title: z.string().min(1),
    description: z.string(),
    dimension: z.string(),
  }),
  proposal_status: gapProposalStatusSchema,
  created_task_id: z.string().nullable(),
}) satisfies z.ZodType<ResearchGap>;

export const timelineEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: isoTimestampSchema,
  kind: z.enum(["run", "task", "source", "claim", "knowledge"]),
  title: z.string().min(1),
  detail: z.string(),
}) satisfies z.ZodType<TimelineEntry>;

export const savedDecisionSchema = z.object({
  id: z.string().min(1),
  project_id: uuidSchema,
  content: z.string().min(1),
  saved_at: isoTimestampSchema,
}) satisfies z.ZodType<SavedDecision>;

export const coverageReportSchema = z.object({
  project_id: uuidSchema,
  overall: z.number().min(0).max(1),
  dimensions: z.array(coverageDimensionResultSchema),
  computed_at: isoTimestampSchema,
}) satisfies z.ZodType<CoverageReport>;

export const gapReportSchema = z.object({
  project_id: uuidSchema,
  gaps: z.array(researchGapSchema),
  computed_at: isoTimestampSchema,
}) satisfies z.ZodType<GapReport>;

export const graphProjectionSchema = z.object({
  project_id: uuidSchema,
  nodes: z.array(
    z.object({
      id: uuidSchema,
      type: knowledgeNodeTypeSchema,
      title: z.string().min(1),
      confidence: confidenceStateSchema,
      dimension: z.string(),
      source_count: z.number().int().min(0),
      claim_count: z.number().int().min(0),
      year: z.number().int().nullable().optional(),
    }),
  ),
  relations: z.array(
    z.object({
      id: uuidSchema,
      source_node_id: uuidSchema,
      target_node_id: uuidSchema,
      predicate: z.string().min(1),
      confidence: z.number().min(0).max(1),
    }),
  ),
}) satisfies z.ZodType<GraphProjection>;

export const assistantContextSchema = z.object({
  project_id: uuidSchema,
  project_name: z.string().min(1),
  topic: z.string(),
  plan_status: z.enum(["draft", "approved", "rejected", "none"]),
  tasks_total: z.number().int().min(0),
  tasks_completed: z.number().int().min(0),
  pending_reviews: z.number().int().min(0),
}) satisfies z.ZodType<AssistantContext>;

export const assistantResponseSchema = z.object({
  action: assistantActionSchema,
  project_id: uuidSchema,
  summary: z.string().min(1),
  items: z.array(
    z.object({
      label: z.string().min(1),
      detail: z.string(),
    }),
  ),
  created_at: isoTimestampSchema,
}) satisfies z.ZodType<AssistantResponse>;

/**
 * Note on id formats: the documented model requires UUIDv7 strings. Zod's
 * .uuid() accepts any RFC-9562 UUID; the stricter v7 shape (version and
 * variant nibbles) is asserted separately in fixture tests.
 */
export const uuidV7Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "must be a UUIDv7 string",
  );
