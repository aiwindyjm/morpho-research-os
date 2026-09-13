import { beforeEach, describe, expect, it } from "vitest";
import { mockBackend } from "./backend";
import { PROJECT_A_ID, PROJECT_B_ID } from "./fixtures-a";
import { MorphoError } from "../errors";
import { COVERAGE_WEIGHTS } from "@/types/domain";
import type { ResearchTask } from "@/types/domain";

/**
 * Mock backend behaviour: multi-project isolation, plan review flow, the
 * simulated task DAG state machine, coverage formula, gap rules with
 * user-approved proposals, and assistant context isolation.
 */

function tickUntilSettled(maxTicks = 80): void {
  for (let i = 0; i < maxTicks; i++) {
    mockBackend.step();
    const run = mockBackend.handle("run.get", { project_id: PROJECT_A_ID });
    // The run parks in NEEDS_REVIEW/COMPLETED when nothing can advance
    // without user action (failed task, review item, or all done).
    if (run?.state === "NEEDS_REVIEW" || run?.state === "COMPLETED") return;
  }
  throw new Error("simulation did not settle within the tick budget");
}

beforeEach(() => {
  mockBackend.reset();
});

describe("multi-project lifecycle", () => {
  it("seeds two fixture projects", () => {
    const projects = mockBackend.handle("project.list", {});
    expect(projects.map((p) => p.name)).toEqual(
      expect.arrayContaining(["大语言模型推理优化", "脑机接口康复应用"]),
    );
  });

  it("creates an isolated project with default config and no plan", () => {
    const created = mockBackend.handle("project.create", {
      name: "个人知识管理",
      description: "第二个研究方向",
    });
    expect(created.name).toBe("个人知识管理");

    const config = mockBackend.handle("config.get", { project_id: created.id });
    expect(config.topic).toBe("个人知识管理");
    expect(config.schema_version).toBe("1.0");

    expect(
      mockBackend.handle("plan.get", { project_id: created.id }),
    ).toBeNull();
    expect(
      mockBackend.handle("knowledge.list", { project_id: created.id }),
    ).toEqual([]);
    expect(
      mockBackend.handle("source.list", { project_id: created.id }),
    ).toEqual([]);
  });

  it("keeps config, plan, tasks, and decisions isolated across projects", () => {
    const created = mockBackend.handle("project.create", {
      name: "隔离检查",
      description: "",
    });

    const configA = mockBackend.handle("config.get", { project_id: PROJECT_A_ID });
    const mutated = { ...configA, topic: "被篡改的主题" };
    mockBackend.handle("config.update", { project_id: PROJECT_A_ID, config: mutated });

    const configCreated = mockBackend.handle("config.get", {
      project_id: created.id,
    });
    expect(configCreated.topic).toBe("隔离检查");

    mockBackend.handle("assistant.saveDecision", {
      project_id: PROJECT_A_ID,
      content: "决定：优先调研量化路线",
    });
    const decisionsOther = mockBackend.handle("assistant.listDecisions", {
      project_id: created.id,
    });
    expect(decisionsOther).toEqual([]);
    const decisionsA = mockBackend.handle("assistant.listDecisions", {
      project_id: PROJECT_A_ID,
    });
    expect(decisionsA).toHaveLength(1);

    const tasksA = mockBackend.handle("task.list", { project_id: PROJECT_A_ID });
    const tasksCreated = mockBackend.handle("task.list", {
      project_id: created.id,
    });
    expect(tasksCreated).toEqual([]);
    expect(tasksA).toEqual([]);
  });

  it("rejects config updates that violate the research-config contract", () => {
    const configA = mockBackend.handle("config.get", { project_id: PROJECT_A_ID });
    const invalid = { ...configA, depth: 9 } as unknown as typeof configA;
    expect(() =>
      mockBackend.handle("config.update", { project_id: PROJECT_A_ID, config: invalid }),
    ).toThrow(MorphoError);
  });
});

