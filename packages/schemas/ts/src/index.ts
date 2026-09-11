import type { z } from "zod";
import { FixtureEnvelopeSchema } from "./envelope";
import {
  ProjectSchema,
  ResearchConfigSchema,
  ResearchPlanSchema,
  ResearchRunSchema,
  ResearchSectionSchema,
  ResearchTaskSchema,
  TaskDependencySchema,
} from "./project";

export * from "./envelope";
export * from "./project";
export * from "./schema-version";

/**
 * Registry mapping canonical schema names (file stem without `.v<major>.json`)
 * to their Zod bindings. Every schema file under packages/schemas must appear
 * here; the corpus test enforces it.
 */
export const BINDINGS: Record<string, z.ZodTypeAny> = {
  "fixture-envelope": FixtureEnvelopeSchema,
  project: ProjectSchema,
  "research-config": ResearchConfigSchema,
  "research-plan": ResearchPlanSchema,
  "research-run": ResearchRunSchema,
  "research-section": ResearchSectionSchema,
  "research-task": ResearchTaskSchema,
  "task-dependency": TaskDependencySchema,
};
