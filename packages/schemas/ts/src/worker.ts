import { z } from "zod";
import { SchemaVersionV1 } from "./schema-version";

/**
 * Worker protocol messages are CLOSED envelopes: unknown fields are rejected in
 * every stack (zod strict / pydantic forbid / serde deny_unknown_fields) so
 * typos fail fast at the process boundary.
 */
export const ProtocolVersion = z.enum(["1.0"]);

export const WorkerJobType = z.enum([
  "search",
  "source-evaluation",
  "extraction",
  "entity",
  "relation",
  "validation",
  "writer",
  "synthesis",
]);

export const WorkerErrorCode = z.enum([
  "WORKER_NOT_AVAILABLE",
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_TIMEOUT",
  "SEARCH_FAILED",
  "SOURCE_PARSE_FAILED",
  "LLM_INVALID_JSON",
  "TASK_DEPENDENCY_FAILED",
  "VAULT_WRITE_FAILED",
  "VAULT_SCHEMA_MISMATCH",
  "DATABASE_ERROR",
]);

export const WorkerHealthResponseSchema = z
  .object({
    schema_version: SchemaVersionV1,
    status: z.enum(["ok", "degraded"]),
    worker_version: z.string().min(1),
    protocol_version: ProtocolVersion,
    detail: z.string().optional(),
  })
  .strict();
export type WorkerHealthResponse = z.infer<typeof WorkerHealthResponseSchema>;

export const WorkerVersionResponseSchema = z
  .object({
    schema_version: SchemaVersionV1,
    worker_version: z.string().min(1),
    protocol_version: ProtocolVersion,
    capabilities: z.array(WorkerJobType),
  })
  .strict();
export type WorkerVersionResponse = z.infer<typeof WorkerVersionResponseSchema>;

export const WorkerJobRequestSchema = z
  .object({
    schema_version: SchemaVersionV1,
    job_id: z.string().min(1),
    task_id: z.string().min(1),
    run_id: z.string().optional(),
    type: WorkerJobType,
    payload: z.record(z.unknown()).optional(),
    idempotency_key: z.string().min(1),
    checkpoint: z.record(z.unknown()).optional(),
  })
  .strict();
export type WorkerJobRequest = z.infer<typeof WorkerJobRequestSchema>;

export const WorkerJobResponseSchema = z
  .object({
    schema_version: SchemaVersionV1,
    job_id: z.string().min(1),
    status: z.enum(["queued", "running"]),
    accepted: z.boolean(),
    duplicate: z.boolean().optional(),
    accepted_at: z.string().optional(),
  })
  .strict();
export type WorkerJobResponse = z.infer<typeof WorkerJobResponseSchema>;

export const WorkerJobStatusSchema = z
  .object({
    schema_version: SchemaVersionV1,
    job_id: z.string().min(1),
    task_id: z.string().min(1),
    type: WorkerJobType,
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
    progress: z
      .object({
        percent: z.number().int().min(0).max(100).optional(),
        stage: z.string().optional(),
      })
      .strict()
      .optional(),
    checkpoint: z.record(z.unknown()).optional(),
    error: z.record(z.unknown()).optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type WorkerJobStatus = z.infer<typeof WorkerJobStatusSchema>;

export const WorkerCancelResponseSchema = z
  .object({
    schema_version: SchemaVersionV1,
    job_id: z.string().min(1),
    status: z.enum(["cancelling", "cancelled"]),
    previous_status: z.enum(["queued", "running"]).optional(),
    requested_at: z.string().optional(),
  })
  .strict();
export type WorkerCancelResponse = z.infer<typeof WorkerCancelResponseSchema>;

export const WorkerEventType = z.enum([
  "job.accepted",
  "job.started",
  "job.progress",
  "job.checkpoint",
  "job.completed",
  "job.failed",
  "job.cancelled",
]);

export const WorkerEventSchema = z
  .object({
    schema_version: SchemaVersionV1,
    event_id: z.string().min(1),
    seq: z.number().int().min(1),
    job_id: z.string().min(1),
    run_id: z.string().optional(),
    task_id: z.string().optional(),
    timestamp: z.string(),
    type: WorkerEventType,
    payload: z.record(z.unknown()).optional(),
    error: z.record(z.unknown()).optional(),
  })
  .strict();
export type WorkerEvent = z.infer<typeof WorkerEventSchema>;

export const WorkerErrorBlockSchema = z
  .object({
    code: WorkerErrorCode,
    user_message: z.string().min(1),
    developer_detail: z.string(),
    retryable: z.boolean(),
    correlation_id: z.string().min(1),
    cause: z.string().optional(),
  })
  .strict();
export type WorkerErrorBlock = z.infer<typeof WorkerErrorBlockSchema>;

export const WorkerErrorEnvelopeSchema = z
  .object({
    schema_version: SchemaVersionV1,
    error: WorkerErrorBlockSchema,
  })
  .strict();
export type WorkerErrorEnvelope = z.infer<typeof WorkerErrorEnvelopeSchema>;
