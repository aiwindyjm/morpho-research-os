from morpho_worker.clock import FakeClock
from morpho_worker.domain.claims import (
    Claim,
    ClaimConfidence,
    ClaimStatus,
    EvidenceDirection,
    ReviewState,
)
from morpho_worker.domain.extraction import (
    ExtractedClaim,
    ExtractedEntity,
    ExtractionResult,
)
from morpho_worker.domain.knowledge import KnowledgeType
from morpho_worker.interfaces import StageContext
from morpho_worker.stages.claims_stage import (
    ClaimBuilder,
    ClaimEvidenceBundle,
    RuleBasedContradictionJudge,
    ValidationStage,
    apply_review_flags,
    evidence_for_claim,
)
from morpho_worker.stages.normalization_stage import EntityNormalizer


def extraction(extraction_id, source_id, key, claims, entities=()):
    return ExtractionResult(
        extraction_id=extraction_id,
        source_id=source_id,
        url_dedup_key=key,
        entities=list(entities),
        claims=list(claims),
    )


def context():
    return StageContext(run_id="run-1", task_id="task-1", dimension="history")


def nodes_for(*names):
    ext = extraction(
        "x-nodes",
        "s-nodes",
        "k-nodes",
        [],
        entities=[ExtractedEntity(name=name, type=KnowledgeType.CONCEPT) for name in names],
    )
    return EntityNormalizer().normalize_entities([ext], context(), clock=FakeClock())


def test_claims_link_to_nodes_and_located_evidence():
    nodes = nodes_for("Quantum entanglement")
    ext = extraction(
        "x1", "s1", "k1",
        [ExtractedClaim(
            subject="Quantum entanglement",
            predicate="produces correlations",
            object_value="stronger than local models allow",
            quote="no local model can reproduce the correlations",
            section="Introduction",
            confidence=0.8,
        )],
    )
    bundle = ClaimBuilder().build_claims([ext], nodes, context(), clock=FakeClock())

    assert len(bundle.claims) == 1
    claim = bundle.claims[0]
    assert claim.subject_node_id == nodes[0].node_id
    # claim.v1.1 split: lifecycle starts as draft; evidence strength is high.
    assert claim.status is ClaimStatus.DRAFT
    assert claim.confidence is ClaimConfidence.HIGH
    assert claim.scope == "history"
    assert len(claim.evidence_ids) == 1
    evidence = evidence_for_claim(claim, bundle)
    assert evidence[0].source_id == "s1"
    assert evidence[0].direction is EvidenceDirection.SUPPORTS
    assert evidence[0].locator.quote == "no local model can reproduce the correlations"
    assert evidence[0].locator.has_locator
    assert evidence[0].extraction_method == "llm.source-extraction.v1"


def test_same_claim_from_two_sources_merges_evidence_and_can_confirm():
    nodes = nodes_for("Quantum entanglement")
    builder = ClaimBuilder()
    first = extraction(
        "x1", "s1", "k1",
        [ExtractedClaim(subject="Quantum entanglement", predicate="violates",
                        object_value="Bell inequalities", quote="violates the Bell inequality",
                        confidence=0.8)],
    )
    second = extraction(
        "x2", "s2", "k2",
        [ExtractedClaim(subject="quantum entanglement", predicate="Violates",
                        object_value="Bell Inequalities", quote="the entangled state violates Bell",
                        confidence=0.9)],
    )
    bundle = builder.build_claims([first, second], nodes, context(), clock=FakeClock())

    assert len(bundle.claims) == 1  # merged, not duplicated, not overwritten
    claim = bundle.claims[0]
    # 2 located independent sources confirm the evidence strength; the
    # lifecycle stays draft until a human reviews it.
    assert claim.confidence is ClaimConfidence.CONFIRMED
    assert claim.status is ClaimStatus.DRAFT
    assert len(claim.evidence_ids) == 2
    assert {ref.source_id for ref in claim.provenance} == {"s1", "s2"}


