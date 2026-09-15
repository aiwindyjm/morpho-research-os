import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Select, Tabs, useToast } from "@morpho/ui";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { ClaimCard, KnowledgeCard } from "@/components/cards";
import { KNOWLEDGE_NODE_TYPES } from "@/types/domain";
import {
  useClaims,
  useEvidence,
  useExportVault,
  useKnowledge,
  useSources,
} from "@/services/queries";
import { isMorphoError } from "@/services/errors";

/**
 * Knowledge view (docs/PRD.md §6): nodes and claims stay separate record
 * types. Claims expand to their evidence with precise locators.
 *
 * Prototype alignment (spec §4, `view-knowledge`): knowledge cards in a
 * four-column grid with mono type badges and conflict styling, rendered by
 * the registered KnowledgeCard (prototype card anatomy incl. the conflict
 * variant). Badge mapping lives in components/cards.tsx
 * (NODE_TYPE_BADGE_CLASS). All chrome strings go through t() (ADR-023,
 * "knowledge" namespace); the node-type vocabulary resolves through
 * common:vocab.nodeType.
 */

export function KnowledgePage({ projectId }: { projectId: string }) {
  const { t } = useTranslation("knowledge");
  const knowledge = useKnowledge(projectId);
  const claims = useClaims(projectId);
  const sources = useSources(projectId);
  const exportVault = useExportVault(projectId);
  const { showToast } = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [openEvidence, setOpenEvidence] = useState<Set<string>>(new Set());

  // One click does the whole export: the Rust core resolves the vault path
  // from its own config (vault_export_project) — the UI asks nothing extra.
  function exportVaultToDisk() {
    void exportVault
      .mutateAsync()
      .then((result) => {
        if (result.conflicts > 0) {
          const proposals =
            result.merge_proposals
              .map((proposal) => proposal.path)
              .slice(0, 3)
              .join(t("toast.listSeparator")) +
            (result.merge_proposals.length > 3 ? t("toast.moreSuffix") : "");
          showToast({
            title: t("toast.conflictTitle"),
            detail: t("toast.conflictDetail", {
              written: result.written,
              unchanged: result.unchanged,
              conflicts: result.conflicts,
              proposals,
              root: result.vault_root,
            }),
            variant: "warning",
          });
          return;
        }
        showToast({
          title: t("toast.successTitle"),
          detail: t("toast.successDetail", {
            written: result.written,
            sources: result.sources,
            claims: result.claims,
            maps: result.maps,
            unchanged: result.unchanged,
            root: result.vault_root,
          }),
          variant: "success",
        });
      })
      .catch((error: unknown) => {
        showToast({
          title: t("toast.errorTitle"),
          detail: isMorphoError(error)
            ? error.userMessage
            : t("common:error.unknown"),
          variant: "error",
        });
      });
  }

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of knowledge.data ?? []) map.set(node.id, node.title);
    return map;
  }, [knowledge.data]);

  const filteredNodes = (knowledge.data ?? []).filter((node) => {
    if (typeFilter !== "all" && node.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      node.title.toLowerCase().includes(needle) ||
      node.summary.toLowerCase().includes(needle) ||
      node.aliases.some((alias) => alias.toLowerCase().includes(needle))
    );
  });

  function toggleEvidence(claimId: string) {
    setOpenEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(claimId)) next.delete(claimId);
      else next.add(claimId);
      return next;
    });
  }

  const knowledgeTab = (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center gap-sm">
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-caption text-text-muted" role="status">
          {t("nodeCount", { total: filteredNodes.length })}
        </span>
      </div>
      <div className="grid gap-md md:grid-cols-2 xl:grid-cols-4">
        {filteredNodes.map((node) => (
          <KnowledgeCard key={node.id} node={node} />
        ))}
      </div>
      {filteredNodes.length === 0 ? (
        <Card className="text-center text-body text-text-secondary">
          {t("noMatch")}
        </Card>
      ) : null}
    </div>
  );

  const claimsTab = (
    <div className="flex flex-col gap-md">
      <p className="text-caption text-text-secondary">
        {t("claimsIntro")}
      </p>
      {(claims.data ?? []).map((claim) => (
        <ClaimRow
          key={claim.id}
          projectId={projectId}
          claimId={claim.id}
          subjectTitle={titleById.get(claim.subject_node_id) ?? t("unknownSubject")}
          open={openEvidence.has(claim.id)}
          onToggle={() => toggleEvidence(claim.id)}
        />
      ))}
    </div>
  );

  return (
    <PageShell
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
      actions={
        <>
          <Select
            aria-label={t("filterAria")}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-36"
          >
            <option value="all">{t("filterAll")}</option>
            {KNOWLEDGE_NODE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`common:vocab.nodeType.${type}`, { defaultValue: type })}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            onClick={exportVaultToDisk}
            loading={exportVault.isPending}
            title={t("exportTitle")}
          >
            {t("exportVault")}
          </Button>
        </>
      }
      toolbar={
        sources.data ? (
          <div className="flex items-center gap-sm text-caption text-text-muted">
            <Badge variant="neutral">{t("toolbar.sources", { total: sources.data.length })}</Badge>
            <Badge variant="neutral">
              {t("toolbar.nodes", { total: (knowledge.data ?? []).length })}
            </Badge>
            <Badge variant="neutral">
              {t("toolbar.claims", { total: (claims.data ?? []).length })}
            </Badge>
          </div>
        ) : null
      }
    >
      <PageStates
        isLoading={knowledge.isLoading || claims.isLoading}
        error={knowledge.error ?? claims.error}
        onRetry={() => {
          void knowledge.refetch();
          void claims.refetch();
        }}
        isEmpty={
          (knowledge.data ?? []).length === 0 && (claims.data ?? []).length === 0
        }
        empty={{
          title: t("empty.title"),
          description: t("empty.description"),
        }}
      >
        <Tabs
          label={t("tabs.label")}
          items={[
            { id: "nodes", label: t("tabs.nodes"), content: knowledgeTab },
            { id: "claims", label: t("tabs.claims"), content: claimsTab },
          ]}
        />
      </PageStates>
    </PageShell>
  );
}

function ClaimRow({
  projectId,
  claimId,
  subjectTitle,
  open,
  onToggle,
}: {
  projectId: string;
  claimId: string;
  subjectTitle: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("knowledge");
  const claims = useClaims(projectId);
  const evidence = useEvidence(projectId, open ? claimId : "");
  const claim = (claims.data ?? []).find((c) => c.id === claimId);
  if (!claim) return null;

  const conflicting = claim.status === "conflicting";

  return (
    <div className={conflicting ? "rounded-lg border border-warning/40 p-sm" : ""}>
      {conflicting ? (
        <Badge variant="warning" className="mb-sm">
          {t("conflictBadge")}
        </Badge>
      ) : null}
      <ClaimCard
        claim={claim}
        subjectTitle={subjectTitle}
        evidence={evidence.data ?? []}
        evidenceOpen={open}
        onToggleEvidence={onToggle}
      />
      {open && evidence.isLoading ? (
        <p className="mt-sm text-caption text-text-muted" role="status">
          {t("evidenceLoading")}
        </p>
      ) : null}
    </div>
  );
}
