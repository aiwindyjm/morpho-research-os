import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import canonicalConfigSchema from "../../../../../packages/schemas/research-config.v1.json";
import {
  claimSchema,
  evidenceSchema,
  knowledgeNodeSchema,
  projectSchema,
  relationSchema,
  researchConfigSchema,
  researchPlanSchema,
  researchRunSchema,
  researchTaskSchema,
  sourceSchema,
  uuidV7Schema,
} from "@/types/schemas";
import { configA } from "./fixtures-a";
import {
  claimsA,
  evidenceA,
  nodesA,
  planA,
  projectA,
  relationsA,
  sourcesA,
} from "./fixtures-a";
import {
  claimsB,
  configB,
  evidenceB,
  nodesB,
  planB,
  projectB,
  relationsB,
  runB,
  sourcesB,
  tasksB,
} from "./fixtures-b";

/**
 * Fixtures must never drift from the documented contracts
 * (docs/PRD.md §6, docs/DATA_MODEL.md, docs/data/*.md, and the canonical
 * packages/schemas/research-config.v1.json).
 */

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validateCanonical = ajv.compile(canonicalConfigSchema);

describe("fixture config vs canonical JSON Schema", () => {
  it("project A and B configs validate against research-config.v1.json", () => {
    expect(validateCanonical(configA)).toBeTruthy();
    expect(validateCanonical(configB)).toBeTruthy();
    expect(validateCanonical.errors).toBeNull();
  });

  it("configs also pass the zod mirror (required subset + PRD fields)", () => {
    expect(researchConfigSchema.safeParse(configA).success).toBe(true);
    expect(researchConfigSchema.safeParse(configB).success).toBe(true);
  });
});

describe("fixture entity schemas", () => {
  it("projects, plans, and runs match the documented shapes", () => {
    expect(projectSchema.safeParse(projectA).success).toBe(true);
    expect(projectSchema.safeParse(projectB).success).toBe(true);
    expect(researchPlanSchema.safeParse(planA).success).toBe(true);
    expect(researchPlanSchema.safeParse(planB).success).toBe(true);
    expect(researchRunSchema.safeParse(runB).success).toBe(true);
  });

  it("project B tasks match the documented state machine vocabulary", () => {
    for (const task of tasksB) {
      const result = researchTaskSchema.safeParse(task);
      expect(result.success, `task ${task.title}: ${result.error?.message}`).toBe(
        true,
      );
    }
  });

  it("sources carry quality metadata and documented status vocabulary", () => {
    for (const source of [...sourcesA, ...sourcesB]) {
      expect(sourceSchema.safeParse(source).success, source.title).toBe(true);
    }
  });

  it("knowledge nodes use the documented type vocabulary", () => {
    for (const node of [...nodesA, ...nodesB]) {
      expect(knowledgeNodeSchema.safeParse(node).success, node.title).toBe(true);
    }
  });

  it("claims and evidence keep provenance links", () => {
    for (const claim of [...claimsA, ...claimsB]) {
      expect(claimSchema.safeParse(claim).success, claim.predicate).toBe(true);
    }
    for (const evidence of [...evidenceA, ...evidenceB]) {
      expect(evidenceSchema.safeParse(evidence).success, evidence.id).toBe(true);
    }
  });

  it("relations connect typed nodes", () => {
    for (const relation of [...relationsA, ...relationsB]) {
      expect(relationSchema.safeParse(relation).success).toBe(true);
    }
  });
});

describe("fixture referential integrity", () => {
  it("every evidence, claim, and relation endpoint resolves inside its project", () => {
    for (const [claims, evidence, nodes, sources, relations] of [
      [claimsA, evidenceA, nodesA, sourcesA, relationsA],
      [claimsB, evidenceB, nodesB, sourcesB, relationsB],
    ] as const) {
      const nodeIds = new Set(nodes.map((n) => n.id));
      const sourceIds = new Set(sources.map((s) => s.id));
      const claimIds = new Set(claims.map((c) => c.id));

      for (const claim of claims) {
        expect(nodeIds.has(claim.subject_node_id), claim.id).toBe(true);
        for (const sourceId of claim.source_ids) {
          expect(sourceIds.has(sourceId), claim.id).toBe(true);
        }
      }
      for (const item of evidence) {
        expect(claimIds.has(item.claim_id), item.id).toBe(true);
        expect(sourceIds.has(item.source_id), item.id).toBe(true);
      }
      for (const relation of relations) {
        expect(nodeIds.has(relation.subject_id), relation.id).toBe(true);
        expect(nodeIds.has(relation.object_id), relation.id).toBe(true);
      }
    }
  });

  it("conflicting claims coexist with support and contradict evidence", () => {
    const conflicting = claimsB.find((c) => c.status === "conflicting");
    expect(conflicting).toBeDefined();
    const related = evidenceB.filter((e) => e.claim_id === conflicting?.id);
    expect(related.some((e) => e.direction === "support")).toBe(true);
    expect(related.some((e) => e.direction === "contradict")).toBe(true);
  });

  it("all fixture ids are UUIDv7-shaped", () => {
    const ids = [
      projectA.id,
      projectB.id,
      planA.id,
      planB.id,
      runB.id,
      ...tasksB.map((t) => t.id),
      ...sourcesB.map((s) => s.id),
      ...nodesB.map((n) => n.id),
      ...claimsB.map((c) => c.id),
      ...evidenceB.map((e) => e.id),
      ...relationsB.map((r) => r.id),
    ];
    for (const id of ids) {
      const result = uuidV7Schema.safeParse(id);
      expect(result.success, `fixture id should be UUIDv7-shaped: ${id}`).toBe(
        true,
      );
    }
  });
});
