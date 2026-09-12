import { z } from "zod";
import { SchemaVersionV1 } from "./schema-version";

/** Provider configuration and usage accounting are closed configuration records. */
export const ProviderKind = z.enum(["llm", "search", "embedding"]);

export const ProviderRetrySchema = z
  .object({
    max_attempts: z.number().int().min(1).max(10),
    backoff_ms: z.number().int().min(0),
  })
  .strict();
export type ProviderRetry = z.infer<typeof ProviderRetrySchema>;

export const ProviderConfigSchema = z
  .object({
    schema_version: SchemaVersionV1,
    provider_id: z.string().min(1),
    kind: ProviderKind,
    base_url: z.string().min(1),
    key_reference: z.string().optional(),
    model: z.string().min(1),
    timeout_ms: z.number().int().min(100),
    retry: ProviderRetrySchema,
    extra_headers: z.record(z.string()).optional(),
  })
  .strict();
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const EstimatedCostSchema = z
  .object({
    amount: z.number().min(0),
    currency: z.enum(["USD"]),
  })
  .strict();
export type EstimatedCost = z.infer<typeof EstimatedCostSchema>;

export const UsageRecordSchema = z
  .object({
    schema_version: SchemaVersionV1,
    usage_id: z.string().min(1),
    task_id: z.string().min(1),
    run_id: z.string().optional(),
    provider_id: z.string().min(1),
    kind: ProviderKind.optional(),
    model: z.string().min(1),
    input_tokens: z.number().int().min(0),
    output_tokens: z.number().int().min(0),
    duration_ms: z.number().int().min(0),
    estimated_cost_usd: EstimatedCostSchema.optional(),
    cache_hit: z.boolean().optional(),
    retries: z.number().int().min(0).optional(),
    created_at: z.string(),
  })
  .strict();
export type UsageRecord = z.infer<typeof UsageRecordSchema>;
