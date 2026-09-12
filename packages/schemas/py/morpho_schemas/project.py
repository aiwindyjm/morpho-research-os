"""Project, research configuration, plan, section, task, dependency, and run bindings."""

from __future__ import annotations

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema_version import SchemaVersionV1

NonEmptyString = Annotated[str, Field(min_length=1)]
LanguageCode = Annotated[str, Field(min_length=2)]

ResearchPurpose = Literal[
    "learning",
    "teaching",
    "writing",
    "research",
    "industry",
    "product",
    "strategy",
    "custom",
]
ResearchPlanStatus = Literal["draft", "pending-approval", "approved", "rejected", "superseded"]
ResearchTaskType = Literal[
    "search",
    "source-evaluation",
    "extraction",
    "entity",
    "relation",
    "validation",
    "writer",
    "synthesis",
]
ResearchTaskStatus = Literal[
    "PENDING",
    "PLANNING",
    "RUNNING",
    "VALIDATING",
    "NEEDS_REVIEW",
    "COMPLETED",
    "FAILED",
    "PAUSED",
    "CANCELLED",
]
TaskDependencyCondition = Literal["completed", "completed-or-skipped"]
ResearchRunStatus = Literal["running", "paused", "completed", "failed", "cancelled"]


class _Open(BaseModel):
    """Domain records are open: unknown additive fields from newer minors are ignored."""

    model_config = ConfigDict(extra="ignore")


class Project(_Open):
    schema_version: SchemaVersionV1
    project_id: str
    name: str = Field(min_length=1)
    description: Optional[str] = None
    vault_path: Optional[str] = None
    archived: Optional[bool] = None
    created_at: str
    updated_at: str


class TimeRange(BaseModel):
    """Closed block; 'from' is a Python keyword so the field uses an alias. Serialize with by_alias=True."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: Optional[str] = Field(default=None, alias="from")
    to: Optional[str] = None


class ResearchConfig(_Open):
    schema_version: SchemaVersionV1
    config_id: str
    project_id: str
    domain: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    purpose: ResearchPurpose
    audience: Optional[str] = None
    depth: int = Field(ge=1, le=5)
    dimensions: list[NonEmptyString] = Field(min_length=1)
    time_range: Optional[TimeRange] = None
    geographic_scope: Optional[str] = None
    languages: list[LanguageCode] = Field(min_length=1)
    source_types: list[NonEmptyString] = Field(min_length=1)
    source_domains: Optional[list[str]] = None
    update_frequency: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PlanGeneratedBy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_id: str
    prompt_version: str


class ResearchPlan(_Open):
    schema_version: SchemaVersionV1
    plan_id: str
    project_id: str
    config_id: str
    title: Optional[str] = None
    status: ResearchPlanStatus
    section_ids: list[str] = Field(min_length=1)
    generated_by: Optional[PlanGeneratedBy] = None
    approved_at: Optional[str] = None
    rejected_at: Optional[str] = None
    superseded_by: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


class ResearchSection(_Open):
    schema_version: SchemaVersionV1
    section_id: str
    plan_id: str
    title: str = Field(min_length=1)
    dimension: Optional[str] = None
    rationale: Optional[str] = None
    order: int = Field(ge=0)
    task_ids: Optional[list[str]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ResearchTask(_Open):
    schema_version: SchemaVersionV1
    task_id: str
    plan_id: str
    run_id: Optional[str] = None
    section_id: Optional[str] = None
    project_id: str
    type: ResearchTaskType
    status: ResearchTaskStatus
    idempotency_key: str = Field(min_length=1)
    checkpoint: Optional[dict] = None
    retry_count: Optional[int] = Field(default=None, ge=0)
    max_retries: Optional[int] = Field(default=None, ge=0)
    cache_refs: Optional[list[str]] = None
    result_ref: Optional[str] = None
    error_ref: Optional[str] = None
    created_at: str
    updated_at: str


class TaskDependency(_Open):
    schema_version: SchemaVersionV1
    task_id: str
    depends_on_task_id: str
    condition: TaskDependencyCondition
    created_at: Optional[str] = None


class ResearchRun(_Open):
    schema_version: SchemaVersionV1
    run_id: str
    project_id: str
    plan_id: str
    status: ResearchRunStatus
    config_snapshot: Optional[dict] = None
    plan_snapshot_ref: Optional[str] = None
    stats: Optional[dict] = None
    started_at: str
    finished_at: Optional[str] = None
