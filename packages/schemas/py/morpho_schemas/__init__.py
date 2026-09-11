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
    FixturePrompt,
    FixtureProvenance,
    FixtureProvenanceKind,
    FixtureStability,
)
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

__all__ = [
    "BINDINGS",
    "FixtureContract",
    "FixtureEnvelope",
    "FixturePrompt",
    "FixtureProvenance",
    "FixtureProvenanceKind",
    "FixtureStability",
    "PlanGeneratedBy",
    "Project",
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
    "SchemaVersionV1",
    "TaskDependency",
    "TaskDependencyCondition",
    "TimeRange",
]

# Registry mapping canonical schema names (file stem without `.v<major>.json`)
# to their Pydantic bindings. The corpus test enforces completeness.
BINDINGS: dict[str, type[BaseModel]] = {
    "fixture-envelope": FixtureEnvelope,
    "project": Project,
    "research-config": ResearchConfig,
    "research-plan": ResearchPlan,
    "research-run": ResearchRun,
    "research-section": ResearchSection,
    "research-task": ResearchTask,
    "task-dependency": TaskDependency,
}


def validate_binding(name: str, instance: Any) -> None:
    """Validate ``instance`` against the binding registered for ``name``.

    Raises ``pydantic.ValidationError`` (or ``KeyError`` for an unknown name).
    """
    BINDINGS[name].model_validate(instance)
