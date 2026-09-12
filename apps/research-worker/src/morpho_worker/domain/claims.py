"""Claim and evidence layer plus the validation report.

Claim ≠ Knowledge: claims are assertions kept as separate records with their
evidence (docs/data/CLAIM_SCHEMA.md, EVIDENCE_SCHEMA.md). Conflicting claims
coexist with their evidence and review state; later claims never overwrite
earlier ones. Evidence links a claim to a source with a precise locator and
a support/contradict direction.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from morpho_worker.domain.knowledge import Confidence, ProvenanceRef


class ClaimStatus(str, Enum):
    """Claim confidence/lifecycle states mirror the documented states."""

    CONFIRMED = "confirmed"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNVERIFIED = "unverified"
    CONFLICTING = "conflicting"


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
    status: ClaimStatus = ClaimStatus.UNVERIFIED
    #: Optional numeric confidence alongside the enumerated state.
    confidence: float | None = Field(default=None, ge=0, le=1)
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
