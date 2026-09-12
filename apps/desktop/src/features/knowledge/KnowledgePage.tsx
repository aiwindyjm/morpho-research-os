import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Select, Tabs } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { ClaimCard, KnowledgeCard } from "@/components/cards";
import { KNOWLEDGE_NODE_TYPES } from "@/types/domain";
import { NODE_TYPE_LABELS } from "@/types/labels";
import { useClaims, useEvidence, useKnowledge, useSources } from "@/services/queries";

/**
 * Knowledge view (docs/PRD.md §6): nodes and claims stay separate record
 * types. Claims expand to their evidence with precise locators.
 *
 * Prototype alignment (spec §4, `view-knowledge`): knowledge cards in a
 * four-column grid with mono type badges and conflict styling, rendered by
 * the registered KnowledgeCard (prototype card anatomy incl. the conflict
 * variant). Badge mapping lives in components/cards.tsx
 * (NODE_TYPE_BADGE_CLASS).
 */

export function KnowledgePage({ projectId }: { projectId: string }) {
  const knowledge = useKnowledge(projectId);
  const claims = useClaims(projectId);
  const sources = useSources(projectId);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [openEvidence, setOpenEvidence] = useState<Set<string>>(new Set());

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
          aria-label="搜索知识节点"
          placeholder="搜索标题、摘要或别名…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-caption text-text-muted" role="status">
          {filteredNodes.length} 个节点
        </span>
      </div>
      <div className="grid gap-md md:grid-cols-2 xl:grid-cols-4">
        {filteredNodes.map((node) => (
          <KnowledgeCard key={node.id} node={node} />
        ))}
      </div>
      {filteredNodes.length === 0 ? (
        <Card className="text-center text-body text-text-secondary">
          没有匹配的知识节点；试试更换关键词或清除过滤条件。
        </Card>
      ) : null}
    </div>
  );

  const claimsTab = (
    <div className="flex flex-col gap-md">
      <p className="text-caption text-text-secondary">
        论断（Claim）与知识节点相互独立；相互矛盾的论断共存，并各自保留证据。
      </p>
      {(claims.data ?? []).map((claim) => (
        <ClaimRow
          key={claim.id}
          projectId={projectId}
          claimId={claim.id}
          subjectTitle={titleById.get(claim.subject_node_id) ?? "未知主体"}
          open={openEvidence.has(claim.id)}
          onToggle={() => toggleEvidence(claim.id)}
        />
      ))}
    </div>
  );

  return (
    <PageShell
      kicker="知识库"
      title="已提取的知识"
      description="节点是实体和概念，结论与证据单独保存。"
      actions={
        <>
          <Select
            aria-label="筛选类型"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-36"
          >
            <option value="all">全部类型</option>
            {KNOWLEDGE_NODE_TYPES.map((type) => (
              <option key={type} value={type}>
                {NODE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
          <Button variant="primary" disabled title="桌面版提供">
            导出 Vault
          </Button>
        </>
      }
      toolbar={
        sources.data ? (
          <div className="flex items-center gap-sm text-caption text-text-muted">
            <Badge variant="neutral">来源 {sources.data.length}</Badge>
            <Badge variant="neutral">知识节点 {(knowledge.data ?? []).length}</Badge>
            <Badge variant="neutral">论断 {(claims.data ?? []).length}</Badge>
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
          title: "知识库还是空的",
          description:
            "研究运行完成内容归一化后，实体、论断与证据会出现在这里。",
        }}
      >
        <Tabs
          label="知识视图"
          items={[
            { id: "nodes", label: "知识节点", content: knowledgeTab },
            { id: "claims", label: "论断与证据", content: claimsTab },
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
  const claims = useClaims(projectId);
  const evidence = useEvidence(projectId, open ? claimId : "");
  const claim = (claims.data ?? []).find((c) => c.id === claimId);
  if (!claim) return null;

  const conflicting = claim.status === "conflicting";

  return (
    <div className={conflicting ? "rounded-lg border border-warning/40 p-sm" : ""}>
      {conflicting ? (
        <Badge variant="warning" className="mb-sm">
          存在冲突：支持与反驳证据均已保留
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
          正在加载证据…
        </p>
      ) : null}
    </div>
  );
}
