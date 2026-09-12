"""Writer stage tests: vault-ready note projections (PRD section 10).

Covers the exact frontmatter field set, ``[[wikilink]]`` generation from
the run's relations, the Claims section with evidence locators, and the
deterministic/idempotent composition. No LLM, no network.
"""

from morpho_worker.clock import FakeClock
from morpho_worker.domain.claims import (
    Claim,
    ClaimConfidence,
    ClaimStatus,
    Evidence,
    EvidenceDirection,
    EvidenceLocator,
)
from morpho_worker.domain.knowledge import (
    Confidence,
    KnowledgeNode,
    KnowledgeStatus,
    KnowledgeType,
    Relation,
    RelationStatus,
)
from morpho_worker.interfaces import InMemoryResultSink
from morpho_worker.stages.writer_stage import (
    FRONTMATTER_FIELDS,
    WriterStage,
    wikilink,
)


def node(node_id: str, title: str, *, summary: str = "", type_=KnowledgeType.CONCEPT):
    return KnowledgeNode(
        node_id=node_id,
        type=type_,
        title=title,
        summary=summary,
        status=KnowledgeStatus.ACTIVE,
        confidence=Confidence.UNVERIFIED,
        source_ids=[f"src-{node_id}"],
    )


def relation(relation_id: str, subject: str, predicate: str, obj: str):
    return Relation(
        relation_id=relation_id,
        subject_node_id=subject,
        predicate=predicate,
        object_node_id=obj,
        status=RelationStatus.ACTIVE,
    )


def make_writer_material():
    nodes = [
        node("n-entanglement", "Quantum entanglement", summary="Correlated quantum state."),
        node("n-bell", "Bell inequality", type_=KnowledgeType.EXPERIMENT),
        node("n-cern", "CERN", type_=KnowledgeType.ORGANIZATION),
    ]
    relations = [
        relation("r-1", "n-entanglement", "violates", "n-bell"),
        relation("r-2", "n-entanglement", "studied at", "n-cern"),
        relation("r-3", "n-bell", "derived at", "n-cern"),
    ]
    claim = Claim.model_validate(
        {
            "claim_id": "c-1",
            "subject_node_id": "n-entanglement",
            "predicate": "produces correlations",
            "object_value": "stronger than local models allow",
            "status": "draft",
            "confidence": "high",
            "evidence_ids": ["e-1"],
        }
    )
    evidence = Evidence(
        evidence_id="e-1",
        claim_id="c-1",
        source_id="s-1",
        locator=EvidenceLocator(
            quote="no local model can reproduce the correlations",
            section="Introduction",
        ),
        extraction_method="llm.source-extraction.v1",
        direction=EvidenceDirection.SUPPORTS,
    )
    return nodes, relations, [claim], [evidence]


def test_frontmatter_field_set_matches_prd_section_10():
    nodes, relations, claims, evidence = make_writer_material()
    notes = WriterStage().build_notes(nodes, relations, claims, evidence)
    assert len(notes) == 3
    note = [n for n in notes if n.node_id == "n-entanglement"][0]
    # Exactly the documented field set, in the documented order.
    assert FRONTMATTER_FIELDS == (
        "schema_version", "node_id", "type", "title", "aliases", "tags",
        "confidence", "status", "source_ids", "claim_ids", "created_at",
        "updated_at",
    )
    assert list(note.frontmatter()) == list(FRONTMATTER_FIELDS)
    assert note.schema_version == "1.0"
    assert note.type == "concept"
    assert note.tags == ["concept"]
    assert note.confidence == "unverified"
    assert note.status == "active"
    assert note.claim_ids == ["c-1"]
    assert note.created_at and note.updated_at


def test_wikilinks_generated_from_outgoing_relations():
    nodes, relations, claims, evidence = make_writer_material()
    notes = WriterStage().build_notes(nodes, relations, claims, evidence)
    by_id = {note.node_id: note for note in notes}

    entanglement = by_id["n-entanglement"]
    assert wikilink("Bell inequality") in entanglement.body
    assert wikilink("CERN") in entanglement.body
    assert "(violates)" in entanglement.body and "(studied at)" in entanglement.body
    # Outgoing only: CERN has no outgoing edges, so no Related section.
    assert "## Related" not in by_id["n-cern"].body
    assert "## Related" in by_id["n-bell"].body
    assert wikilink("CERN") in by_id["n-bell"].body


