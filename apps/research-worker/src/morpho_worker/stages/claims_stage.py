"""Claim and evidence construction plus validation (RES-06, worker part).

Structure (docs/data/CLAIM_SCHEMA.md, EVIDENCE_SCHEMA.md):

    Source -> Evidence -> Claim -> Knowledge

- Claim ids are deterministic over (subject, predicate, object value): the
  same assertion extracted again merges into the same claim; evidence
  accumulates. Later claims never overwrite earlier ones - conflicting
  claims coexist and enter review.
- Every claim keeps its evidence: source reference, verbatim quote or
  precise locator, extraction method, and a support/contradict direction.
- A claim without located evidence can never reach ``confirmed`` confidence
  (RES-06 acceptance).
- Status vs confidence follow claim.v1.1 (ADR-016): ``status`` is the
  review lifecycle (freshly built claims are ``draft``) and ``confidence``
  carries the six evidence-strength states. A contradiction marks
  ``confidence=conflicting`` and ``status=needs_review`` together (see
  :func:`apply_review_flags`); the numeric extraction confidences survive on
  the evidence records.
- The contradiction judge is a port: the draft implementation is a
  deterministic rule (same subject+predicate, different object); a strong
  model judge can be injected later through the validation role.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from morpho_worker.clock import Clock
from morpho_worker.domain.claims import (
    Claim,
    ClaimConfidence,
    ClaimStatus,
    ConflictRecord,
    DroppedRecord,
    Evidence,
    EvidenceDirection,
    EvidenceLocator,
    ReviewState,
    ValidationReport,
)
from morpho_worker.domain.extraction import ExtractionResult
from morpho_worker.domain.knowledge import KnowledgeNode
from morpho_worker.ids import stable_id
from morpho_worker.interfaces import StageContext
from morpho_worker.providers.usage import utc_now_iso
from morpho_worker.stages.normalization_stage import _NameResolver


def _now(clock: Clock | None) -> str:
    return clock.now_utc().isoformat() if clock else utc_now_iso()


def _confidence_state(numeric: float, located_sources: int) -> ClaimConfidence:
    """Evidence-strength aggregation (confidence, not lifecycle).

    Agreement from >= 2 independent located sources confirms; numeric
    extraction confidence maps onto high/medium/low. ``unverified`` is the
    model default when nothing is known; this builder always has a numeric
    extraction confidence, so built claims land in low..confirmed.
    """

    if located_sources >= 2 and numeric >= 0.75:
        return ClaimConfidence.CONFIRMED
    if numeric >= 0.75:
        return ClaimConfidence.HIGH
    if numeric >= 0.5:
        return ClaimConfidence.MEDIUM
    return ClaimConfidence.LOW


@dataclass
class ClaimEvidenceBundle:
    claims: list[Claim] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    dropped: list[DroppedRecord] = field(default_factory=list)


class ClaimBuilder:
    def build_claims(
        self,
        extractions: list[ExtractionResult],
        nodes: list[KnowledgeNode],
        context: StageContext,
        *,
        clock: Clock | None = None,
    ) -> ClaimEvidenceBundle:
        now = _now(clock)
        resolver = _NameResolver(nodes)
        bundle = ClaimEvidenceBundle()
        claims: dict[str, Claim] = {}
        evidence_by_id: dict[str, Evidence] = {}
        #: Best numeric extraction confidence per claim id (the Claim model
        #: keeps only the enumerated confidence state; the merge arithmetic
        #: stays local to this build pass).
        numeric_by_claim: dict[str, float] = {}

        for extraction in sorted(extractions, key=lambda item: item.url_dedup_key):
            for raw in extraction.claims:
                subject_id = resolver.resolve(raw.subject)
                if subject_id is None:
                    # Unresolvable assertions are recorded, never silently
                    # discarded and never attached to a guessed node.
                    bundle.dropped.append(
                        DroppedRecord(
                            record_type="claim",
                            record_ref=f"{raw.subject}:{raw.predicate}:{raw.object_value}",
                            reason="subject does not resolve to a knowledge node",
                            source_id=extraction.source_id,
                        )
                    )
                    continue
                claim_id = stable_id(
                    "claim", subject_id, raw.predicate.casefold(), raw.object_value.casefold()
                )
                quote = raw.quote.strip() if raw.quote else None
                section = raw.section.strip() if raw.section else None
                locator = EvidenceLocator(
                    quote=quote or None,
                    section=section or None,
                    retrieved_at=now,
                )
                evidence_id = stable_id(
                    "evidence",
                    claim_id,
                    extraction.source_id,
                    quote or "",
                    section or "",
                )
                if evidence_id not in evidence_by_id:
                    evidence_by_id[evidence_id] = Evidence(
                        evidence_id=evidence_id,
                        claim_id=claim_id,
                        source_id=extraction.source_id,
                        locator=locator,
                        extraction_method=extraction.extraction_method,
                        direction=EvidenceDirection.SUPPORTS,
                        confidence=raw.confidence,
                        created_at=now,
                    )
                located = 1 if locator.has_locator else 0
                existing = claims.get(claim_id)
                numeric = max(numeric_by_claim.get(claim_id, 0.0), raw.confidence)
                numeric_by_claim[claim_id] = numeric
                if existing is None:
                    object_node_id = resolver.resolve(raw.object_value)
                    claims[claim_id] = Claim(
                        claim_id=claim_id,
                        subject_node_id=subject_id,
                        predicate=raw.predicate,
                        object_value=raw.object_value,
                        object_node_id=object_node_id,
                        scope=context.dimension,
                        status=ClaimStatus.DRAFT,
                        confidence=_confidence_state(numeric, located),
                        evidence_ids=[evidence_id],
                        provenance=[
                            _provenance(extraction, context)
                        ],
                        review_state=ReviewState.NONE,
                        created_at=now,
                        updated_at=now,
                    )
                else:
                    # Same assertion seen again: merge evidence and
                    # provenance. Never overwrite - coexistence is the rule.
                    evidence_ids = list(existing.evidence_ids)
                    if evidence_id not in evidence_ids:
                        evidence_ids.append(evidence_id)
                    provenance = list(existing.provenance)
                    if not any(
                        ref.extraction_id == extraction.extraction_id for ref in provenance
                    ):
                        provenance.append(_provenance(extraction, context))
                    located_sources = {
                        evidence_by_id[eid].source_id
                        for eid in evidence_ids
                        if evidence_by_id[eid].locator.has_locator
                    }
                    claims[claim_id] = existing.model_copy(
                        update={
                            "evidence_ids": evidence_ids,
                            "provenance": provenance,
                            "confidence": _confidence_state(
                                numeric, len(located_sources)
                            ),
                            "updated_at": now,
                        }
                    )

        bundle.claims = list(claims.values())
        bundle.evidence = list(evidence_by_id.values())
        return bundle


def _provenance(extraction: ExtractionResult, context: StageContext):
    from morpho_worker.domain.knowledge import ProvenanceRef

    return ProvenanceRef(
        source_id=extraction.source_id,
        extraction_id=extraction.extraction_id,
        task_id=context.task_id or None,
    )


class ContradictionJudge:
    """Port for pairwise contradiction decisions (strong model later)."""

    def contradicts(self, a: Claim, b: Claim) -> bool: ...


class RuleBasedContradictionJudge(ContradictionJudge):
    """Draft deterministic judge: same subject and predicate with different
    object values is flagged as a potential conflict for review."""

    def contradicts(self, a: Claim, b: Claim) -> bool:
        return (
            a.subject_node_id == b.subject_node_id
            and a.predicate.casefold() == b.predicate.casefold()
            and a.object_value.casefold() != b.object_value.casefold()
        )


class ValidationStage:
    def __init__(
        self, judge: ContradictionJudge | None = None, *, clock: Clock | None = None
    ) -> None:
        self._judge = judge or RuleBasedContradictionJudge()
        self._clock = clock

    def validate(
        self,
        *,
        claims: list[Claim],
        nodes: list[KnowledgeNode],
        context: StageContext,
        dropped: list[DroppedRecord] | None = None,
    ) -> ValidationReport:
        """Detect conflicts, flag review states in the report.

        The report is the review authority: flagged claim ids and conflict
        records. Nothing is deleted - conflicting claims coexist.
        """

        now = _now(self._clock)
        conflicts: list[ConflictRecord] = []
        flagged: set[str] = set()
        ordered = sorted(claims, key=lambda claim: claim.claim_id)
        for index, a in enumerate(ordered):
            for b in ordered[index + 1 :]:
                if a.claim_id == b.claim_id:
                    continue
                if self._judge.contradicts(a, b):
                    conflicts.append(
                        ConflictRecord(
                            conflict_id=stable_id("conflict", a.claim_id, b.claim_id),
                            subject_node_id=a.subject_node_id,
                            predicate=a.predicate,
                            claim_a_id=a.claim_id,
                            claim_b_id=b.claim_id,
                            note=(
                                "Conflicting claims coexist; both remain "
                                "available for review."
                            ),
                            detected_at=now,
                        )
                    )
                    flagged.update({a.claim_id, b.claim_id})

        return ValidationReport(
            run_id=context.run_id,
            status="passed_with_conflicts" if conflicts else "passed",
            counts={
                "nodes": len(nodes),
                "claims": len(claims),
                "conflicts": len(conflicts),
                "dropped": len(dropped or []),
            },
            conflicts=conflicts,
            needs_review_claim_ids=sorted(flagged),
            dropped=list(dropped or []),
            checked_at=now,
        )


def apply_review_flags(claims: list[Claim], report: ValidationReport) -> list[Claim]:
    """Return claims with conflict/review flags applied from the report.

    Conflicts touch both dimensions at once (claim.v1.1 / ADR-016): the
    evidence strength becomes ``conflicting`` and the review lifecycle moves
    to ``needs_review``. Nothing is deleted; the claim keeps its evidence.
    """

    flagged = set(report.needs_review_claim_ids)
    updated: list[Claim] = []
    for claim in claims:
        if claim.claim_id in flagged:
            updated.append(
                claim.model_copy(
                    update={
                        "status": ClaimStatus.NEEDS_REVIEW,
                        "confidence": ClaimConfidence.CONFLICTING,
                        "review_state": ReviewState.NEEDS_REVIEW,
                    }
                )
            )
        else:
            updated.append(claim)
    return updated


def evidence_for_claim(claim: Claim, bundle: ClaimEvidenceBundle) -> list[Evidence]:
    """Auditability helper: evidence records backing one claim."""

    index = {evidence.evidence_id: evidence for evidence in bundle.evidence}
    return [
        index[evidence_id]
        for evidence_id in claim.evidence_ids
        if evidence_id in index
    ]
