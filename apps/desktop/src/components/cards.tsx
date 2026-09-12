import { Badge, Button, Card } from "@morpho/ui";
import {
  TASK_STATE_BADGE_VARIANT,
  TASK_STATE_LABELS,
  SOURCE_TYPE_LABELS,
  SOURCE_STATUS_LABELS,
  NODE_TYPE_LABELS,
  CONFIDENCE_LABELS,
  PLAN_STATUS_LABELS,
  dimensionLabel,
} from "@/types/labels";
import {
  QUALITY_SOURCE_THRESHOLD,
  type Claim,
  type ConfidenceState,
  type Evidence,
  type KnowledgeNode,
  type KnowledgeNodeType,
  type PlanStatus,
  type Source,
  type TaskState,
} from "@/types/domain";

/* ------------------------------------------------------------------ */
/* Shared mappings and helpers                                         */
/* ------------------------------------------------------------------ */

/**
 * Prototype badge class per node type (spec §4 prototype palette; types
 * without a prototype entry follow the nearest existing node-badge colour).
 * Shared by the knowledge view cards and the graph inspector.
 */
export const NODE_TYPE_BADGE_CLASS: Record<KnowledgeNodeType, string> = {
  Concept: "node-badge-accent",
  Event: "node-badge-accent",
  Person: "node-badge-alt",
  Paper: "node-badge-alt",
  Book: "node-badge-alt",
  Experiment: "node-badge-alt",
  Technology: "node-badge-alt",
  Product: "node-badge-alt",
  Application: "node-badge-alt",
  Policy: "node-badge-alt",
  Dataset: "node-badge-alt",
  Company: "node-badge-warning",
  Organization: "node-badge-warning",
  Controversy: "node-badge-error",
};

/** A source meets the documented quality bar on both axes (docs/PRD.md §6). */
export function isQualitySource(source: Source): boolean {
  return (
    source.quality !== null &&
    source.quality.authority >= QUALITY_SOURCE_THRESHOLD &&
    source.quality.fitness >= QUALITY_SOURCE_THRESHOLD
  );
}

/** Normalized host for the compact source row; falls back to a short URL. */
function sourceHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.length > 28 ? `${url.slice(0, 28)}…` : url;
  }
}

/* ------------------------------------------------------------------ */
/* ResearchStatusBadge                                                 */
/* ------------------------------------------------------------------ */

const CONFIDENCE_BADGE_VARIANT: Record<
  ConfidenceState,
  "neutral" | "accent" | "success" | "warning" | "error" | "info"
> = {
  confirmed: "success",
  high: "success",
  medium: "info",
  low: "neutral",
  unverified: "warning",
  conflicting: "error",
};

