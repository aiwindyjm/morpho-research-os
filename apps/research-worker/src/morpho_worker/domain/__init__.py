"""Domain layer: documented research data contracts as typed models.

These types implement the data contracts in ``docs/DATA_MODEL.md`` and
``docs/data/*.md`` (draft until W2-01/W2-06 freeze them). The worker
produces and validates these records; persisting them is the Rust core's
job via the worker protocol.
"""

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
from morpho_worker.domain.knowledge import (
    Confidence,
    KnowledgeNode,
    KnowledgeStatus,
    KnowledgeType,
    ProvenanceRef,
    Relation,
    RelationStatus,
)
from morpho_worker.domain.research import (
    PlanStatus,
    ResearchConfig,
    ResearchPlan,
    ResearchSection,
    RuntimeTaskType,
    TimeRange,
)
from morpho_worker.domain.source import (
    Source,
    SourceContent,
    SourceQuality,
    SourceType,
)

__all__ = [
    "Claim",
    "ClaimConfidence",
    "ClaimStatus",
    "ConflictRecord",
    "Confidence",
    "DroppedRecord",
    "Evidence",
    "EvidenceDirection",
    "EvidenceLocator",
    "KnowledgeNode",
    "KnowledgeStatus",
    "KnowledgeType",
    "PlanStatus",
    "ProvenanceRef",
    "Relation",
    "RelationStatus",
    "ResearchConfig",
    "ResearchPlan",
    "ResearchSection",
    "ReviewState",
    "RuntimeTaskType",
    "Source",
    "SourceContent",
    "SourceQuality",
    "SourceType",
    "TimeRange",
    "ValidationReport",
]
