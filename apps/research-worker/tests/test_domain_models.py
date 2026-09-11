import pytest
from pydantic import ValidationError

from morpho_worker.domain import (
    Claim,
    ClaimStatus,
    Evidence,
    EvidenceDirection,
    EvidenceLocator,
    KnowledgeNode,
    KnowledgeType,
    PlanStatus,
    ProvenanceRef,
    ResearchConfig,
    ResearchPlan,
    RuntimeTaskType,
    Source,
    SourceType,
    TimeRange,
)
from morpho_worker.ids import content_fingerprint
from morpho_worker.interfaces import InMemoryResultSink


def minimal_config(**overrides):
    data = {
        "domain": "physics",
        "topic": "quantum entanglement",
        "purpose": "learning",
        "depth": 3,
        "dimensions": ["concepts", "history"],
        "languages": ["en"],
        "source_types": ["paper", "web_page"],
    }
    data.update(overrides)
    return ResearchConfig.model_validate(data)


def test_research_config_matches_documented_schema_shape():
    config = minimal_config()
    assert config.schema_version == "1.0"
    assert config.time_range is None
    assert config.update_frequency == "manual"


def test_research_config_rejects_out_of_contract_values():
    with pytest.raises(ValidationError):
        minimal_config(depth=0)
    with pytest.raises(ValidationError):
        minimal_config(depth=6)
    with pytest.raises(ValidationError):
        minimal_config(dimensions=[])
    with pytest.raises(ValidationError):
        minimal_config(topic="   ")
    with pytest.raises(ValidationError):
        minimal_config(unknown="field")


def test_research_config_time_range_aliases():
    config = minimal_config(time_range={"from": "2020-01-01", "to": "2024-12-31"})
    assert isinstance(config.time_range, TimeRange)
    assert config.time_range.from_date == "2020-01-01"


def test_plan_defaults_to_pending_review():
    config = minimal_config()
    plan = ResearchPlan(plan_id="plan-1", config=config)
    assert plan.status is PlanStatus.PENDING_REVIEW
    assert plan.plan_version == 1


def test_knowledge_types_cover_documented_set():
    expected = {
        "concept", "person", "organization", "company", "paper", "book",
        "experiment", "event", "technology", "product", "application",
        "policy", "dataset", "controversy",
    }
    assert expected == {member.value for member in KnowledgeType}


def test_claim_and_evidence_are_independent_records():
    claim = Claim(
        claim_id="c1",
        subject_node_id="n1",
        predicate="has_property",
        object_value="nonlocal correlation",
    )
    assert claim.status is ClaimStatus.UNVERIFIED
    evidence = Evidence(
        evidence_id="e1",
        claim_id="c1",
        source_id="s1",
        locator=EvidenceLocator(quote="spooky action at a distance"),
        extraction_method="search.snippet.v1",
        direction=EvidenceDirection.SUPPORTS,
    )
    assert evidence.claim_id == claim.claim_id
    assert evidence.direction is EvidenceDirection.SUPPORTS
    assert claim.evidence_ids == []  # linkage is maintained above, not inline


def test_evidence_locator_requires_position_information_for_confirmation_paths():
    empty = EvidenceLocator()
    assert empty.has_locator is False
    located = EvidenceLocator(url_fragment="#theorem-1")
    assert located.has_locator is True


def test_provenance_requires_at_least_one_reference():
    with pytest.raises(ValidationError):
        ProvenanceRef()
    ref = ProvenanceRef(source_id="s1", extraction_id="x1")
    assert ref.source_id == "s1"


def test_source_defaults_and_dedup_key_field():
    source = Source(
        source_id="s1",
        url="https://example.com/a",
        canonical_url="https://example.com/a",
        url_dedup_key=content_fingerprint("https://example.com/a"),
        title="Example",
    )
    assert source.source_type is SourceType.WEB_PAGE
    assert source.quality is None
    assert source.url_dedup_key


def test_runtime_task_types_cover_pipeline():
    assert {member.value for member in RuntimeTaskType} == {
        "search", "extract", "normalize", "claims", "validate",
    }


def test_in_memory_sink_is_idempotent_by_identity():
    sink = InMemoryResultSink()
    first = Source(
        source_id="s1", url="u", canonical_url="u", url_dedup_key="k1", title="t"
    )
    second = Source(
        source_id="s1", url="u", canonical_url="u", url_dedup_key="k1", title="t2"
    )
    other = Source(
        source_id="s2", url="u2", canonical_url="u2", url_dedup_key="k2", title="x"
    )
    assert sink.persist("source", first) == "s1"
    sink.persist("source", second)
    sink.persist("source", other)
    stored = sink.all("source")
    assert len(stored) == 2
    assert sink.get("source", "s1").title == "t2"


def test_node_type_field_is_typed_enum():
    with pytest.raises(ValidationError):
        KnowledgeNode(node_id="n1", type="brand", title="Not a type")
    node = KnowledgeNode(node_id="n1", type=KnowledgeType.CONCEPT, title="Entanglement")
    assert node.confidence.value == "unverified"
