"""Domain research event binding (PRD §6 "Event").

Ordered, append-only, reconnectable projections of research activity. Closed
envelope (unknown fields rejected) with a permissive, already-redacted payload.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema_version import SchemaVersionV1

EventType = Literal[
    "task.created",
    "task.started",
    "task.progress",
    "task.checkpoint",
    "task.completed",
    "task.failed",
    "task.skipped",
    "run.started",
    "run.paused",
    "run.completed",
    "run.failed",
    "run.cancelled",
    "run.incremental_report",
    "plan.drafted",
    "plan.approved",
    "plan.rejected",
    "plan.superseded",
    "source.discovered",
    "source.fetched",
    "source.evaluated",
    "claim.created",
    "claim.updated",
    "claim.superseded",
    "review.requested",
    "review.resolved",
]


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Event(_Closed):
    schema_version: SchemaVersionV1
    event_id: str = Field(min_length=1)
    sequence: int = Field(ge=1)
    occurred_at: str
    run_id: Optional[str] = Field(default=None, min_length=1)
    task_id: Optional[str] = Field(default=None, min_length=1)
    project_id: str = Field(min_length=1)
    type: EventType
    summary: Optional[str] = None
    payload: dict