def test_claims_section_lists_claims_with_evidence_locators():
    nodes, relations, claims, evidence = make_writer_material()
    notes = WriterStage().build_notes(nodes, relations, claims, evidence)
    note = [n for n in notes if n.node_id == "n-entanglement"][0]

    assert "## Claims" in note.body
    assert "**produces correlations**: stronger than local models allow" in note.body
    assert "confidence: high" in note.body and "status: draft" in note.body
    # Evidence locator: verbatim quote plus source reference.
    assert "[supports] no local model can reproduce the correlations (s-1)" in note.body
    # Claims about other nodes do not leak into this note.
    bell_note = [n for n in notes if n.node_id == "n-bell"][0]
    assert "## Claims" not in bell_note.body


def test_render_markdown_produces_frontmatter_block():
    nodes, relations, claims, evidence = make_writer_material()
    notes = WriterStage().build_notes(nodes, relations, claims, evidence)
    note = [n for n in notes if n.node_id == "n-entanglement"][0]
    text = note.render_markdown()
    assert text.startswith("---\n")
    frontmatter_block = text.split("---")[1]
    for field in FRONTMATTER_FIELDS:
        assert f"{field}:" in frontmatter_block
    assert "## Summary" in text


def test_composition_is_deterministic_and_sink_persistence_is_idempotent():
    nodes, relations, claims, evidence = make_writer_material()
    stage = WriterStage()
    first = stage.build_notes(nodes, relations, claims, evidence, clock=FakeClock())
    second = stage.build_notes(nodes, relations, claims, evidence, clock=FakeClock())
    assert [note.render_markdown() for note in first] == [
        note.render_markdown() for note in second
    ]

    sink = InMemoryResultSink()
    for note in first:
        sink.persist("note", note)
    for note in second:
        sink.persist("note", note)
    assert len(sink.all("note")) == len(nodes)  # no duplicates by node id


def test_conflicting_claim_projects_both_states():
    nodes, relations, _claims, evidence = make_writer_material()
    conflicting = Claim.model_validate(
        {
            "claim_id": "c-2",
            "subject_node_id": "n-entanglement",
            "predicate": "produces correlations",
            "object_value": "weaker than classical models predict",
            "status": "needs_review",
            "confidence": "conflicting",
            "evidence_ids": ["e-2"],
        }
    )
    evidence = evidence + [
        Evidence(
            evidence_id="e-2",
            claim_id="c-2",
            source_id="s-2",
            locator=EvidenceLocator(section="Claims"),
            extraction_method="llm.source-extraction.v1",
        )
    ]
    notes = WriterStage().build_notes(nodes, relations, [conflicting], evidence)
    note = [n for n in notes if n.node_id == "n-entanglement"][0]
    assert "confidence: conflicting" in note.body
    assert "status: needs_review" in note.body
    assert note.claim_ids == ["c-2"]
    assert ClaimConfidence.CONFLICTING.value == "conflicting"
    assert ClaimStatus.NEEDS_REVIEW.value == "needs_review"


def test_optional_note_draft_prompt_asset_loads_and_is_unused_by_default():
    """The writing prompt exists for a later, user-opted narrative pass.

    The deterministic writer stage never renders it; this test only pins
    the asset contract (ADR-018 frontmatter parses, declares the right id
    and version, and renders with strict substitution).
    """

    from morpho_worker.pipeline.prompts import PromptRegistry

    registry = PromptRegistry()
    asset = registry.load("writing.note-draft", version=1)
    assert asset.metadata["prompt_id"] == "writing.note-draft"
    assert asset.metadata["version"] == 1
    assert asset.metadata["model_hint"]  # routing hint only, no vendor
    assert "unused-by-default" in str(asset.metadata.get("notes", {}).get("status", ""))
    _meta, rendered = registry.render(
        "writing.note-draft",
        {"title": "T", "summary": "S", "claims": "C"},
    )
    assert "T" in rendered and "S" in rendered and "C" in rendered
