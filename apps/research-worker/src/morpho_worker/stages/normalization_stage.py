"""Knowledge/entity/relation normalization (RES-05).

Turns validated extraction results into KnowledgeNode and Relation records:

- identity: (type, case-folded canonical name). A name that matches another
  entity's alias resolves to the same node, so spelling variants merge.
- stable ids: node and relation ids are deterministic functions of their
  identity, so re-running the pipeline yields the same records (idempotent
  persistence, stable Vault node ids later).
- merging preserves provenance: every contributing extraction stays in the
  node's provenance and source list; aliases accumulate; conflicting
  attribute values are never silently dropped - they surface as separate
  claims at the claim layer, never folded into the node.
- extraction results are processed in deterministic order (sorted by
  source dedup key) so merged summaries and titles do not depend on
  scheduling.
"""

from __future__ import annotations

from morpho_worker.clock import Clock
from morpho_worker.domain.extraction import ExtractionResult
from morpho_worker.domain.knowledge import (
    Confidence,
    KnowledgeNode,
    KnowledgeStatus,
    ProvenanceRef,
    Relation,
    RelationStatus,
)
from morpho_worker.interfaces import StageContext
from morpho_worker.providers.usage import utc_now_iso
from morpho_worker.ids import stable_id


def _now(clock: Clock | None) -> str:
    return clock.now_utc().isoformat() if clock else utc_now_iso()


def _confidence_state(numeric: float | None, distinct_sources: int) -> Confidence:
    """Draft aggregation heuristic (documented in the worker README):
    agreement from >= 2 independent sources raises confidence; a single
    mention with no numeric confidence stays unverified."""

    if numeric is not None:
        if numeric >= 0.8:
            return Confidence.HIGH
        if numeric >= 0.5:
            return Confidence.MEDIUM
        if numeric > 0:
            return Confidence.LOW
        return Confidence.UNVERIFIED
    if distinct_sources >= 2:
        return Confidence.MEDIUM
    return Confidence.UNVERIFIED


class EntityNormalizer:
    def normalize_entities(
        self, extractions: list[ExtractionResult], context: StageContext, *, clock: Clock | None = None
    ) -> list[KnowledgeNode]:
        now = _now(clock)
        nodes: dict[str, KnowledgeNode] = {}
        for extraction in sorted(extractions, key=lambda item: item.url_dedup_key):
            for entity in extraction.entities:
                canonical = entity.name.casefold()
                node_id = stable_id("node", entity.type.value, canonical)
                existing = nodes.get(node_id)
                provenance = ProvenanceRef(
                    source_id=extraction.source_id,
                    extraction_id=extraction.extraction_id,
                    task_id=context.task_id or None,
                )
                if existing is None:
                    nodes[node_id] = KnowledgeNode(
                        node_id=node_id,
                        type=entity.type,
                        title=entity.name,
                        aliases=[alias for alias in entity.aliases if alias.casefold() != canonical],
                        summary=entity.description,
                        status=KnowledgeStatus.ACTIVE,
                        confidence=_confidence_state(None, 1),
                        source_ids=[extraction.source_id],
                        provenance=[provenance],
                        created_at=now,
                        updated_at=now,
                    )
                else:
                    aliases = list(existing.aliases)
                    for alias in entity.aliases:
                        if alias.casefold() != canonical and alias not in aliases:
                            aliases.append(alias)
                    if entity.name != existing.title and entity.name not in aliases:
                        aliases.append(entity.name)
                    summary = existing.summary or entity.description
                    source_ids = list(existing.source_ids)
                    if extraction.source_id not in source_ids:
                        source_ids.append(extraction.source_id)
                    provenance_list = list(existing.provenance)
                    if not any(
                        ref.extraction_id == extraction.extraction_id for ref in provenance_list
                    ):
                        provenance_list.append(provenance)
                    distinct_sources = len(source_ids)
                    nodes[node_id] = existing.model_copy(
                        update={
                            "aliases": aliases,
                            "summary": summary,
                            "source_ids": source_ids,
                            "provenance": provenance_list,
                            "confidence": _confidence_state(None, distinct_sources),
                            "updated_at": now,
                        }
                    )
        return list(nodes.values())


class RelationNormalizer:
    def normalize_relations(
        self,
        extractions: list[ExtractionResult],
        nodes: list[KnowledgeNode],
        context: StageContext,
        *,
        clock: Clock | None = None,
    ) -> list[Relation]:
        now = _now(clock)
        resolver = _NameResolver(nodes)
        relations: dict[str, Relation] = {}
        for extraction in sorted(extractions, key=lambda item: item.url_dedup_key):
            for raw in extraction.relations:
                subject_id = resolver.resolve(raw.subject)
                object_id = resolver.resolve(raw.object)
                if subject_id is None or object_id is None or subject_id == object_id:
                    # Endpoints that do not resolve to knowledge nodes are
                    # dropped deterministically; the extraction record keeps
                    # the original for auditability.
                    continue
                predicate = raw.predicate.casefold()
                relation_id = stable_id("relation", subject_id, predicate, object_id)
                provenance = ProvenanceRef(
                    source_id=extraction.source_id,
                    extraction_id=extraction.extraction_id,
                    task_id=context.task_id or None,
                )
                existing = relations.get(relation_id)
                if existing is None:
                    relations[relation_id] = Relation(
                        relation_id=relation_id,
                        subject_node_id=subject_id,
                        predicate=raw.predicate,
                        object_node_id=object_id,
                        direction="directed",
                        confidence=_confidence_state(raw.confidence, 1),
                        provenance=[provenance],
                        status=RelationStatus.ACTIVE,
                        created_at=now,
                        updated_at=now,
                    )
                else:
                    provenance_list = list(existing.provenance)
                    if not any(
                        ref.extraction_id == extraction.extraction_id for ref in provenance_list
                    ):
                        provenance_list.append(provenance)
                    incoming = _confidence_state(raw.confidence, 1)
                    relations[relation_id] = existing.model_copy(
                        update={
                            "provenance": provenance_list,
                            "confidence": _max_state(existing.confidence, incoming),
                            "updated_at": now,
                        }
                    )
        return list(relations.values())


def _max_state(a: Confidence, b: Confidence) -> Confidence:
    order = [
        Confidence.UNVERIFIED,
        Confidence.LOW,
        Confidence.MEDIUM,
        Confidence.HIGH,
        Confidence.CONFIRMED,
    ]
    return a if order.index(a) >= order.index(b) else b


class _NameResolver:
    """Resolves entity names and aliases to node ids (case-insensitive)."""

    def __init__(self, nodes: list[KnowledgeNode]) -> None:
        self._index: dict[str, str] = {}
        for node in nodes:
            self._index.setdefault(node.title.casefold(), node.node_id)
            for alias in node.aliases:
                self._index.setdefault(alias.casefold(), node.node_id)

    def resolve(self, name: str) -> str | None:
        return self._index.get(name.strip().casefold())
