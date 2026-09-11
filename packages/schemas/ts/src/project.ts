import { z } from "zod";
import { SchemaVersionV1 } from "./schema-version";

export const ResearchPurpose = z.enum([
  "learning",
  "teaching",
  "writing",
  "research",
  "industry",
  "product",
  "strategy",
  "custom",
]);

export const ResearchPlanStatus = z.enum([
  "draft",
  "pending-approval",
  "approved",
  "rejected",
  "superseded",
]);

export const ResearchTaskType = z.enum([
  "search",
  "source-evaluation",
  "extraction",
  "entity",
  "relation",
  "validation",
  "writer",
  "synthesis",
]);

export const ResearchTaskStatus = z.enum([
  "PENDING",
  "PLANNING",
  "RUNNING",
  "VALIDATING",
  "NEEDS_REVIEW",
  "COMPLETED",
  "FAILED",
  "PAUSED",
  "CANCELLED",
]);

export const TaskDependencyCondition = z.enum(["completed", "completed-or-skipped"]);

export const ResearchRunStatus = z.enum(["running", "paused", "completed", "failed", "cancelled"]);

export const ProjectSchema = z.object({
  schema_version: SchemaVersionV1,
  project_id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  vault_path: z.string().optional(),
  archived: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const TimeRangeSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export const ResearchConfigSchema = z.object({
  schema_version: SchemaVersionV1,
  config_id: z.string(),
  project_id: z.string(),
  domain: z.string().min(1),
  topic: z.string().min(1),
  purpose: ResearchPurpose,
  audience: z.string().optional(),
  depth: z.number().int().min(1).max(5),
  dimensions: z.array(z.string().min(1)).min(1),
  time_range: TimeRangeSchema.optional(),
  geographic_scope: z.string().optional(),
  languages: z.array(z.string().min(2)).min(1),
  source_types: z.array(z.string().min(1)).min(1),
  source_domains: z.array(z.string()).optional(),
  update_frequency: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;

export const PlanGeneratedBySchema = z
  .object({
    prompt_id: z.string(),
    prompt_version: z.string(),
  })
  .strict();

export const ResearchPlanSchema = z.object({
  schema_version: SchemaVersionV1,
  plan_id: z.string(),
  project_id: z.string(),
  config_id: z.string(),
  title: z.string().optional(),
  status: ResearchPlanStatus,
  section_ids: z.array(z.string()).min(1),
  generated_by: PlanGeneratedBySchema.optional(),
  approved_at: z.string().optional(),
  rejected_at: z.string().optional(),
  superseded_by: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

export const ResearchSectionSchema = z.object({
  schema_version: SchemaVersionV1,
  section_id: z.string(),
  plan_id: z.string(),
  title: z.string().min(1),
  dimension: z.string().optional(),
  rationale: z.string().optional(),
  order: z.number().int().min(0),
  task_ids: z.array(z.string()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type ResearchSection = z.infer<typeof ResearchSectionSchema>;

export const ResearchTaskSchema = z.object({
  schema_version: SchemaVersionV1,
  task_id: z.string(),
  plan_id: z.string(),
  run_id: z.string().optional(),
  section_id: z.string().optional(),
  project_id: z.string(),
  type: ResearchTaskType,
  status: ResearchTaskStatus,
  idempotency_key: z.string().min(1),
  checkpoint: z.record(z.unknown()).optional(),
  retry_count: z.number().int().min(0).optional(),
  max_retries: z.number().int().min(0).optional(),
  cache_refs: z.array(z.string()).optional(),
  result_ref: z.string().optional(),
  error_ref: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ResearchTask = z.infer<typeof ResearchTaskSchema>;

export const TaskDependencySchema = z.object({
  schema_version: SchemaVersionV1,
  task_id: z.string(),
  depends_on_task_id: z.string(),
  condition: TaskDependencyCondition,
  created_at: z.string().optional(),
});
export type TaskDependency = z.infer<typeof TaskDependencySchema>;

export const ResearchRunSchema = z.object({
  schema_version: SchemaVersionV1,
  run_id: z.string(),
  project_id: z.string(),
  plan_id: z.string(),
  status: ResearchRunStatus,
  config_snapshot: z.record(z.unknown()).optional(),
  plan_snapshot_ref: z.string().optional(),
  stats: z.record(z.unknown()).optional(),
  started_at: z.string(),
  finished_at: z.string().optional(),
});
export type ResearchRun = z.infer<typeof ResearchRunSchema>;
