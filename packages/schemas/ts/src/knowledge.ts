import { z } from "zod";
import { SchemaVersionV1 } from "./schema-version";

/**
 * Knowledge-layer domain records (open records: additive fields from newer
 * minors are ignored). The chain is strict: Source → Evidence → Claim →
 * Knowledge; claims and evidence are never folded into node summaries.
 */
export const SourceKind = z.enum(["web", "paper", "book", "github", "dataset", "news", "other"]);

export const QualityRating = z.enum(["high", "medium", "low", "unevaluated"]);

export const SourceQualitySchema = z
  .object({
    authority: QualityRating.optional(),
    fitness: QualityRating.optional(),
    evaluated_at: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type SourceQuality = z.infer<typeof SourceQualitySchema>;

export const SourceSchema = z.object({
  schema_version: SchemaVersionV1,
  source_id: z.string().min(1),
  project_id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  kind: SourceKind,
  published_at: z.string().optional(),
  retrieved_at: z.string(),
  languages: z.array(z.string().min(2)).optional(),
  dedup_key: z.string().min(1),
  quality: SourceQualitySchema.optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const ContentFormat = z.enum(["html", "pdf", "markdown", "plain", "json"]);

export const SourceContentSchema = z.object({
  schema_version: SchemaVersionV1,
  content_id: z.string().min(1),
  source_id: z.string().min(1),
  format: ContentFormat,
  content_hash: z.string().min(8),
  language: z.string().optional(),
  fetched_at: z.string(),
  cache_ref: z.string().optional(),
});
export type SourceContent = z.infer<typeof SourceContentSchema>;

export const KnowledgeNodeType = z.enum([
  "concept",
  "person",
  "organization",
  "company",
  "paper",
  "book",
  "experiment",
  "event",
  "technology",
  "product",
  "application",
  "policy",
  "dataset",
  "controversy",
]);

export const NodeStatus = z.enum(["active", "merged", "superseded"]);

export const Confidence = z.enum([
  "confirmed",
  "high",
  "medium",
  "low",
  "unverified",
  "conflicting",
]);

export const KnowledgeNodeSchema = z.object({
  schema_version: SchemaVersionV1,
  node_id: z.string().min(1),
  project_id: z.string().min(1),
  type: KnowledgeNodeType,
  title: z.string().min(1),
  aliases: z.array(z.string().min(1)).optional(),
  summary: z.string().optional(),
  status: NodeStatus.optional(),
  confidence: Confidence,
  source_ids: z.array(z.string().min(1)).optional(),
  claim_ids: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;

export const ClaimProvenanceSchema = z
  .object({
    created_by: z.enum(["user", "ai"]).optional(),
    prompt_id: z.string().optional(),
    prompt_version: z.string().optional(),
    task_id: z.string().optional(),
  })
  .strict();
export type ClaimProvenance = z.infer<typeof ClaimProvenanceSchema>;

export const ReviewState = z.enum(["unreviewed", "needs-review", "reviewed"]);

/**
 * Released minors of the claim contract (ADR-016): 1.1 splits the formerly
 * conflated `status` into `status` (review lifecycle) + `confidence`.
 */
export const ClaimSchemaVersion = z.enum(["1.0", "1.1"]);
export type ClaimSchemaVersion = z.infer<typeof ClaimSchemaVersion>;

/** Review lifecycle of a claim (ADR-016); evidence strength lives in `confidence`. */
export const ClaimStatus = z.enum(["draft", "needs_review", "confirmed", "superseded"]);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const ClaimSchema = z.object({
  schema_version: ClaimSchemaVersion,
  claim_id: z.string().min(1),
  project_id: z.string().min(1),
  subject_node_id: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  scope: z.string().optional(),
  status: ClaimStatus,
  confidence: Confidence.default("unverified"),
  evidence_ids: z.array(z.string().min(1)).optional(),
  provenance: ClaimProvenanceSchema.optional(),
  review_state: ReviewState.optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const EvidenceDirection = z.enum(["support", "contradict"]);

export const EvidenceLocatorSchema = z
  .object({
    quote: z.string().optional(),
    page: z.string().optional(),
    section: z.string().optional(),
    fragment: z.string().optional(),
  })
  .strict();
export type EvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;

export const EvidenceSchema = z.object({
  schema_version: SchemaVersionV1,
  evidence_id: z.string().min(1),
  claim_id: z.string().min(1),
  source_id: z.string().min(1),
  direction: EvidenceDirection,
  locator: EvidenceLocatorSchema,
  extraction_method: z.enum(["ai", "user"]).optional(),
  retrieved_at: z.string(),
  revised_at: z.string().optional(),
  superseded_by: z.string().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const RelationConfidence = z.enum(["confirmed", "high", "medium", "low", "unverified"]);

export const RelationSchema = z.object({
  schema_version: SchemaVersionV1,
  relation_id: z.string().min(1),
  from_node_id: z.string().min(1),
  to_node_id: z.string().min(1),
  predicate: z.string().min(1),
  direction: z.enum(["directed", "undirected"]).optional(),
  confidence: RelationConfidence,
  status: NodeStatus.optional(),
  source_ids: z.array(z.string().min(1)).optional(),
  claim_ids: z.array(z.string().min(1)).optional(),
  provenance: ClaimProvenanceSchema.optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type Relation = z.infer<typeof RelationSchema>;

export const ArtifactKind = z.enum([
  "vault-export",
  "report",
  "graph-snapshot",
  "coverage-report",
  "other",
]);

export const ArtifactSchema = z.object({
  schema_version: SchemaVersionV1,
  artifact_id: z.string().min(1),
  project_id: z.string().min(1),
  kind: ArtifactKind,
  run_id: z.string().optional(),
  path: z.string().optional(),
  format: z.enum(["markdown", "json", "png", "svg"]).optional(),
  note: z.string().optional(),
  created_at: z.string(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
