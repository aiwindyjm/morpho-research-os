import { z } from "zod";
import { SchemaVersionV1 } from "./schema-version";

/**
 * Offline fixture envelope (unified, ADR-017). One closed envelope covers the
 * two historical variants; a fixture uses exactly one variant marker
 * (`schema_version` + `contract` or `fixture_envelope_version` + `kind`).
 * Variant-specific required fields and payload-contract resolution are
 * enforced by the offline validators (scripts/validate-fixture.py,
 * scripts/check-contracts.ps1, tests/fixtures-support loaders).
 */
export const FixtureProvenanceKind = z.enum(["synthetic", "public-domain", "licensed-excerpt"]);
export const FixtureOrigin = z.enum(["synthetic", "curated-public", "user-contributed"]);

export const FixtureContractSchema = z
  .object({
    schema: z.string().min(3),
    schema_version: z.string(),
  })
  .strict();
export type FixtureContract = z.infer<typeof FixtureContractSchema>;

export const FixturePromptSchema = z
  .object({
    prompt_id: z.string().min(3),
    prompt_version: z.string().min(1),
  })
  .strict();
export type FixturePrompt = z.infer<typeof FixturePromptSchema>;

export const FixtureExpectedOutputSchema = z
  .object({
    name: z.string().min(1),
    schema: z.string().min(1),
    payload: z.record(z.unknown()),
  })
  .strict();
export type FixtureExpectedOutput = z.infer<typeof FixtureExpectedOutputSchema>;

export const FixtureProvenanceSchema = z
  .object({
    kind: FixtureProvenanceKind.optional(),
    origin: FixtureOrigin.optional(),
    synthetic: z.boolean().optional(),
    license: z.string().optional(),
    notes: z.string().optional(),
    source_url: z.string().optional(),
  })
  .strict();
export type FixtureProvenance = z.infer<typeof FixtureProvenanceSchema>;

export const FixtureStabilitySchema = z
  .object({
    stable_fields: z.array(z.string()).min(1).optional(),
    volatile_fields: z.array(z.string()).optional(),
    deterministic: z.boolean().optional(),
    ignored_fields: z.array(z.string()).optional(),
  })
  .strict();
export type FixtureStability = z.infer<typeof FixtureStabilitySchema>;

export const FixtureEnvelopeSchema = z
  .object({
    schema_version: SchemaVersionV1.optional(),
    fixture_envelope_version: SchemaVersionV1.optional(),
    fixture_id: z.string().min(3),
    description: z.string().min(1).optional(),
    contract: FixtureContractSchema.optional(),
    kind: z.string().min(1).optional(),
    prompt: FixturePromptSchema.optional(),
    input: z.record(z.unknown()),
    expected: z.record(z.unknown()).optional(),
    expected_outputs: z.array(FixtureExpectedOutputSchema).optional(),
    provenance: FixtureProvenanceSchema,
    stability: FixtureStabilitySchema.optional(),
  })
  .strict();
export type FixtureEnvelope = z.infer<typeof FixtureEnvelopeSchema>;