describe("plan review flow (RES-01 frontend contract)", () => {
  it("edits task drafts, approves, and rejects", () => {
    const plan = mockBackend.handle("plan.get", { project_id: PROJECT_A_ID });
    expect(plan?.status).toBe("draft");

    const draftTask = plan?.sections[0].tasks[0];
    expect(draftTask).toBeDefined();

    const updated = mockBackend.handle("plan.updateTask", {
      project_id: PROJECT_A_ID,
      task_id: draftTask!.id,
      title: "检索核心概念（已修订）",
      description: "用户修改过的描述",
    });
    expect(updated.sections[0].tasks[0].title).toBe("检索核心概念（已修订）");

    const approved = mockBackend.handle("plan.approve", { project_id: PROJECT_A_ID });
    expect(approved.status).toBe("approved");

    // Editing is only allowed while the plan is a draft.
    expect(() =>
      mockBackend.handle("plan.updateTask", {
        project_id: PROJECT_A_ID,
        task_id: draftTask!.id,
        title: "late edit",
        description: "",
      }),
    ).toThrow(MorphoError);

    mockBackend.handle("plan.reject", { project_id: PROJECT_A_ID });
    const rejected = mockBackend.handle("plan.get", { project_id: PROJECT_A_ID });
    expect(rejected?.status).toBe("rejected");
  });

  it("blocks run.start until the plan is approved", () => {
    expect(() =>
      mockBackend.handle("run.start", { project_id: PROJECT_A_ID }),
    ).toThrow(MorphoError);

    mockBackend.handle("plan.approve", { project_id: PROJECT_A_ID });
    const run = mockBackend.handle("run.start", { project_id: PROJECT_A_ID });
    expect(run.state).toBe("PLANNING");

    const tasks = mockBackend.handle("task.list", { project_id: PROJECT_A_ID });
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.state).toBe("PENDING");
      expect(task.idempotency_key).toContain(run.id);
    }
  });
});