def test_conflicting_claims_coexist_and_enter_review():
    nodes = nodes_for("Quantum entanglement")
    ext_a = extraction("x1", "s1", "k1", [ExtractedClaim(
        subject="Quantum entanglement", predicate="requires", object_value="superposition",
        quote="requires superposition", confidence=0.8)])
    ext_b = extraction("x2", "s2", "k2", [ExtractedClaim(
        subject="Quantum entanglement", predicate="requires", object_value="classical channel",
        quote="requires a classical channel", confidence=0.7)])
    builder = ClaimBuilder()
    bundle_a = builder.build_claims([ext_a], nodes, context(), clock=FakeClock())
    bundle_b = builder.build_claims([ext_b], nodes, context(), clock=FakeClock())
    combined = ClaimEvidenceBundle(
        claims=bundle_a.claims + bundle_b.claims,
        evidence=bundle_a.evidence + bundle_b.evidence,
    )

    report = ValidationStage(clock=FakeClock()).validate(
        claims=combined.claims, nodes=nodes, context=context()
    )
    flagged = apply_review_flags(combined.claims, report)

    assert report.status == "passed_with_conflicts"
    assert len(report.conflicts) == 1
    conflict = report.conflicts[0]
    assert conflict.claim_a_id != conflict.claim_b_id
    # Both claims still exist: coexistence, not overwrite.
    assert {claim.claim_id for claim in flagged} == {
        conflict.claim_a_id, conflict.claim_b_id
    }
    # claim.v1.1: "conflicting" is the confidence state; the lifecycle
    # marks both claims needs_review.
    confidences = {claim.confidence for claim in flagged}
    assert confidences == {ClaimConfidence.CONFLICTING}
    statuses = {claim.status for claim in flagged}
    assert statuses == {ClaimStatus.NEEDS_REVIEW}
    reviews = {claim.review_state for claim in flagged}
    assert reviews == {ReviewState.NEEDS_REVIEW}


def test_claim_without_locator_never_confirmed():
    nodes = nodes_for("Concept A")
    ext = extraction("x1", "s1", "k1", [ExtractedClaim(
        subject="Concept A", predicate="relates to", object_value="Concept B",
        quote=None, section=None, confidence=0.99)])
    ext2 = extraction("x2", "s2", "k2", [ExtractedClaim(
        subject="Concept A", predicate="relates to", object_value="Concept B",
        quote=None, section=None, confidence=0.99)])
    bundle = ClaimBuilder().build_claims([ext, ext2], nodes, context(), clock=FakeClock())
    claim = bundle.claims[0]
    # Two sources, but no located evidence: confirmation is impossible.
    assert claim.confidence is not ClaimConfidence.CONFIRMED


def test_unresolvable_claims_are_dropped_with_reason():
    nodes = nodes_for("Known Concept")
    ext = extraction("x1", "s1", "k1", [ExtractedClaim(
        subject="Mystery Entity", predicate="relates to", object_value="Known Concept",
        confidence=0.5)])
    bundle = ClaimBuilder().build_claims([ext], nodes, context(), clock=FakeClock())
    assert bundle.claims == []
    assert len(bundle.dropped) == 1
    assert bundle.dropped[0].record_type == "claim"
    assert bundle.dropped[0].source_id == "s1"
    report = ValidationStage(clock=FakeClock()).validate(
        claims=bundle.claims, nodes=nodes, dropped=bundle.dropped, context=context()
    )
    assert report.counts["dropped"] == 1
    assert report.status == "passed"


def test_claim_ids_are_stable_across_runs():
    nodes = nodes_for("Stable Concept")
    ext = extraction("x1", "s1", "k1", [ExtractedClaim(
        subject="Stable Concept", predicate="has", object_value="value",
        confidence=0.5)])
    builder = ClaimBuilder()
    first = builder.build_claims([ext], nodes, context(), clock=FakeClock())
    second = builder.build_claims([ext], nodes, context(), clock=FakeClock())
    assert first.claims[0].claim_id == second.claims[0].claim_id
    assert first.evidence[0].evidence_id == second.evidence[0].evidence_id


def test_non_contradicting_same_object_claims_do_not_conflict():
    judge = RuleBasedContradictionJudge()
    nodes = nodes_for("A")
    claim_builder = ClaimBuilder()
    ext = extraction("x1", "s1", "k1", [ExtractedClaim(
        subject="A", predicate="has", object_value="value", confidence=0.5)])
    bundle = claim_builder.build_claims([ext], nodes, context(), clock=FakeClock())
    a = bundle.claims[0]
    b = a.model_copy(update={"claim_id": "other-id"})
    assert judge.contradicts(a, b) is False  # same object value: agreement
    c = a.model_copy(update={"claim_id": "third", "subject_node_id": "elsewhere"})
    assert judge.contradicts(a, c) is False  # different subjects: unrelated
