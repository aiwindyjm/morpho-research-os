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
import type {
  Claim,
  ConfidenceState,
  Evidence,
  KnowledgeNode,
  PlanStatus,
  Source,
  TaskState,
} from "@/types/domain";

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

/** Registered business component: SourceCard. */
export function SourceCard({ source }: { source: Source }) {
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

/** Registered business component: KnowledgeCard. */
export function KnowledgeCard({
  node,
  onOpen,
}: {
  node: KnowledgeNode;
  onOpen?: (node: KnowledgeNode) => void;
}) {
  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-start justify-between gap-md">
        <button
          type="button"
          className="text-left text-h3 text-text-primary hover:underline focus-visible:underline"
          onClick={() => onOpen?.(node)}
        >
          {node.title}
        </button>
        <Badge variant="accent">{NODE_TYPE_LABELS[node.type]}</Badge>
      </div>
      {node.aliases.length > 0 ? (
        <p className="text-caption text-text-muted">别名：{node.aliases.join("、")}</p>
      ) : null}
      <p className="text-body text-text-secondary">{node.summary}</p>
      <div className="flex flex-wrap items-center gap-sm">
        <ResearchStatusBadge state={node.status} kind="confidence" />
        <Badge variant="neutral">{dimensionLabel(node.dimension)}</Badge>
        <span className="text-caption text-text-muted">
          来源 {node.source_ids.length} · 论断 {node.claim_ids.length}
        </span>
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