/** Registered business component: ResearchStatusBadge. */
export function ResearchStatusBadge({
  state,
  kind = "task",
}: {
  state: TaskState | PlanStatus | ConfidenceState;
  kind?: "task" | "plan" | "confidence";
}) {
  if (kind === "task") {
    const key = state as TaskState;
    return (
      <Badge variant={TASK_STATE_BADGE_VARIANT[key]}>
        {TASK_STATE_LABELS[key] ?? key}
      </Badge>
    );
  }
  if (kind === "plan") {
    const key = state as PlanStatus;
    const variant =
      key === "approved" ? "success" : key === "rejected" ? "error" : "warning";
    return <Badge variant={variant}>{PLAN_STATUS_LABELS[key] ?? key}</Badge>;
  }
  const key = state as ConfidenceState;
  return (
    <Badge variant={CONFIDENCE_BADGE_VARIANT[key]}>
      {CONFIDENCE_LABELS[key] ?? key}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* SourceCard                                                          */
/* ------------------------------------------------------------------ */

/** Prototype compact-row grid (spec §4, `view-sources`). */
const SOURCE_ROW_GRID =
  "grid grid-cols-[74px_1fr_70px_35px] items-center gap-md border-b border-border py-md min-h-[70px]";

/** Prototype type-badge class per source type (spec §4). */
function sourceTypeBadgeClass(type: Source["source_type"]): string {
  if (type === "paper" || type === "documentation") return "badge-mono node-badge-alt";
  if (type === "web_page") return "badge-mono node-badge-accent";
  return "pill pill-neutral";
}

/** Prototype quality tier caption for the compact row. */
function sourceTier(source: Source): { label: string; className: string } {
  if (!source.quality) return { label: "待审核", className: "text-text-muted" };
  return isQualitySource(source)
    ? { label: "高质量", className: "text-success" }
    : { label: "中等", className: "text-warning" };
}

/**
 * Registered business component: SourceCard.
 * variant="card" (default): full card with URL and quality rationale.
 * variant="row": the prototype's compact list row (source-row testid) used
 * by the sources view — same data, prototype row anatomy.
 */
export function SourceCard({
  source,
  variant = "card",
}: {
  source: Source;
  variant?: "card" | "row";
}) {
  if (variant === "row") {
    const tier = sourceTier(source);
    return (
      <li data-testid="source-row" className={SOURCE_ROW_GRID}>
        <span className={sourceTypeBadgeClass(source.source_type)}>
          {SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type}
        </span>
        <div className="min-w-0">
          <strong className="text-body text-text-primary">{source.title}</strong>
          <small className="mt-xs block truncate text-caption text-text-muted">
            <span>{sourceHost(source.url)}</span>
            <span aria-hidden="true"> · </span>
            <span>
              {SOURCE_STATUS_LABELS[source.status] ?? source.status}
            </span>
          </small>
        </div>
        <div className="flex flex-col gap-xs">
          <span className={`text-caption ${tier.className}`}>{tier.label}</span>
          <span className="font-mono text-[11px] text-text-muted">
            {source.quality
              ? ((source.quality.authority + source.quality.fitness) / 2).toFixed(2)
              : "—"}
          </span>
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          aria-label="打开来源"
          className="text-caption text-info hover:underline"
        >
          ↗
        </a>
      </li>
    );
  }

  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-start justify-between gap-md">
        <h3 className="text-h3 text-text-primary">{source.title}</h3>
        <Badge variant="neutral">{SOURCE_TYPE_LABELS[source.source_type]}</Badge>
      </div>
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="break-all text-caption text-info underline-offset-2 hover:underline"
      >
        {source.url}
      </a>
      <div className="flex flex-wrap items-center gap-sm text-caption text-text-secondary">
        <Badge variant="info">{SOURCE_STATUS_LABELS[source.status]}</Badge>
        {source.dimensions.map((dim) => (
          <Badge key={dim} variant="neutral">
            {dimensionLabel(dim)}
          </Badge>
        ))}
      </div>
      {source.quality ? (
        <p className="text-caption text-text-muted">
          来源质量：权威性 {source.quality.authority.toFixed(2)} · 适配度{" "}
          {source.quality.fitness.toFixed(2)} —— {source.quality.rationale}
          （质量描述用途适配，不代表内容真伪）
        </p>
      ) : (
        <p className="text-caption text-text-muted">来源质量待评估。</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* KnowledgeCard                                                       */
/* ------------------------------------------------------------------ */

/**
 * Registered business component: KnowledgeCard — the prototype knowledge
 * card (spec §4, `view-knowledge`): mono type badge and confidence caption
 * on top, title + summary, source/claim counts at the bottom. Conflicting
 * nodes get the prototype conflict styling and their own testid.
 */
export function KnowledgeCard({ node }: { node: KnowledgeNode }) {
  const conflicting = node.status === "conflicting";
  return (
    <Card
      data-testid={conflicting ? "knowledge-card-conflict" : "knowledge-card"}
      className={`flex min-h-[203px] flex-col p-md ${
        conflicting ? "card-active-error" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-sm">
        <span className={`badge-mono ${NODE_TYPE_BADGE_CLASS[node.type]}`}>
          {NODE_TYPE_LABELS[node.type]}
        </span>
        <span
          className={`text-caption ${conflicting ? "text-error" : "text-text-muted"}`}
        >
          {CONFIDENCE_LABELS[node.status]}
        </span>
      </div>
      <h2 className="mt-md text-h3 text-text-primary">{node.title}</h2>
      <p className="mt-xs min-h-[65px] text-caption text-text-secondary">
        {node.summary}
      </p>
      <div className="mt-auto flex items-center gap-md text-caption text-text-muted">
        <span>
          ↗ {node.source_ids.length} 来源
        </span>
        <span>◇ {node.claim_ids.length} 结论</span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* EvidenceList                                                        */
/* ------------------------------------------------------------------ */

const DIRECTION_LABELS: Record<Evidence["direction"], string> = {
  support: "支持",
  contradict: "反驳",
};

/** Registered business component: EvidenceList. */
export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return <p className="text-caption text-text-muted">该论断暂无证据记录。</p>;
  }
  return (
    <ul className="flex flex-col gap-sm">
      {evidence.map((item) => (
        <li
          key={item.id}
          className="rounded-md border border-border bg-surface p-md"
          data-testid="evidence-item"
        >
          <div className="flex items-center gap-sm">
            <Badge variant={item.direction === "support" ? "success" : "error"}>
              {DIRECTION_LABELS[item.direction]}
            </Badge>
            <span className="text-caption text-text-muted">
              定位：{item.locator.kind} · {item.locator.value} · 提取于{" "}
              {item.retrieved_at.slice(0, 10)}
            </span>
          </div>
          <blockquote className="mt-sm border-l-2 border-border pl-md text-body text-text-secondary">
            “{item.quote}”
          </blockquote>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* ClaimCard                                                           */
/* ------------------------------------------------------------------ */

/** Registered business component: ClaimCard — claims are never folded into
 * entity descriptions; conflicting claims coexist with their evidence. */
export function ClaimCard({
  claim,
  subjectTitle,
  evidence,
  onToggleEvidence,
  evidenceOpen,
}: {
  claim: Claim;
  subjectTitle: string;
  evidence: Evidence[];
  evidenceOpen: boolean;
  onToggleEvidence: (claimId: string) => void;
}) {
  return (
    <Card className="flex flex-col gap-sm" data-testid="claim-card">
      <div className="flex flex-wrap items-center gap-sm">
        <ResearchStatusBadge state={claim.status} kind="confidence" />
        <span className="text-caption text-text-muted">
          主体：{subjectTitle} · 置信度 {claim.confidence.toFixed(2)} · 范围：{claim.scope}
        </span>
      </div>
      <p className="text-body text-text-primary">
        <span className="text-text-secondary">{subjectTitle}</span>{" "}
        <span className="font-medium">{claim.predicate}</span>{" "}
        <span className="text-text-secondary">{claim.object_value}</span>
      </p>
      <div>
        <Button size="sm" variant="ghost" onClick={() => onToggleEvidence(claim.id)}>
          {evidenceOpen ? "收起证据" : `查看证据（${evidence.length}）`}
        </Button>
        {evidenceOpen ? (
          <div className="mt-sm">
            <EvidenceList evidence={evidence} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
