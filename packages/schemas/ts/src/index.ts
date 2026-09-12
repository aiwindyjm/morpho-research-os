import type { z } from "zod";
import { FixtureEnvelopeSchema } from "./envelope";
import { EventSchema } from "./event";
import {
  ArtifactSchema,
  ClaimSchema,
  EvidenceSchema,
  KnowledgeNodeSchema,
  RelationSchema,
  SourceContentSchema,
  SourceSchema,
} from "./knowledge";
import { ProviderConfigSchema, UsageRecordSchema } from "./provider";
import { PromptMetadataSchema } from "./prompt";
import {
  ProjectSchema,
  ResearchConfigSchema,
  ResearchPlanSchema,
  ResearchRunSchema,
  ResearchSectionSchema,
  ResearchTaskSchema,
  TaskDependencySchema,
} from "./project";
import {
  WorkerCancelResponseSchema,
  WorkerErrorEnvelopeSchema,
  WorkerEventSchema,
  WorkerHealthResponseSchema,
  WorkerJobRequestSchema,
  WorkerJobResponseSchema,
  WorkerJobStatusSchema,
  WorkerVersionResponseSchema,
} from "./worker";

export * from "./envelope";
export * from "./event";
export * from "./knowledge";
export * from "./project";
export * from "./prompt";
export * from "./provider";
export * from "./schema-version";
export * from "./worker";

/**
 * Registry mapping canonical schema names (file stem without `.v<major>.json`)
 * to their Zod bindings. Every schema file under packages/schemas must appear
 * here; the corpus test enforces it.
 */
export const BINDINGS: Record<string, z.ZodTypeAny> = {
    "fixture-envelope": FixtureEnvelopeSchema,
    artifact: ArtifactSchema,
    claim: ClaimSchema,
    evidence: EvidenceSchema,
    event: EventSchema,
    "knowledge-node": KnowledgeNodeSchema,
    project: ProjectSchema,
    "prompt-metadata": PromptMetadataSchema,
    "provider-config": ProviderConfigSchema,
    relation: RelationSchema,
    "research-config": ResearchConfigSchema,
  "research-plan": ResearchPlanSchema,
  "research-run": ResearchRunSchema,
  "research-section": ResearchSectionSchema,
    "research-task": ResearchTaskSchema,
    source: SourceSchema,
    "source-content": SourceContentSchema,
    "task-dependency": TaskDependencySchema,
    "usage-record": UsageRecordSchema,
    "worker-cancel-response": WorkerCancelResponseSchema,
  "worker-error": WorkerErrorEnvelopeSchema,
  "worker-event": WorkerEventSchema,
  "worker-health": WorkerHealthResponseSchema,
  "worker-job-request": WorkerJobRequestSchema,
  "worker-job-response": WorkerJobResponseSchema,
  "worker-job-status": WorkerJobStatusSchema,
  "worker-version": WorkerVersionResponseSchema,
};
