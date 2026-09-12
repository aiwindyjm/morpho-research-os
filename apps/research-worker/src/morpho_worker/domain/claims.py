"""Claim and evidence layer plus the validation report.

Claim ≠ Knowledge: claims are assertions kept as separate records with their
evidence (docs/data/CLAIM_SCHEMA.md, EVIDENCE_SCHEMA.md). Conflicting claims
coexist with their evidence and review state; later claims never overwrite
earlier ones. Evidence links a claim to a source with a precise locator and
a support/contradict direction.

Status vs confidence (claim.v1.1, ADR-016): ``status`` is the *review
lifecycle* (draft → needs_review → confirmed/superseded) and ``confidence``
is the *evidence strength* with the six PRD §6 states (confirmed, high,
medium, low, unverified — the default — and conflicting). Where ``conflicting``
now lives: it is a confidence state, not a lifecycle state. The validation
flow marks both dimensions at once — a claim involved in a contradiction gets
``confidence=conflicting`` *and* ``status=needs_review`` — so the coexistence
semantics are preserved while the fields stay single-purpose. The
pre-conflict evidence strength remains recoverable from the claim's evidence
records, which keep their own numeric confidences.

Both fields keep their JSON keys ``status`` and ``confidence``.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from morpho_worker.domain.knowledge import Confidence, ProvenanceRef

#: Evidence-strength states for claims. Identical to the knowledge-node
#: contract (PRD §6 defines one shared state set); the alias keeps claim
#: code reading "claim confidence" instead of "node confidence".
ClaimConfidence = Confidence


class ClaimStatus(str, Enum):
    """Review lifecycle (claim.v1.1): only ``confirmed`` is a human verdict.

    ``draft`` claims are freshly extracted and unreviewed; ``needs_review``
    flags review-pending claims (conflicts among them); ``superseded`` claims
    were replaced and are kept for history.
    """

    DRAFT = "draft"
    NEEDS_REVIEW = "needs_review"
    CONFIRMED = "confirmed"
    SUPERSEDED = "superseded"


class ReviewState(str, Enum):
    NONE = "none"
    NEEDS_REVIEW = "needs_review"
    REVIEWED = "reviewed"


class Claim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: str
    subject_node_id: str
    predicate: str
    #: Object entity or literal value of the assertion.
    object_value: str
    object_node_id: str | None = None
    scope: str = ""
    #: Review lifecycle (draft by default for freshly extracted claims).
    status: ClaimStatus = ClaimStatus.DRAFT
    #: Evidence strength (six PRD §6 states; unverified when nothing is
    #: known). Numeric extraction confidences live on evidence records.
    confidence: ClaimConfidence = ClaimConfidence.UNVERIFIED
    evidence_ids: list[str] = Field(default_factory=list)
    provenance: list[ProvenanceRef] = Field(default_factory=list)
    review_state: ReviewState = ReviewState.NONE
    created_at: str = ""
    updated_at: str = ""


class EvidenceDirection(str, Enum):
    SUPPORTS = "supports"
    CONTRADICTS = "contradicts"


class EvidenceLocator(BaseModel):
    """Precise locator inside the source. A quote, section, or URL fragment
    is required so the claim can be audited (RES-06: no locator, no
    confirmed status)."""

    model_config = ConfigDict(extra="forbid")

    quote: str | None = None
    section: str | None = None
    url_fragment: str | None = None
    position: str | None = None
    retrieved_at: str = ""

    @property
    def has_locator(self) -> bool:
        return any([self.quote, self.section, self.url_fragment, self.position])


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_id: str
    claim_id: str
    source_id: str
    locator: EvidenceLocator
    #: Draft method labels, e.g. "llm.source-extraction.v1" or
    #: "search.snippet.v1"; frozen by W2-04.
    extraction_method: str
    direction: EvidenceDirection = EvidenceDirection.SUPPORTS
    confidence: float | None = Field(default=None, ge=0, le=1)
    created_at: str = ""


class ConflictRecord(BaseModel):
    """Two coexisting claims that contradict each other. Nothing is deleted;
    the pair is surfaced for review."""

    model_config = ConfigDict(extra="forbid")

    conflict_id: str
    subject_node_id: str
    predicate: str
    claim_a_id: str
    claim_b_id: str
    note: str = ""
    detected_at: str = ""


class DroppedRecord(BaseModel):
    """A record rejected by validation, kept with its reason. Validation
    never silently discards material."""

    model_config = ConfigDict(extra="forbid")

    record_type: str
    record_ref: str
    reason: str
    source_id: str | None = None


class ValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    status: Literal["passed", "passed_with_conflicts", "failed"] = "passed"
    counts: dict[str, int] = Field(default_factory=dict)
    conflicts: list[ConflictRecord] = Field(default_factory=list)
    needs_review_claim_ids: list[str] = Field(default_factory=list)
    needs_review_node_ids: list[str] = Field(default_factory=list)
    dropped: list[DroppedRecord] = Field(default_factory=list)
    checked_at: str = ""