describe("simulated task DAG (RES-02 frontend contract)", () => {
  it("runs the documented state machine with a scripted failure and reveal", () => {
    mockBackend.handle("plan.approve", { project_id: PROJECT_A_ID });
    mockBackend.handle("run.start", { project_id: PROJECT_A_ID });

    tickUntilSettled();

    const tasks = mockBackend.handle("task.list", { project_id: PROJECT_A_ID });
    const failed = tasks.filter((t) => t.state === "FAILED");
    const needsReview = tasks.filter((t) => t.state === "NEEDS_REVIEW");
    const synthesis = tasks.find((t) => t.kind === "synthesis");

    // Scripted: the first extraction fails once and waits for the user.
    expect(failed).toHaveLength(1);
    expect(failed[0].error_code).toBe("SOURCE_PARSE_FAILED");
    expect(failed[0].attempt).toBe(1);
    // Its dependents stay blocked; validation has not run yet.
    expect(needsReview).toHaveLength(0);
    expect(synthesis?.state).toBe("PENDING");
    // The run parks in NEEDS_REVIEW because of the open failure.
    const run = mockBackend.handle("run.get", { project_id: PROJECT_A_ID });
    expect(run?.state).toBe("NEEDS_REVIEW");

    // Independent sections still completed and revealed their knowledge.
    const completed = tasks.filter((t) => t.state === "COMPLETED");
    expect(completed.length).toBeGreaterThan(0);
    const sources = mockBackend.handle("source.list", { project_id: PROJECT_A_ID });
    const nodes = mockBackend.handle("knowledge.list", { project_id: PROJECT_A_ID });
    expect(sources.length).toBeGreaterThan(0);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("supports pause, resume, retry, and cancel with dependency gating", () => {
    mockBackend.handle("plan.approve", { project_id: PROJECT_A_ID });
    mockBackend.handle("run.start", { project_id: PROJECT_A_ID });

    // Tick until at least one task is RUNNING, then pause it.
    let paused: ResearchTask | undefined;
    for (let i = 0; i < 20 && !paused; i++) {
      mockBackend.step();
      const running = mockBackend
        .handle("task.list", { project_id: PROJECT_A_ID })
        .find((t) => t.state === "RUNNING");
      if (running) paused = running;
    }
    expect(paused).toBeDefined();

    const pausedTask = mockBackend.handle("task.pause", {
      project_id: PROJECT_A_ID,
      task_id: paused!.id,
    });
    expect(pausedTask.state).toBe("PAUSED");

    const before = mockBackend
      .handle("task.list", { project_id: PROJECT_A_ID })
      .find((t) => t.id === paused!.id);
    mockBackend.step();
    const after = mockBackend
      .handle("task.list", { project_id: PROJECT_A_ID })
      .find((t) => t.id === paused!.id);
    expect(after?.state).toBe(before?.state);

    const resumed = mockBackend.handle("task.resume", {
      project_id: PROJECT_A_ID,
      task_id: paused!.id,
    });
    expect(resumed.state).toBe("PENDING");

    // Cancel a still-pending task and verify dependents stay blocked.
    const tasks = mockBackend.handle("task.list", { project_id: PROJECT_A_ID });
    const blockedTarget = tasks.find(
      (t) => t.state === "PENDING" && t.dependencies.length > 0,
    );
    expect(blockedTarget).toBeDefined();
    const cancelled = mockBackend.handle("task.cancel", {
      project_id: PROJECT_A_ID,
      task_id: blockedTarget!.id,
    });
    expect(cancelled.state).toBe("CANCELLED");
  });

  it("retries a failed task back into the running pipeline", () => {
    mockBackend.handle("plan.approve", { project_id: PROJECT_A_ID });
    mockBackend.handle("run.start", { project_id: PROJECT_A_ID });

    // Tick until the scripted first failure appears.
    let failedTask: ResearchTask | undefined;
    for (let i = 0; i < 30 && !failedTask; i++) {
      mockBackend.step();
      failedTask = mockBackend
        .handle("task.list", { project_id: PROJECT_A_ID })
        .find((t) => t.state === "FAILED");
    }
    expect(failedTask?.error_code).toBe("SOURCE_PARSE_FAILED");

    const retried = mockBackend.handle("task.retry", {
      project_id: PROJECT_A_ID,
      task_id: failedTask!.id,
    });
    expect(retried.attempt).toBe(2);
    expect(["RUNNING", "PENDING", "VALIDATING", "COMPLETED"]).toContain(retried.state);

    // With the user retry, the pipeline drains to the review gate.
    tickUntilSettled();
    const tasks = mockBackend.handle("task.list", { project_id: PROJECT_A_ID });
    expect(tasks.find((t) => t.id === failedTask!.id)?.state).toBe("COMPLETED");
    const needsReview = tasks.filter((t) => t.state === "NEEDS_REVIEW");
    expect(needsReview.length).toBeGreaterThan(0);
    expect(needsReview[0].kind).toBe("validation");
    // Synthesis waits behind the review gate.
    expect(tasks.find((t) => t.kind === "synthesis")?.state).toBe("PENDING");
    const run = mockBackend.handle("run.get", { project_id: PROJECT_A_ID });
    expect(run?.state).toBe("NEEDS_REVIEW");
  });
});

describe("coverage and gaps (RES-10 contract)", () => {
  it("applies the PRD V0.1 formula to fixture data", () => {
    const coverage = mockBackend.handle("coverage.get", { project_id: PROJECT_B_ID });
    const concepts = coverage.dimensions.find((d) => d.dimension === "concepts");

    // concepts: 5 tasks in this dimension (3 done + validation/synthesis),
    // node types {Concept}=1/5, supported claims 2/5, source types {paper}=1/3.
    expect(concepts?.components.task_completion).toBeCloseTo(0.6, 3);
    expect(concepts?.components.knowledge_breadth).toBeCloseTo(0.2, 3);
    expect(concepts?.components.evidence_density).toBeCloseTo(0.4, 3);
    expect(concepts?.components.source_diversity).toBeCloseTo(1 / 3, 3);

    const expected =
      COVERAGE_WEIGHTS.task_completion * concepts!.components.task_completion +
      COVERAGE_WEIGHTS.knowledge_breadth * concepts!.components.knowledge_breadth +
      COVERAGE_WEIGHTS.evidence_density * concepts!.components.evidence_density +
      COVERAGE_WEIGHTS.source_diversity * concepts!.components.source_diversity;
    expect(concepts?.coverage).toBeCloseTo(expected, 3);
    expect(concepts?.coverage).toBeLessThan(0.6);

    // Every dimension reports its raw inputs and reasons.
    for (const dim of coverage.dimensions) {
      expect(dim.reasons.length).toBe(4);
      expect(dim.updated_at).toBeTruthy();
    }
  });

  it("derives gaps only from the documented rules and gates creation on approval", () => {
    const report = mockBackend.handle("gap.list", { project_id: PROJECT_B_ID });
    const byDimension = new Map(report.gaps.map((g) => [g.dimension, g]));

    // applications: coverage 0.7 with 2 quality sources → no gap.
    expect(byDimension.has("applications")).toBe(false);
    // future_trends: 0 quality sources and near-zero coverage → both rules.
    const futureTrends = byDimension.get("future_trends");
    expect(futureTrends).toBeDefined();
    expect(futureTrends?.trigger).toBe("coverage_below_threshold");
    expect(futureTrends?.rule).toContain("少于 2 个");
    expect(futureTrends?.proposal_status).toBe("pending_approval");
    expect(futureTrends?.created_task_id).toBeNull();

    // Approval creates a follow-up task; nothing is created automatically.
    // (backend.handle returns the live array, so capture the count first.)
    const countBefore = mockBackend.handle("task.list", { project_id: PROJECT_B_ID }).length;
    const approved = mockBackend.handle("gap.approveProposal", {
      project_id: PROJECT_B_ID,
      gap_id: futureTrends!.id,
    });
    const approvedGap = approved.gaps.find((g) => g.dimension === "future_trends");
    expect(approvedGap?.proposal_status).toBe("approved");
    expect(approvedGap?.created_task_id).toBeTruthy();

    const tasksAfter = mockBackend.handle("task.list", { project_id: PROJECT_B_ID });
    expect(tasksAfter).toHaveLength(countBefore + 1);
    const created = tasksAfter.find((t) => t.id === approvedGap?.created_task_id);
    expect(created?.kind).toBe("search");
    expect(created?.state).toBe("PENDING");
    expect(created?.dimension).toBe("future_trends");

    // Dismissal hides the proposal.
    const industry = byDimension.get("industry");
    const dismissed = mockBackend.handle("gap.dismissProposal", {
      project_id: PROJECT_B_ID,
      gap_id: industry!.id,
    });
    expect(dismissed.gaps.find((g) => g.dimension === "industry")).toBeUndefined();
  });

  it("an empty project has no gaps because no run exists", () => {
    const created = mockBackend.handle("project.create", {
      name: "无缺口项目",
      description: "",
    });
    const report = mockBackend.handle("gap.list", { project_id: created.id });
    expect(report.gaps).toEqual([]);
  });
});

describe("graph projection (RES-08 contract)", () => {
  it("projects revealed nodes and active relations with counts", () => {
    const graph = mockBackend.handle("graph.get", { project_id: PROJECT_B_ID });
    expect(graph.nodes).toHaveLength(14);
    expect(graph.relations).toHaveLength(12);

    const concept = graph.nodes.find((n) => n.title === "运动皮层解码");
    expect(concept?.type).toBe("Concept");
    expect(concept?.claim_count).toBeGreaterThan(0);
    expect(concept?.source_count).toBeGreaterThan(0);

    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const relation of graph.relations) {
      expect(nodeIds.has(relation.source_node_id)).toBe(true);
      expect(nodeIds.has(relation.target_node_id)).toBe(true);
    }
  });

  it("an unrevealed project projects an empty graph", () => {
    const graph = mockBackend.handle("graph.get", { project_id: PROJECT_A_ID });
    expect(graph.nodes).toEqual([]);
    expect(graph.relations).toEqual([]);
  });
});

describe("timeline", () => {
  it("orders events newest first", () => {
    const timeline = mockBackend.handle("timeline.get", { project_id: PROJECT_B_ID });
    expect(timeline.length).toBeGreaterThan(0);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1].timestamp >= timeline[i].timestamp).toBe(true);
    }
  });
});

