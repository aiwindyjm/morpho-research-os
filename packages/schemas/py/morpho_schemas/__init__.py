"""Pydantic bindings for the canonical Morpho Research OS JSON Schemas.

Every binding mirrors a schema file in packages/schemas and is proven equivalent
by the shared corpus under packages/schemas/fixtures/cases (see tests/test_corpus.py).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from .envelope import (
    FixtureContract,
    FixtureEnvelope,
    FixtureExpectedOutput,
    FixtureOrigin,
    FixturePrompt,
    FixtureProvenance,
    FixtureProvenanceKind,
    FixtureStability,
)
from .event import Event, EventType
from .project import (
    PlanGeneratedBy,
    Project,
    ResearchConfig,
    ResearchPlan,
    ResearchPlanStatus,
    ResearchRun,
    ResearchRunStatus,
    ResearchSection,
    ResearchTask,
    ResearchTaskStatus,
    ResearchTaskType,
    ResearchPurpose,
    TaskDependency,
    TaskDependencyCondition,
    TimeRange,
)
from .schema_version import SchemaVersionV1
from .knowledge import (
    Artifact,
    ArtifactKind,
    Claim,
    ClaimProvenance,
    Confidence,
    ContentFormat,
    Evidence,
    EvidenceDirection,
    EvidenceLocator,
    KnowledgeNode,
    KnowledgeNodeType,
    NodeStatus,
    QualityRating,
    Relation,
    RelationConfidence,
    ReviewState,
    Source,
    SourceContent,
    SourceKind,
    SourceQuality,
)
from .prompt import (
    GoldenCase,
    ModelCapability,
    ModelHint,
    PromptMetadata,
    PromptStage,
    SchemaRef,
)
from .provider import (
    EstimatedCost,
    ProviderConfig,
    ProviderKind,
    ProviderRetry,
    UsageRecord,
)
from .worker import (
    ProtocolVersion,
    WorkerCancelResponse,
    WorkerErrorBlock,
    WorkerErrorCode,
    WorkerErrorEnvelope,
    WorkerEvent,
    WorkerEventType,
    WorkerHealthResponse,
    WorkerJobProgress,
    WorkerJobRequest,
    WorkerJobResponse,
    WorkerJobStatus,
    WorkerJobType,
    WorkerVersionResponse,
)

__all__ = [
    "BINDINGS",
    "EstimatedCost",
    "Event",
    "EventType",
    "FixtureContract",
    "FixtureEnvelope",
    "FixtureExpectedOutput",
    "FixtureOrigin",
    "FixturePrompt",
    "FixtureProvenance",
    "FixtureProvenanceKind",
    "FixtureStability",
    "GoldenCase",
    "ModelCapability",
    "ModelHint",
    "PlanGeneratedBy",
    "Project",
    "PromptMetadata",
    "PromptStage",
    "ProtocolVersion",
    "ProviderConfig",
    "ProviderKind",
    "ProviderRetry",
    "ResearchConfig",
    "ResearchPlan",
    "ResearchPlanStatus",
    "ResearchPurpose",
    "ResearchRun",
    "ResearchRunStatus",
    "ResearchSection",
    "ResearchTask",
    "ResearchTaskStatus",
    "ResearchTaskType",
    "SchemaRef",
    "SchemaVersionV1",
    "TaskDependency",
    "TaskDependencyCondition",
    "TimeRange",
    "UsageRecord",
    "WorkerCancelResponse",
    "WorkerErrorBlock",
    "WorkerErrorCode",
    "WorkerErrorEnvelope",
    "WorkerEvent",
    "WorkerEventType",
    "WorkerHealthResponse",
    "WorkerJobProgress",
    "WorkerJobRequest",
    "WorkerJobResponse",
    "WorkerJobStatus",
    "WorkerJobType",
    "WorkerVersionResponse",
]

# Registry mapping canonical schema names (file stem without `.v<major>.json`)
# to their Pydantic bindings. The corpus test enforces completeness.
BINDINGS: dict[str, type[BaseModel]] = {
    "fixture-envelope": FixtureEnvelope,
    "artifact": Artifact,
    "claim": Claim,
    "evidence": Evidence,
    "event": Event,
    "knowledge-node": KnowledgeNode,
    "project": Project,
    "prompt-metadata": PromptMetadata,
    "provider-config": ProviderConfig,
    "relation": Relation,
    "research-config": ResearchConfig,
    "research-plan": ResearchPlan,
    "research-run": ResearchRun,
    "research-section": ResearchSection,
    "research-task": ResearchTask,
    "source": Source,
    "source-content": SourceContent,
    "task-dependency": TaskDependency,
    "usage-record": UsageRecord,
    "worker-cancel-response": WorkerCancelResponse,
    "worker-error": WorkerErrorEnvelope,
    "worker-event": WorkerEvent,
    "worker-health": WorkerHealthResponse,
    "worker-job-request": WorkerJobRequest,
    "worker-job-response": WorkerJobResponse,
    "worker-job-status": WorkerJobStatus,
    "worker-version": WorkerVersionResponse,
}


def validate_binding(name: str, instance: Any) -> None:
    """Validate ``instance`` against the binding registered for ``name``.

    Uses pydantic strict mode so validation matches canonical JSON Schema
    semantics exactly: inputs are parsed JSON values and are never coerced
    (e.g. the string ``"yes"`` is not accepted for a boolean field).

    Raises ``pydantic.ValidationError`` (or ``KeyError`` for an unknown name).
    """
    BINDINGS[name].model_validate(instance, strict=True)
