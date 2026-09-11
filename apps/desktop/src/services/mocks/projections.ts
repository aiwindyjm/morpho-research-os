import type {
  Claim,
  Evidence,
  GapReport,
  KnowledgeNode,
  ResearchGap,
  ResearchTask,
  Relation,
  Source,
  TimelineEntry,
  CoverageReport,
  GraphProjection,
} from "@/types/domain";
import {
  COVERAGE_WEIGHTS,
  GAP_COVERAGE_THRESHOLD,
  GAP_MIN_QUALITY_SOURCES,
  QUALITY_SOURCE_THRESHOLD,
} from "@/types/domain";
import { dimensionLabel } from "@/types/labels";
import type { ProjectRuntimeState } from "./orchestrator";

/**
 * Read-model projections over the mock store. The real projections belong
 * to the Rust/worker side and will arrive through IPC (W2-05); the mock
 * implementations apply the exact documented rules so the UI contract is
 * stable:
 *  - Coverage formula from docs/PRD.md §14 / docs/architecture/
 *    COVERAGE_AND_GAPS.md (0.4/0.3/0.2/0.1).
 *  - Gap rules: coverage < 0.6 or fewer than 2 independent quality sources.
 *  - Gap proposals stay read-only until the user approves them.
 */

/** Dataset of a seeded/revealed project, passed in by the backend. */
export interface ProjectDataset {
  sources: Source[];
  nodes: KnowledgeNode[];
  claims: Claim[];
  evidence: Evidence[];
  relations: Relation[];
}

export interface ProjectionInput {
  state: ProjectRuntimeState;
  dataset: ProjectDataset;
}

function revealedData(input: ProjectionInput): {
  sources: Source[];
  nodes: KnowledgeNode[];
  claims: Claim[];
  evidence: Evidence[];
  relations: Relation[];
} {
  const { state, dataset } = input;
  if (state.reveal === "knowledge") {
    return {
      sources: dataset.sources,
      nodes: dataset.nodes,
      claims: dataset.claims,
      evidence: dataset.evidence,
      relations: dataset.relations,
    };
  }
  if (state.reveal === "sources") {
    return {
      sources: dataset.sources,
      nodes: [],
      claims: [],
      evidence: [],
      relations: [],
    };
  }
  return { sources: [], nodes: [], claims: [], evidence: [], relations: [] };
}

function isQualitySource(source: Source): boolean {
  return (
    source.quality !== null &&
    source.quality.authority >= QUALITY_SOURCE_THRESHOLD &&
    source.quality.fitness >= QUALITY_SOURCE_THRESHOLD
  );
}

/** Independence for the gap rule: distinct source URLs (V0.1 proxy for
 * distinct domains until source fingerprinting lands). */
function independentCount(sources: Source[]): number {
  return new Set(sources.map((source) => source.url)).size;
}

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */

export function toGraphProjection(input: ProjectionInput): GraphProjection {
  const { nodes, claims, relations } = revealedData(input);
  const claimCountByNode = new Map<string, number>();
  for (const claim of claims) {
    claimCountByNode.set(
      claim.subject_node_id,
      (claimCountByNode.get(claim.subject_node_id) ?? 0) + 1,
    );
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  return {
    project_id: input.state.project.id,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      confidence: node.status,
      dimension: node.dimension,
      source_count: node.source_ids.length,
      claim_count: claimCountByNode.get(node.id) ?? 0,
    })),
    relations: relations
      .filter((rel) => rel.status === "active")
      .filter((rel) => nodeIds.has(rel.subject_id) && nodeIds.has(rel.object_id))
      .map((rel) => ({
        id: rel.id,
        source_node_id: rel.subject_id,
        target_node_id: rel.object_id,
        predicate: rel.predicate,
        confidence: rel.confidence,
      })),
  };
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

function tasksForDimension(tasks: ResearchTask[], dimension: string): ResearchTask[] {
  return tasks.filter((task) => task.dimension === dimension);
}