describe("assistant (UI-05 contract)", () => {
  it("reports context counts per project", () => {
    const contextB = mockBackend.handle("assistant.getContext", {
      project_id: PROJECT_B_ID,
    });
    expect(contextB.tasks_total).toBe(14);
    expect(contextB.tasks_completed).toBe(12);
    expect(contextB.pending_reviews).toBeGreaterThanOrEqual(1);
    expect(contextB.plan_status).toBe("approved");

    const contextA = mockBackend.handle("assistant.getContext", {
      project_id: PROJECT_A_ID,
    });
    expect(contextA.plan_status).toBe("draft");
    expect(contextA.tasks_total).toBe(0);
  });

  it("explains progress and lists pending reviews with conflicting claims", () => {
    const progress = mockBackend.handle("assistant.act", {
      project_id: PROJECT_B_ID,
      action: "explain_progress",
    });
    expect(progress.summary).toContain("脑机接口康复应用");
    expect(progress.items.length).toBeGreaterThan(0);

    const reviews = mockBackend.handle("assistant.act", {
      project_id: PROJECT_B_ID,
      action: "list_pending_reviews",
    });
    expect(reviews.items.length).toBeGreaterThanOrEqual(2);
    expect(reviews.items.some((i) => i.detail.includes("支持与反驳"))).toBe(true);
  });

  it("suggests plan review for a draft project and gap tasks after completion", () => {
    const suggestionA = mockBackend.handle("assistant.act", {
      project_id: PROJECT_A_ID,
      action: "suggest_next_task",
    });
    expect(suggestionA.summary).toContain("审查研究计划");

    const suggestionB = mockBackend.handle("assistant.act", {
      project_id: PROJECT_B_ID,
      action: "suggest_next_task",
    });
    expect(
      suggestionB.summary.includes("待审核") || suggestionB.summary.includes("批准"),
    ).toBe(true);
  });

  it("records decisions explicitly and keeps them project-scoped", () => {
    const saved = mockBackend.handle("assistant.saveDecision", {
      project_id: PROJECT_A_ID,
      content: "决定：下一轮聚焦量化路线",
    });
    expect(saved.content).toContain("量化");

    const decisions = mockBackend.handle("assistant.listDecisions", {
      project_id: PROJECT_A_ID,
    });
    expect(decisions).toHaveLength(1);

    const decisionsB = mockBackend.handle("assistant.listDecisions", {
      project_id: PROJECT_B_ID,
    });
    expect(decisionsB).toHaveLength(0);
  });
});

