import { z } from "zod";
import { SchemaVersionV1 } from "./schema-version";

/**
 * Domain research events (PRD §6 "Event"): ordered, append-only, reconnectable
 * projections of research activity. CLOSED envelope (unknown fields are
 * rejected in every stack) with a permissive, already-redacted payload.
 * Payloads must never contain secrets or raw provider prompts/responses.
 */
export const EventType = z.enum([
  "task.created",
  "task.started",
  "task.progress",
  "task.checkpoint",
  "task.completed",
  "task.failed",
  "task.skipped",
  "run.started",
  "run.paused",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.incremental_report",
  "plan.drafted",
  "plan.approved",
  "plan.rejected",
  "plan.superseded",
  "source.discovered",
  "source.fetched",
  "source.evaluated",
  "claim.created",
  "claim.updated",
  "claim.superseded",
  "review.requested",
  "review.resolved",
]);
export type EventType = z.infer<typeof EventType>;

export const EventSchema = z
  .object({
    schema_version: SchemaVersionV1,
    event_id: z.string().min(1),
    sequence: z.number().int().min(1),
    occurred_at: z.string(),
    run_id: z.string().min(1).nullable().optional(),
    task_id: z.string().min(1).optional(),
    project_id: z.string().min(1),
    type: EventType,
    summary: z.string().optional(),
    payload: z.record(z.unknown()),
  })
  .strict();
export type Event = z.infer<typeof EventSchema>;