export function computeCoverage(input: ProjectionInput): CoverageReport {
  const { state } = input;
  const { sources, nodes, claims, evidence } = revealedData(input);
  const computedAt = defaultIso();

  const dimensions = state.config.dimensions.map((dimension) => {
    const dimTasks = tasksForDimension(state.tasks, dimension);
    const completed = dimTasks.filter((t) => t.state === "COMPLETED").length;
    const taskCompletion =
      dimTasks.length > 0 ? completed / dimTasks.length : 0;

    const dimNodes = nodes.filter((n) => n.dimension === dimension);
    const nodeTypes = new Set(dimNodes.map((n) => n.type));
    const knowledgeBreadth = Math.min(1, nodeTypes.size / 5);

    const dimNodeIds = new Set(dimNodes.map((n) => n.id));
    const dimClaims = claims.filter((c) => dimNodeIds.has(c.subject_node_id));
    const supportEvidence = new Set(
      evidence.filter((e) => e.direction === "support").map((e) => e.claim_id),
    );
    const claimsWithSupport = dimClaims.filter((c) =>
      supportEvidence.has(c.id),
    ).length;
    const evidenceDensity = Math.min(1, claimsWithSupport / 5);
    const dimEvidence = evidence.filter((e) => {
      const claim = claims.find((c) => c.id === e.claim_id);
      return claim !== undefined && dimNodeIds.has(claim.subject_node_id);
    });

    const dimSources = sources.filter((s) => s.dimensions.includes(dimension));
    const sourceTypes = [...new Set(dimSources.map((s) => s.source_type))];
    const sourceDiversity = Math.min(1, sourceTypes.length / 3);
    const qualitySources = independentCount(dimSources.filter(isQualitySource));

    const coverage =
      COVERAGE_WEIGHTS.task_completion * taskCompletion +
      COVERAGE_WEIGHTS.knowledge_breadth * knowledgeBreadth +
      COVERAGE_WEIGHTS.evidence_density * evidenceDensity +
      COVERAGE_WEIGHTS.source_diversity * sourceDiversity;

    const reasons: string[] = [
      dimTasks.length > 0
        ? `任务完成度 ${completed}/${dimTasks.length}。`
        : "尚无该维度的研究任务。",
      `知识广度覆盖 ${nodeTypes.size}/5 种节点类型（${dimNodes.length} 个节点）。`,
      `证据密度 ${claimsWithSupport}/5 条有支持证据的论断（共 ${dimEvidence.length} 条证据）。`,
      `来源多样性 ${sourceTypes.length}/3 种来源类型（${dimSources.length} 个来源）。`,
    ];

    return {
      dimension,
      coverage: round4(coverage),
      components: {
        task_completion: round4(taskCompletion),
        knowledge_breadth: round4(knowledgeBreadth),
        evidence_density: round4(evidenceDensity),
        source_diversity: round4(sourceDiversity),
      },
      inputs: {
        tasks_total: dimTasks.length,
        tasks_completed: completed,
        knowledge_nodes: dimNodes.length,
        evidence_items: dimEvidence.length,
        quality_sources: qualitySources,
        source_types: sourceTypes,
      },
      reasons,
      updated_at: computedAt,
    };
  });

  const overall =
    dimensions.length > 0
      ? round4(dimensions.reduce((sum, d) => sum + d.coverage, 0) / dimensions.length)
      : 0;

  return {
    project_id: state.project.id,
    overall,
    dimensions,
    computed_at: computedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Gaps                                                                */
/* ------------------------------------------------------------------ */

/** Persisted user decisions about gap proposals, keyed by dimension. */
export interface GapProposalRecord {
  status: "pending_approval" | "approved" | "dismissed";
  created_task_id: string | null;
}

/**
 * Recompute gaps from current data, merging in stored user decisions.
 * Only dimensions that currently trigger a gap rule appear in the report;
 * dismissed dimensions stay hidden.
 */
export function computeGaps(
  input: ProjectionInput,
  decisions: Map<string, GapProposalRecord>,
): GapReport {
  const coverage = computeCoverage(input);
  const computedAt = defaultIso();

  // Gap-driven research presupposes an executed plan; before any run the
  // primary action is reviewing and approving a plan, not filling gaps.
  if (input.state.tasks.length === 0) {
    return { project_id: input.state.project.id, gaps: [], computed_at: computedAt };
  }

  const gaps: ResearchGap[] = [];
  for (const dim of coverage.dimensions) {
    const coverageBelow = dim.coverage < GAP_COVERAGE_THRESHOLD;
    const sourcesBelow = dim.inputs.quality_sources < GAP_MIN_QUALITY_SOURCES;
    if (!coverageBelow && !sourcesBelow) continue;

    const stored = decisions.get(dim.dimension);
    if (stored?.status === "dismissed") continue;

    const rulesFired: string[] = [];
    if (coverageBelow) {
      rulesFired.push(
        `覆盖率 ${dim.coverage.toFixed(2)} 低于阈值 ${GAP_COVERAGE_THRESHOLD}`,
      );
    }
    if (sourcesBelow) {
      rulesFired.push(
        `独立高质量来源 ${dim.inputs.quality_sources} 个，少于 ${GAP_MIN_QUALITY_SOURCES} 个`,
      );
    }

    gaps.push({
      id: gapIdFor(input.state.project.id, dim.dimension),
      project_id: input.state.project.id,
      dimension: dim.dimension,
      trigger: coverageBelow
        ? "coverage_below_threshold"
        : "insufficient_quality_sources",
      rule: rulesFired.join("；"),
      detail: `建议为「${dimensionLabel(dim.dimension)}」补充检索与提取任务，扩大独立高质量来源并提升覆盖率。`,
      quality_sources_found: dim.inputs.quality_sources,
      coverage: dim.coverage,
      proposed_task: proposeTaskFor(dim.dimension),
      proposal_status: stored?.status ?? "pending_approval",
      created_task_id: stored?.created_task_id ?? null,
    });
  }

  return {
    project_id: input.state.project.id,
    gaps,
    computed_at: computedAt,
  };
}

function proposeTaskFor(dimension: string): ResearchGap["proposed_task"] {
  return {
    title: `补充研究：${dimensionLabel(dimension)}`,
    description: `针对「${dimensionLabel(dimension)}」执行新一轮来源检索与内容提取，目标：覆盖率不低于 ${GAP_COVERAGE_THRESHOLD}、独立高质量来源不少于 ${GAP_MIN_QUALITY_SOURCES} 个。`,
    dimension,
  };
}

function gapIdFor(projectId: string, dimension: string): string {
  return `gap:${projectId}:${dimension}`;
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export function buildTimeline(input: ProjectionInput): TimelineEntry[] {
  const { state, dataset } = input;
  const entries: TimelineEntry[] = [];

  for (const event of state.events) {
    entries.push({
      id: event.id,
      timestamp: event.timestamp,
      kind: "run",
      title: "运行事件",
      detail: event.summary,
    });
  }

  const revealed =
    state.reveal === "knowledge"
      ? dataset
      : state.reveal === "sources"
        ? { ...dataset, nodes: [], claims: [], evidence: [] }
        : { sources: [], nodes: [], claims: [], evidence: [], relations: [] };

  for (const source of revealed.sources) {
    if (source.retrieved_at) {
      entries.push({
        id: `src-${source.id}`,
        timestamp: source.retrieved_at,
        kind: "source",
        title: `新来源：${source.title}`,
        detail: `${source.source_type} · ${source.url}`,
      });
    }
  }
  for (const node of revealed.nodes) {
    entries.push({
      id: `node-${node.id}`,
      timestamp: node.created_at,
      kind: "knowledge",
      title: `知识节点：${node.title}`,
      detail: `${node.type} · ${dimensionLabel(node.dimension)}`,
    });
  }
  for (const claim of revealed.claims) {
    entries.push({
      id: `claim-${claim.id}`,
      timestamp: claim.created_at,
      kind: "claim",
      title: `论断：${claim.predicate}`,
      detail: `${claim.object_value} · 置信状态 ${claim.status}`,
    });
  }

  return entries
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 100);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function defaultIso(): string {
  return new Date().toISOString();
}
