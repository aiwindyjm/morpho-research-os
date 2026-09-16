"""Research configuration and plan domain types.

``ResearchConfig`` mirrors the canonical JSON Schema
``packages/schemas/research-config.v1.json`` (draft; frozen by W2-01).
Plan/section/task types implement the documented PRD domain model: the
planner only ever produces a plan ``PENDING_REVIEW``; execution requires an
explicit user approval decision.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

RESEARCH_CONFIG_SCHEMA_VERSION = "1.0"


class TimeRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_date: str | None = Field(default=None, alias="from")
    to_date: str | None = Field(default=None, alias="to")


class ResearchConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = RESEARCH_CONFIG_SCHEMA_VERSION
    project_id: str = ""
    domain: str
    topic: str
    purpose: str
    audience: str = ""
    depth: int = Field(ge=1, le=5)
    dimensions: list[str] = Field(min_length=1)
    time_range: TimeRange | None = None
    geographic_scope: str = ""
    languages: list[str] = Field(default_factory=lambda: ["en"])
    source_types: list[str] = Field(default_factory=list)
    source_domains: list[str] = Field(default_factory=list)
    update_frequency: str = "manual"

    @model_validator(mode="after")
    def _strip_inputs(self) -> "ResearchConfig":
        self.domain = self.domain.strip()
        self.topic = self.topic.strip()
        if not self.domain or not self.topic:
            raise ValueError("domain and topic must be non-empty")
        self.dimensions = [dimension.strip() for dimension in self.dimensions if dimension.strip()]
        if not self.dimensions:
            raise ValueError("at least one dimension is required")
        return self


class PlanStatus(str, Enum):
    """Plan review lifecycle. Only ``APPROVED`` plans may run."""

    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    #: Replaced by a newer plan version; kept for history.
    SUPERSEDED = "superseded"


class RuntimeTaskType(str, Enum):
    """Task types the orchestrator's DAG executes.

    ``SOURCE_EVALUATION`` and ``NORMALIZATION`` are the provided-plan
    runtimes (ADR-024): a caller-approved plan splits the section pipeline
    into search (sources only), source evaluation (content + quality + LLM
    extraction for the section's sources, inline — no dynamic fan-out), and
    normalization (entity + relation normalization plus claim/evidence
    building in one task).
    """

    SEARCH = "search"
    EXTRACT = "extract"
    NORMALIZE = "normalize"
    CLAIMS = "claims"
    VALIDATE = "validate"
    #: Vault-ready note projections from the run's knowledge nodes
    #: (deterministic composition; no LLM call required).
    WRITER = "writer"
    SOURCE_EVALUATION = "source_evaluation"
    NORMALIZATION = "normalization"


class PlannerTaskDraft(BaseModel):
    """One planned unit of work inside a section.

    Worker-planned drafts carry no runtime identity (the DAG materializes
    runtime tasks from them); drafts that arrive inside a core-approved plan
    (ADR-024) carry the core's ``task_id`` verbatim plus ``depends_on``
    edges referencing sibling task ids, and the DAG uses them unchanged."""

    model_config = ConfigDict(extra="forbid")

    title: str
    objective: str = ""
    description: str = ""
    runtime_type: RuntimeTaskType = RuntimeTaskType.SEARCH
    params: dict = Field(default_factory=dict)
    #: Core task id (provided plans only); ``None`` for worker-planned tasks.
    task_id: str | None = None
    #: Dependency edges as TASK IDS (provided plans only).
    depends_on: list[str] = Field(default_factory=list)


class ResearchSection(BaseModel):
    """One research dimension slice of a plan."""

    model_config = ConfigDict(extra="forbid")

    section_id: str
    title: str
    dimension: str
    objective: str = ""
    tasks: list[PlannerTaskDraft] = Field(default_factory=list)


class ResearchPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: str
    project_id: str = ""
    plan_version: int = 1
    status: PlanStatus = PlanStatus.PENDING_REVIEW
    #: Snapshot of the configuration this plan was generated from.
    config: ResearchConfig
    sections: list[ResearchSection] = Field(default_factory=list)
    config_fingerprint: str = ""
    reviewer_note: str = ""
    created_at: str = ""
    updated_at: str = ""

    @property
    def dimensions(self) -> list[str]:
        return [section.dimension for section in self.sections]

    def section_by_dimension(self, dimension: str) -> ResearchSection | None:
        for section in self.sections:
            if section.dimension == dimension:
                return section
        return None