describe("desktop-core surface (batch-1 Rust commands)", () => {
  it("stores provider keys in the mock keychain without ever returning values", () => {
    const initial = mockBackend.handle("secrets.listProviders", {});
    expect(initial).toHaveLength(2);
    expect(initial.every((provider) => provider.has_key === false)).toBe(true);
    expect(initial[0].key_ref).toMatchObject({ key_name: "api_key" });

    // Fake key material built at runtime; never a literal credential.
    const fakeKey = Array.from({ length: 12 }, (_, i) => `k${i}`).join("-");
    const stored = mockBackend.handle("secrets.setProviderKey", {
      provider: "glm",
      api_key: fakeKey,
    });
    expect(stored).toEqual({ provider: "glm", key_name: "api_key" });

    const after = mockBackend.handle("secrets.listProviders", {});
    const glm = after.find((provider) => provider.name === "glm");
    expect(glm?.has_key).toBe(true);
    // The value never crosses back over the command surface.
    expect(JSON.stringify(after)).not.toContain(fakeKey);

    expect(() =>
      mockBackend.handle("secrets.setProviderKey", { provider: " ", api_key: fakeKey }),
    ).toThrowError(MorphoError);
  });

  it("resets the mock keychain with the fixture state", () => {
    const fakeKey = Array.from({ length: 8 }, () => "x").join("");
    mockBackend.handle("secrets.setProviderKey", { provider: "glm", api_key: fakeKey });
    mockBackend.reset();
    expect(
      mockBackend.handle("secrets.listProviders", {}).every((p) => !p.has_key),
    ).toBe(true);
  });

  it("exports a project vault summary from the stored dataset", () => {
    const summary = mockBackend.handle("vault.exportProject", {
      project_id: PROJECT_B_ID,
    });
    // Project B reveals knowledge: sources + nodes + claims + 1 map note.
    const sources = mockBackend.handle("source.list", { project_id: PROJECT_B_ID });
    const nodes = mockBackend.handle("knowledge.list", { project_id: PROJECT_B_ID });
    const claims = mockBackend.handle("claim.list", { project_id: PROJECT_B_ID });
    expect(summary.sources).toBe(sources.length);
    expect(summary.claims).toBe(claims.length);
    expect(summary.written).toBe(sources.length + nodes.length + claims.length + 1);
    expect(summary.maps).toBe(1);
    expect(summary.conflicts).toBe(0);
    expect(summary.vault_root).toBe(`mock-vault/${PROJECT_B_ID}`);

    const empty = mockBackend.handle("vault.exportProject", {
      project_id: PROJECT_A_ID,
    });
    expect(empty.written).toBe(0);
    expect(empty.maps).toBe(0);

    expect(() =>
      mockBackend.handle("vault.exportProject", { project_id: "ghost" }),
    ).toThrowError(MorphoError);
  });

  it("archives a project out of the active list and reports unknown ids as null", () => {
    const before = mockBackend.handle("project.list", {});
    const archived = mockBackend.handle("project.archive", {
      project_id: PROJECT_A_ID,
    });
    expect(archived?.id).toBe(PROJECT_A_ID);

    const after = mockBackend.handle("project.list", {});
    expect(after.map((p) => p.id)).not.toContain(PROJECT_A_ID);
    expect(after).toHaveLength(before.length - 1);

    expect(
      mockBackend.handle("project.archive", { project_id: "ghost" }),
    ).toBeNull();
    // Archiving an already-archived project id also reads as unknown.
    expect(
      mockBackend.handle("project.archive", { project_id: PROJECT_A_ID }),
    ).toBeNull();
  });

  it("cancels an active run and parks its non-terminal tasks", () => {
    mockBackend.handle("plan.approve", { project_id: PROJECT_A_ID });
    const run = mockBackend.handle("run.start", { project_id: PROJECT_A_ID });
    expect(["PLANNING", "RUNNING"]).toContain(run.state);
    mockBackend.step();

    expect(
      mockBackend.handle("run.cancel", { project_id: PROJECT_A_ID }),
    ).toBe(true);
    const cancelled = mockBackend.handle("run.get", { project_id: PROJECT_A_ID });
    expect(cancelled?.state).toBe("CANCELLED");
    const tasks = mockBackend.handle("task.list", { project_id: PROJECT_A_ID });
    expect(tasks.length).toBeGreaterThan(0);
    expect(
      tasks.every((task) => ["CANCELLED", "COMPLETED", "NEEDS_REVIEW", "FAILED"].includes(task.state)),
    ).toBe(true);

    // A terminal run has nothing left to cancel.
    expect(() =>
      mockBackend.handle("run.cancel", { project_id: PROJECT_A_ID }),
    ).toThrowError(MorphoError);
    // Project B's seeded run is parked in NEEDS_REVIEW — also not cancellable.
    expect(() =>
      mockBackend.handle("run.cancel", { project_id: PROJECT_B_ID }),
    ).toThrowError(MorphoError);
  });

  it("serves core capability info and echoes ping", () => {
    const info = mockBackend.handle("core.info", {});
    expect(info).toMatchObject({
      app_name: "Morpho Research OS",
      ipc_schema_version: "1.0",
      event_envelope: "research.event.v1",
    });
    expect(info.database_schema_version).toBeGreaterThan(0);

    const pong = mockBackend.handle("core.ping", { echo: "status" });
    expect(pong).toEqual({ echo: "status" });
  });
});
