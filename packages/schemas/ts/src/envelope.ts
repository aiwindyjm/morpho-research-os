import { z } from "zod";
import { SchemaVersionV1 } from "./schema-version";

export const FixtureProvenanceKind = z.enum(["synthetic", "public-domain", "licensed-excerpt"]);

export const FixtureEnvelopeSchema = z.object({
  schema_version: SchemaVersionV1,
  fixture_id: z.string().min(3),
  description: z.string().min(1),
  contract: z
    .object({
      schema: z.string().min(3),
      schema_version: z.string(),
    })
    .strict(),
  prompt: z
    .object({
      prompt_id: z.string().min(3),
      prompt_version: z.string().min(1),
    })
    .strict()
    .optional(),
  provenance: z
    .object({
      kind: FixtureProvenanceKind,
      notes: z.string().optional(),
      source_url: z.string().optional(),
    })
    .strict(),
  input: z.record(z.unknown()),
  expected: z.record(z.unknown()).optional(),
  stability: z
    .object({
      stable_fields: z.array(z.string()).min(1),
      volatile_fields: z.array(z.string()),
    })
    .strict(),
});
export type FixtureEnvelope = z.infer<typeof FixtureEnvelopeSchema>;
