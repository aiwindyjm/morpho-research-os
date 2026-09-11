from morpho_worker.clock import FakeClock
from morpho_worker.domain.extraction import (
    ExtractedEntity,
    ExtractedRelation,
    ExtractionResult,
)
from morpho_worker.domain.knowledge import Confidence, KnowledgeType, KnowledgeStatus
from morpho_worker.interfaces import StageContext
from morpho_worker.stages.normalization_stage import (
    EntityNormalizer,
    RelationNormalizer,
    _NameResolver,
)


def extraction(
    extraction_id="x1",
    source_id="s1",
    url_dedup_key="k1",
    entities=(),
    relations=(),
):
    return ExtractionResult(
        extraction_id=extraction_id,
        source_id=source_id,
        url_dedup_key=url_dedup_key,
        entities=list(entities),
        relations=list(relations),
    )


def context():
    return StageContext(run_id="run-1", task_id="task-1", dimension="history")


def test_same_entity_from_two_sources_merges_with_provenance():
    first = extraction(
        extraction_id="x1",
        source_id="s1",
        url_dedup_key="k1",
        entities=[ExtractedEntity(name="Quantum entanglement", type=KnowledgeType.CONCEPT,
                                  aliases=["entanglement"], description="Correlated quantum state.")],
    )
    second = extraction(
        extraction_id="x2",
        source_id="s2",
        url_dedup_key="k2",
        entities=[ExtractedEntity(name="quantum entanglement", type=KnowledgeType.CONCEPT,
                                  aliases=["spooky action"], description="Nonlocal correlation.")],
    )
    nodes = EntityNormalizer().normalize_entities([first, second], context(), clock=FakeClock())

    assert len(nodes) == 1
    node = nodes[0]
    assert node.node_id  # stable id
    assert node.title == "Quantum entanglement"  # deterministic first-seen spelling
    # All alternate spellings survive as aliases (the exact-case canonical
    # spelling is not duplicated); nothing is silently dropped.
    assert set(node.aliases) == {"entanglement", "quantum entanglement", "spooky action"}
    assert node.source_ids == ["s1", "s2"]
    assert [ref.extraction_id for ref in node.provenance] == ["x1", "x2"]
    assert node.confidence is Confidence.MEDIUM  # two independent sources agree
    assert node.status is KnowledgeStatus.ACTIVE
    assert node.summary == "Correlated quantum state."  # deterministic pick, no silent merge


def test_node_ids_are_stable_across_runs():
    ext = extraction(
        entities=[ExtractedEntity(name="Bell test", type=KnowledgeType.EXPERIMENT)]
    )
    normalizer = EntityNormalizer()
    first = normalizer.normalize_entities([ext], context(), clock=FakeClock())
    second = normalizer.normalize_entities([ext], context(), clock=FakeClock())
    assert first[0].node_id == second[0].node_id


def test_alias_name_resolves_to_existing_node():
    nodes = EntityNormalizer().normalize_entities(
        [extraction(entities=[ExtractedEntity(name="John Bell", type=KnowledgeType.PERSON,
                                              aliases=["J.S. Bell"])])],
        context(),
        clock=FakeClock(),
    )
    resolver = _NameResolver(nodes)
    assert resolver.resolve("J.S. Bell") == nodes[0].node_id
    assert resolver.resolve("john bell") == nodes[0].node_id
    assert resolver.resolve("Nobody") is None


def test_single_source_entity_stays_unverified():
    nodes = EntityNormalizer().normalize_entities(
        [extraction(entities=[ExtractedEntity(name="Concept X", type=KnowledgeType.CONCEPT)])],
        context(),
        clock=FakeClock(),
    )
    assert nodes[0].confidence is Confidence.UNVERIFIED


def test_relations_resolve_to_nodes_and_dedup_by_triple():
    nodes = EntityNormalizer().normalize_entities(
        [extraction(entities=[
            ExtractedEntity(name="John Bell", type=KnowledgeType.PERSON, aliases=["J.S. Bell"]),
            ExtractedEntity(name="Bell test", type=KnowledgeType.EXPERIMENT),
        ])],
        context(),
        clock=FakeClock(),
    )
    relation_normalizer = RelationNormalizer()
    relations = relation_normalizer.normalize_relations(
        [
            extraction(
                extraction_id="x1", source_id="s1", url_dedup_key="k1",
                relations=[ExtractedRelation(subject="John Bell", predicate="derived",
                                             object="Bell test", confidence=0.9)],
            ),
            extraction(
                extraction_id="x2", source_id="s2", url_dedup_key="k2",
                relations=[ExtractedRelation(subject="J.S. Bell", predicate="Derived",
                                             object="Bell test", confidence=0.6)],
            ),
        ],
        nodes,
        context(),
        clock=FakeClock(),
    )
    assert len(relations) == 1  # same triple via alias merges into one relation
    relation = relations[0]
    assert relation.predicate == "derived"  # first-seen spelling kept
    assert relation.subject_node_id == resolver_bell_node_id(nodes)
    assert relation.object_node_id == resolver_test_node_id(nodes)
    assert len(relation.provenance) == 2  # provenance union preserved
    assert relation.confidence is Confidence.HIGH  # max aggregation


def resolver_bell_node_id(nodes):
    from morpho_worker.stages.normalization_stage import _NameResolver

    return _NameResolver(nodes).resolve("John Bell")


def resolver_test_node_id(nodes):
    from morpho_worker.stages.normalization_stage import _NameResolver

    return _NameResolver(nodes).resolve("Bell test")


def test_relations_with_unresolved_endpoints_are_dropped_deterministically():
    nodes = EntityNormalizer().normalize_entities(
        [extraction(entities=[ExtractedEntity(name="John Bell", type=KnowledgeType.PERSON)])],
        context(),
        clock=FakeClock(),
    )
    relations = RelationNormalizer().normalize_relations(
        [extraction(relations=[
            ExtractedRelation(subject="John Bell", predicate="cites", object="Unknown Paper"),
            ExtractedRelation(subject="Ghost", predicate="cites", object="John Bell"),
            ExtractedRelation(subject="John Bell", predicate="self", object="John Bell"),
        ])],
        nodes,
        context(),
        clock=FakeClock(),
    )
    assert relations == []
