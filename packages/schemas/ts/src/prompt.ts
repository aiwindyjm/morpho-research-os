import { z } from "zod";
import { SchemaVersionV1 } from "./schema-version";

/** Prompt metadata is a closed record: unknown fields are rejected in every stack. */
export const PromptStage = z.enum([
  "planner",
  "search",
  "extraction",
  "entity",
  "relation",
  "validation",
  "writing",
  "synthesis",
]);

export const ModelCapability = z.enum(["strong", "medium", "cheap"]);

const SchemaRefSchema = z
  .object({
    schema: z.string().min(3),
    schema_version: z.string().min(1),
  })
  .strict();
export type SchemaRef = z.infer<typeof SchemaRefSchema>;

export const GoldenCaseSchema = z
  .object({
    case_id: z.string().min(3),
    fixture_ref: z.string().min(3),
  })
  .strict();
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

export const PromptMetadataSchema = z
  .object({
    schema_version: SchemaVersionV1,
    prompt_id: z.string().min(5),
    version: z.string().min(5),
    stage: PromptStage,
    purpose: z.string().min(1),
    input_schema: SchemaRefSchema,
    output_schema: SchemaRefSchema,
    model_hint: z
      .object({
        capability: ModelCapability,
      })
      .strict()
      .optional(),
    safety: z.array(z.string().min(1)).optional(),
    golden_cases: z.array(GoldenCaseSchema).min(1),
  })
  .strict();
export type PromptMetadata = z.infer<typeof PromptMetadataSchema>;
