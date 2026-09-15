import { Badge, Button, Card } from "@morpho/ui";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TASK_STATE_BADGE_VARIANT } from "@/types/labels";
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

/**
 * Registered business component: ResearchStatusBadge. The label resolves
 * through the shared common:vocab.* display vocabularies (ADR-023); the
 * visual variant mapping stays here.
 */
export function ResearchStatusBadge({
  state,
  kind = "task",
}: {
  state: TaskState | PlanStatus | ConfidenceState;
  kind?: "task" | "plan" | "confidence";
}) {
  const { t } = useTranslation("cards");
  const value = String(state);
  if (kind === "task") {
    return (
      <Badge variant={TASK_STATE_BADGE_VARIANT[state as TaskState]}>
        {t(`common:vocab.taskState.${value}`, { defaultValue: value })}
      </Badge>
    );
  }
  if (kind === "plan") {
    const variant =
      state === "approved" ? "success" : state === "rejected" ? "error" : "warning";
    return (
      <Badge variant={variant}>
        {t(`common:vocab.planStatus.${value}`, { defaultValue: value })}
      </Badge>
    );
  }
  return (
    <Badge variant={CONFIDENCE_BADGE_VARIANT[state as ConfidenceState]}>
      {t(`common:vocab.confidence.${value}`, { defaultValue: value })}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* SourceCard                                                          */
/* ------------------------------------------------------------------ */

/**
 * Prototype compact-row grid (spec §4, `view-sources`). Narrow-window
 * strategy (DESIGN_TOKENS.md "narrow table strategy", shared with the tasks
 * table and the reports dimension table): minmax floors on the fixed tracks
 * plus an overflow-x-auto region around the list in SourcesPage — columns
 * stop squeezing at readable minimums and the rows scroll horizontally
 * instead. The 74px/70px/35px maxima keep the desktop geometry unchanged.
 */
const SOURCE_ROW_GRID =
  "grid grid-cols-[minmax(64px,74px)_minmax(150px,1fr)_minmax(60px,70px)_35px] items-center gap-md border-b border-border py-md min-h-[70px]";

/** Prototype type-badge class per source type (spec §4). */
function sourceTypeBadgeClass(type: Source["source_type"]): string {
  if (type === "paper" || type === "documentation") return "badge-mono node-badge-alt";
  if (type === "web_page") return "badge-mono node-badge-accent";
  return "pill pill-neutral";
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Prototype quality tier caption for the compact row. */
function sourceQualityTier(
  source: Source,
  t: Translate,
): { label: string; className: string } {
  if (!source.quality) return { label: t("tier.pending"), className: "text-text-muted" };
  return isQualitySource(source)
    ? { label: t("tier.high"), className: "text-success" }
    : { label: t("tier.medium"), className: "text-warning" };
}

/**
 * Registered business component: SourceCard.
 * variant="card" (default): full card with URL and quality rationale.
 * variant="row": the prototype's compact list row (source-row testid) used
 * by the sources view — same data, prototype row anatomy. Labels resolve
 * through common:vocab.* (type/status/dimension) and the "cards" namespace
 * (tier captions, quality rationale).
 */
export function SourceCard({
  source,
  variant = "card",
}: {
  source: Source;
  variant?: "card" | "row";
}) {
  const { t } = useTranslation("cards");
  const typeLabel = t(`common:vocab.sourceType.${source.source_type}`, {
    defaultValue: source.source_type,
  });
  const statusLabel = t(`common:vocab.sourceStatus.${source.status}`, {
    defaultValue: source.status,
  });

  if (variant === "row") {
    const tier = sourceQualityTier(source, t);
    return (
      <li data-testid="source-row" className={SOURCE_ROW_GRID}>
        <span className={sourceTypeBadgeClass(source.source_type)}>
          {typeLabel}
        </span>
        <div className="min-w-0">
          <strong className="text-body text-text-primary">{source.title}</strong>
          <small className="mt-xs block truncate text-caption text-text-muted">
            <span>{sourceHost(source.url)}</span>
            <span aria-hidden="true"> · </span>
            <span>
              {statusLabel}
            </span>
          </small>
        </div>
        <div className="flex flex-col gap-xs">
          <span className={`text-caption ${tier.className}`}>{tier.label}</span>
          <span className="font-mono text-micro text-text-muted">
            {source.quality
              ? ((source.quality.authority + source.quality.fitness) / 2).toFixed(2)
              : "—"}
          </span>
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          aria-label={t("sourceRow.openAria")}
          className="text-caption text-info hover:underline"
        >
          <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </li>
    );
  }

  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-start justify-between gap-md">
        <h3 className="text-h3 text-text-primary">{source.title}</h3>
        <Badge variant="neutral">{typeLabel}</Badge>
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
        <Badge variant="info">{statusLabel}</Badge>
        {source.dimensions.map((dim) => (
          <Badge key={dim} variant="neutral">
            {t(`common:vocab.dimension.${dim}`, { defaultValue: dim })}
          </Badge>
        ))}
      </div>
      {source.quality ? (
        <p className="text-caption text-text-muted">
          {t("quality.rationale", {
            authority: source.quality.authority.toFixed(2),
            fitness: source.quality.fitness.toFixed(2),
            rationale: source.quality.rationale,
          })}
        </p>
      ) : (
        <p className="text-caption text-text-muted">{t("quality.pending")}</p>
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
  const { t } = useTranslation("cards");
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
          {t(`common:vocab.nodeType.${node.type}`, { defaultValue: node.type })}
        </span>
        <span
          className={`text-caption ${conflicting ? "text-error" : "text-text-muted"}`}
        >
          {t(`common:vocab.confidence.${node.status}`, { defaultValue: node.status })}
        </span>
      </div>
      <h2 className="mt-md text-h3 text-text-primary">{node.title}</h2>
      <p className="mt-xs min-h-[65px] text-caption text-text-secondary">
        {node.summary}
      </p>
      <div className="mt-auto flex items-center gap-md text-caption text-text-muted">
        <span className="flex items-center gap-xs">
          <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
          {t("knowledge.sourceCount", { total: node.source_ids.length })}
        </span>
        <span className="flex items-center gap-xs">
          <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
          {t("knowledge.claimCount", { total: node.claim_ids.length })}
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* EvidenceList                                                        */
/* ------------------------------------------------------------------ */

/** Registered business component: EvidenceList. */
export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const { t } = useTranslation("cards");
  if (evidence.length === 0) {
    return <p className="text-caption text-text-muted">{t("evidence.none")}</p>;
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
              {item.direction === "support"
                ? t("evidence.directionSupport")
                : t("evidence.directionContradict")}
            </Badge>
            <span className="text-caption text-text-muted">
              {t("evidence.locator", {
                kind: item.locator.kind,
                value: item.locator.value,
                date: item.retrieved_at.slice(0, 10),
              })}
            </span>
          </div>
          <blockquote className="mt-sm border-l-2 border-border pl-md text-body text-text-secondary">
            {t("evidence.quote", { quote: item.quote })}
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
  const { t } = useTranslation("cards");
  return (
    <Card className="flex flex-col gap-sm" data-testid="claim-card">
      <div className="flex flex-wrap items-center gap-sm">
        <ResearchStatusBadge state={claim.status} kind="confidence" />
        <span className="text-caption text-text-muted">
          {t("claim.meta", {
            subject: subjectTitle,
            confidence: claim.confidence.toFixed(2),
            scope: claim.scope,
          })}
        </span>
      </div>
      <p className="text-body text-text-primary">
        <span className="text-text-secondary">{subjectTitle}</span>{" "}
        <span className="font-medium">{claim.predicate}</span>{" "}
        <span className="text-text-secondary">{claim.object_value}</span>
      </p>
      <div>
        <Button size="sm" variant="ghost" onClick={() => onToggleEvidence(claim.id)}>
          {evidenceOpen
            ? t("claim.collapse")
            : t("claim.expand", { total: evidence.length })}
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
