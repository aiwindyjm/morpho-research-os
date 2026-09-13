import { useMemo, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3";
import { Chip, Button, Card, Input, Select } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { NODE_TYPE_BADGE_CLASS, ResearchStatusBadge } from "@/components/cards";
import { CONFIDENCE_LABELS, NODE_TYPE_LABELS, dimensionLabel } from "@/types/labels";
import type {
  ConfidenceState,
  GraphNode,
  GraphProjection,
  KnowledgeNodeType,
} from "@/types/domain";
import { CONFIDENCE_STATES } from "@/types/domain";
import { useGraph, useKnowledge } from "@/services/queries";

/**
 * Graph view (RES-08): 2D knowledge graph with search, filters, selection,
 * and an inspector. PRD §13 filters: node type, dimension, confidence band
 * (the six confidence states), relation type (edges), and a time/year range
 * on nodes that carry a year. A clustering toggle groups nodes into
 * per-dimension columns (d3 forceX toward column positions — no new deps).
 * An accessible list/table fallback is always available (docs/frontend/
 * ACCESSIBILITY.md) and reflects the same filters; the force layout is
 * computed synchronously so rendering is deterministic and test-safe.
 *
 * Prototype alignment (spec §4, `view-graph`): one card with a chip toolbar,
 * the dark graph canvas (graph-canvas-bg) with accent-stroked node circles,
 * and an inspector overlay on the right edge from lg up.
 */

const CANVAS_WIDTH = 860;
const CANVAS_HEIGHT = 560;

/** Prototype type-filter chips; values map onto node.type. */
const TYPE_FILTERS: Array<{ id: "all" | KnowledgeNodeType; label: string }> = [
  { id: "all", label: "全部节点" },
  { id: "Concept", label: "概念" },
  { id: "Technology", label: "技术" },
  { id: "Company", label: "企业" },
  { id: "Paper", label: "论文" },
];

/** Inspector panel: scrollable content, overlay on the canvas edge from lg up. */
const INSPECTOR_BASE_CLASS =
  "mt-lg overflow-y-auto rounded-md border border-border bg-surface/95 p-lg";
const INSPECTOR_OVERLAY_CLASS =
  "lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:w-[245px] lg:rounded-none lg:border-0 lg:border-l";

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

function computeLayout(
  projection: GraphProjection,
  cluster: boolean,
): PositionedNode[] {
  const nodes: PositionedNode[] = projection.nodes.map((node, index) => {
    const angle = (index / Math.max(1, projection.nodes.length)) * Math.PI * 2;
    return {
      ...node,
      x: CANVAS_WIDTH / 2 + Math.cos(angle) * 200,
      y: CANVAS_HEIGHT / 2 + Math.sin(angle) * 160,
    };
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const links = projection.relations
    .map((relation) => ({
      source: nodeById.get(relation.source_node_id),
      target: nodeById.get(relation.target_node_id),
    }))
    .filter((link): link is { source: PositionedNode; target: PositionedNode } =>
      Boolean(link.source && link.target),
    );

  const simulation = forceSimulation<PositionedNode>(nodes)
    .force("charge", forceManyBody().strength(cluster ? -120 : -160))
    .force(
      "link",
      forceLink(links)
        .id((d) => (d as PositionedNode).id)
        .distance(cluster ? 70 : 90),
    )
    .force("center", forceCenter(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2))
    .force("collide", forceCollide<PositionedNode>((d) => 14 + d.source_count))
    .stop();

  // Clustering: pull every node toward its dimension's column position and
  // relax vertically around the canvas middle (PRD §13 group-by-dimension).
  if (cluster) {
    const dimensions = [...new Set(nodes.map((n) => n.dimension))];
    const columnX = new Map(
      dimensions.map(
        (dimension, index) =>
          [dimension, (CANVAS_WIDTH * (index + 1)) / (dimensions.length + 1)] as const,
      ),
    );
    simulation
      .force(
        "clusterX",
        forceX<PositionedNode>(
          (d) => columnX.get(d.dimension) ?? CANVAS_WIDTH / 2,
        ).strength(0.9),
      )
      .force("clusterY", forceY(CANVAS_HEIGHT / 2).strength(0.08));
  }

  // Synchronous ticks: deterministic layout without animation frames.
  for (let i = 0; i < 260; i += 1) simulation.tick();

  // Clamp inside the canvas.
  for (const node of nodes) {
    node.x = Math.max(40, Math.min(CANVAS_WIDTH - 40, node.x));
    node.y = Math.max(40, Math.min(CANVAS_HEIGHT - 40, node.y));
  }
  return nodes;
}

export function GraphPage({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useGraph(projectId);
  const { data: knowledge } = useKnowledge(projectId);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | KnowledgeNodeType>("all");
  const [dimensionFilter, setDimensionFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | ConfidenceState>("all");
  const [relationFilter, setRelationFilter] = useState("all");
  const [yearFrom, setYearFrom] = useState("all");
  const [yearTo, setYearTo] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listMode, setListMode] = useState(false);
  const [clusterMode, setClusterMode] = useState(false);

  const dimensions = useMemo(
    () => [...new Set((data?.nodes ?? []).map((n) => n.dimension))],
    [data],
  );
  /** Distinct relation predicates (edge types) present in the projection. */
  const predicates = useMemo(
    () => [...new Set((data?.relations ?? []).map((r) => r.predicate))].sort((a, b) => a.localeCompare(b, "zh")),
    [data],
  );
  /** Distinct node years for the time-range filter (ascending). */
  const years = useMemo(
    () =>
      [...new Set((data?.nodes ?? []).map((n) => n.year).filter((y): y is number => y != null))].sort(
        (a, b) => a - b,
      ),
    [data],
  );

  const filtered = useMemo(() => {
    const nodes = (data?.nodes ?? []).filter((node) => {
      if (typeFilter !== "all" && node.type !== typeFilter) return false;
      if (dimensionFilter !== "all" && node.dimension !== dimensionFilter) return false;
      if (confidenceFilter !== "all" && node.confidence !== confidenceFilter) return false;
      const from = yearFrom !== "all" ? Number(yearFrom) : null;
      const to = yearTo !== "all" ? Number(yearTo) : null;
      if (from !== null || to !== null) {
        if (node.year == null) return false;
        if (from !== null && node.year < from) return false;
        if (to !== null && node.year > to) return false;
      }
      if (!search.trim()) return true;
      const needle = search.trim().toLowerCase();
      return node.title.toLowerCase().includes(needle);
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const relations = (data?.relations ?? []).filter(
      (r) =>
        nodeIds.has(r.source_node_id) &&
        nodeIds.has(r.target_node_id) &&
        (relationFilter === "all" || r.predicate === relationFilter),
    );
    return { nodes, relations };
  }, [data, search, typeFilter, dimensionFilter, confidenceFilter, relationFilter, yearFrom, yearTo]);

  const positioned = useMemo(
    () =>
      listMode || !data
        ? []
        : computeLayout(
            { ...data, nodes: filtered.nodes, relations: filtered.relations },
            clusterMode,
          ),
    [data, filtered, listMode, clusterMode],
  );
  const positionedById = new Map(positioned.map((n) => [n.id, n]));
  const selected = data?.nodes.find((n) => n.id === selectedId) ?? null;

  const summaryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of knowledge ?? []) map.set(node.id, node.summary);
    return map;
  }, [knowledge]);

  const inspectorRelations = selected
    ? filtered.relations.filter(
        (r) => r.source_node_id === selected.id || r.target_node_id === selected.id,
      )
    : [];
  const nodeTitles = new Map((data?.nodes ?? []).map((n) => [n.id, n.title]));

  const inspectorClassName = listMode
    ? INSPECTOR_BASE_CLASS
    : `${INSPECTOR_BASE_CLASS} ${INSPECTOR_OVERLAY_CLASS}`;

  const inspector =
    selected ? (
      <GraphNodeInspector
        className={inspectorClassName}
        node={selected}
        summary={summaryById.get(selected.id)}
        relations={inspectorRelations}
        nodeTitles={nodeTitles}
        onClose={() => setSelectedId(null)}
      />
    ) : (
      <aside
        data-testid="graph-inspector"
        aria-label="图谱检查器"
        className={inspectorClassName}
      >
        <p className="text-body text-text-secondary">
          {listMode ? "点击列表中的节点查看详情。" : "点击节点查看详情。"}
        </p>
      </aside>
    );

  return (
    <PageShell
      kicker="知识图谱"
      title="研究关系地图"
      description="从节点关系回到来源和证据，而不是只看一张漂亮的图。"
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={() => setListMode((v) => !v)}>
            {listMode ? "图形视图" : "列表视图（无障碍）"}
          </Button>
          <Button size="sm" variant="primary" disabled title="桌面版提供">
            导出图片
          </Button>
        </>
      }
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={(data?.nodes ?? []).length === 0}
        empty={{
          title: "图谱还没有内容",
          description: "研究运行完成知识归一化后，实体与关系会投影成 2D 图谱。",
        }}
      >
        <Card className="pb-lg">
          <div className="flex min-h-[63px] flex-wrap items-center justify-between gap-sm border-b border-border pb-md">
            <div className="flex flex-wrap items-center gap-sm" role="group" aria-label="按类型过滤">
              {TYPE_FILTERS.map(({ id, label }) => (
                <Chip
                  key={id}
                  selected={typeFilter === id}
                  onClick={() => setTypeFilter(id)}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-sm">
              <Chip
                selected={clusterMode}
                onClick={() => setClusterMode((v) => !v)}
                data-testid="graph-cluster-toggle"
                title="按研究维度分列布局"
              >
                按维度聚类
              </Chip>
              <Input
                type="search"
                aria-label="搜索节点"
                placeholder="按标题搜索…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-[180px]"
              />
              <Select
                aria-label="按维度过滤"
                value={dimensionFilter}
                onChange={(e) => setDimensionFilter(e.target.value)}
                className="max-w-44"
              >
                <option value="all">全部维度</option>
                {dimensions.map((dimension) => (
                  <option key={dimension} value={dimension}>
                    {dimensionLabel(dimension)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="按置信状态过滤"
                value={confidenceFilter}
                onChange={(e) =>
                  setConfidenceFilter(e.target.value as "all" | ConfidenceState)
                }
                className="max-w-40"
              >
                <option value="all">全部置信</option>
                {CONFIDENCE_STATES.map((state) => (
                  <option key={state} value={state}>
                    {CONFIDENCE_LABELS[state]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="按关系类型过滤"
                value={relationFilter}
                onChange={(e) => setRelationFilter(e.target.value)}
                className="max-w-40"
              >
                <option value="all">全部关系</option>
                {predicates.map((predicate) => (
                  <option key={predicate} value={predicate}>
                    {predicate}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="起始年份"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                className="max-w-32"
              >
                <option value="all">年份从</option>
                {years.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="结束年份"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                className="max-w-32"
              >
                <option value="all">到</option>
                {years.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </Select>
              <span className="text-caption text-text-muted" role="status">
                {filtered.nodes.length} 节点 · {filtered.relations.length} 关系
              </span>
            </div>
          </div>

          {listMode ? (
            <>
              <div className="mt-lg overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-body">
                  <caption className="sr-only">知识节点列表（图谱替代视图）</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-label text-text-muted">
                      <th scope="col" className="px-md py-sm">节点</th>
                      <th scope="col" className="px-md py-sm">类型</th>
                      <th scope="col" className="px-md py-sm">维度</th>
                      <th scope="col" className="px-md py-sm">置信</th>
                      <th scope="col" className="px-md py-sm">年份</th>
                      <th scope="col" className="px-md py-sm">来源/论断</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.nodes.map((node) => (
                      <tr
                        key={node.id}
                        className={`cursor-pointer border-b border-border/60 hover:bg-surface-raised ${
                          node.id === selectedId ? "bg-accent-soft" : ""
                        }`}
                        onClick={() => setSelectedId(node.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(node.id);
                          }
                        }}
                        tabIndex={0}
                        aria-current={node.id === selectedId ? "true" : undefined}
                      >
                        <td className="px-md py-sm text-text-primary">{node.title}</td>
                        <td className="px-md py-sm text-text-secondary">
                          {NODE_TYPE_LABELS[node.type]}
                        </td>
                        <td className="px-md py-sm text-text-secondary">
                          {dimensionLabel(node.dimension)}
                        </td>
                        <td className="px-md py-sm">
                          <ResearchStatusBadge state={node.confidence} kind="confidence" />
                        </td>
                        <td className="px-md py-sm text-text-secondary">
                          {node.year ?? "—"}
                        </td>
                        <td className="px-md py-sm text-text-secondary">
                          {node.source_count}/{node.claim_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {inspector}
            </>
          ) : (
            <div
              className="graph-canvas-bg relative mt-lg min-h-[440px] overflow-hidden rounded-md"
              data-clustered={clusterMode ? "true" : "false"}
            >
              <svg
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                className="h-auto w-full"
                role="group"
                aria-label="知识图谱（2D 力导向布局）"
                data-testid="graph-canvas"
              >
                {filtered.relations.map((relation) => {
                  const source = positionedById.get(relation.source_node_id);
                  const target = positionedById.get(relation.target_node_id);
                  if (!source || !target) return null;
                  const highlighted =
                    selectedId === relation.source_node_id ||
                    selectedId === relation.target_node_id;
                  return (
                    <line
                      key={relation.id}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={
                        highlighted
                          ? "var(--morpho-color-graph-edge-active)"
                          : "var(--morpho-color-graph-edge)"
                      }
                      strokeWidth={highlighted ? 2 : 1}
                      aria-label={`关系：${source.title} ${relation.predicate} ${target.title}`}
                    />
                  );
                })}
                {positioned.map((node) => {
                  const isSelected = node.id === selectedId;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x},${node.y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${node.title}（${NODE_TYPE_LABELS[node.type]}，置信 ${CONFIDENCE_LABELS[node.confidence]}）`}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(node.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(node.id);
                        }
                      }}
                      data-testid={`graph-node-${node.title}`}
                    >
                      <circle
                        r={10 + Math.min(8, node.source_count)}
                        fill="var(--morpho-color-graph-node)"
                        stroke={
                          isSelected
                            ? "var(--morpho-color-accent)"
                            : "var(--morpho-color-graph-edge-hover)"
                        }
                        strokeWidth={isSelected ? 3 : 1.5}
                      />
                      <text
                        y={24}
                        textAnchor="middle"
                        fill="var(--morpho-color-text-secondary)"
                        style={{ fontSize: "var(--morpho-text-micro-size)" }}
                      >
                        {node.title.length > 10 ? `${node.title.slice(0, 10)}…` : node.title}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {inspector}
            </div>
          )}
        </Card>
      </PageStates>
    </PageShell>
  );
}

/** Registered business component: GraphNodeInspector. */
export function GraphNodeInspector({
  node,
  summary,
  relations,
  nodeTitles,
  onClose,
  className = "",
}: {
  node: GraphNode;
  /** knowledge.summary of the node; shown as 暂无摘要 when missing. */
  summary?: string;
  relations: Array<{ id: string; source_node_id: string; target_node_id: string; predicate: string; confidence: number }>;
  nodeTitles: Map<string, string>;
  onClose: () => void;
  className?: string;
}) {
  return (
    <aside className={className} data-testid="graph-inspector" aria-label="图谱检查器">
      <p className="kicker mb-xs">当前选择</p>
      <div className="flex items-start justify-between gap-sm">
        <h3 className="text-h3 text-text-primary">{node.title}</h3>
        <Button size="sm" variant="ghost" aria-label="关闭详情" onClick={onClose}>
          ×
        </Button>
      </div>
      <div className="mt-sm flex flex-wrap items-center gap-sm">
        <span className={`badge-mono ${NODE_TYPE_BADGE_CLASS[node.type]}`}>
          {NODE_TYPE_LABELS[node.type]}
        </span>
        <ResearchStatusBadge state={node.confidence} kind="confidence" />
      </div>
      <p className="mt-md text-caption text-text-secondary">
        {summary ?? "暂无摘要"}
      </p>
      <dl className="mt-md flex flex-col gap-xs text-caption text-text-secondary">
        <div className="flex justify-between">
          <dt>来源数量</dt>
          <dd>{node.source_count}</dd>
        </div>
        <div className="flex justify-between">
          <dt>关联关系</dt>
          <dd>{relations.length}</dd>
        </div>
      </dl>
      <h4 className="mt-md text-label text-text-secondary">关系（{relations.length}）</h4>
      <ul className="mt-xs flex flex-col gap-xs text-caption text-text-muted">
        {relations.map((relation) => {
          const otherId =
            relation.source_node_id === node.id
              ? relation.target_node_id
              : relation.source_node_id;
          const direction =
            relation.source_node_id === node.id ? "→" : "←";
          return (
            <li key={relation.id} className="flex items-center gap-xs">
              <span aria-hidden="true">{direction}</span>
              <span>{nodeTitles.get(otherId) ?? otherId}</span>
              <span>（{relation.predicate}）</span>
            </li>
          );
        })}
      </ul>
      <Button
        variant="secondary"
        className="mt-md w-full"
        disabled
        title="桌面版提供"
      >
        打开 Markdown
      </Button>
    </aside>
  );
}
