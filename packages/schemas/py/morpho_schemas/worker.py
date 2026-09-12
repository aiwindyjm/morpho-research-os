"""Worker protocol message bindings.

Protocol messages are CLOSED envelopes: unknown fields are rejected in every
stack (zod strict / pydantic forbid / serde deny_unknown_fields).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema_version import SchemaVersionV1

ProtocolVersion = Literal["1.0"]

WorkerJobType = Literal[
    "search",
    "source-evaluation",
    "extraction",
    "entity",
    "relation",
    "validation",
    "writer",
    "synthesis",
]

WorkerErrorCode = Literal[
    "WORKER_NOT_AVAILABLE",
    "PROVIDER_AUTH_FAILED",
    "PROVIDER_TIMEOUT",
    "SEARCH_FAILED",
    "SOURCE_PARSE_FAILED",
    "LLM_INVALID_JSON",
    "TASK_DEPENDENCY_FAILED",
    "VAULT_WRITE_FAILED",
    "VAULT_SCHEMA_MISMATCH",
    "DATABASE_ERROR",
]


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WorkerHealthResponse(_Closed):
    schema_version: SchemaVersionV1
    status: Literal["ok", "degraded"]
    worker_version: str = Field(min_length=1)
    protocol_version: ProtocolVersion
    detail: Optional[str] = None


class WorkerVersionResponse(_Closed):
    schema_version: SchemaVersionV1
    worker_version: str = Field(min_length=1)
    protocol_version: ProtocolVersion
    capabilities: list[WorkerJobType]


class WorkerJobRequest(_Closed):
    schema_version: SchemaVersionV1
    job_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    run_id: Optional[str] = None
    type: WorkerJobType
    payload: Optional[dict] = None
    idempotency_key: str = Field(min_length=1)
    checkpoint: Optional[dict] = None


class WorkerJobResponse(_Closed):
    schema_version: SchemaVersionV1
    job_id: str = Field(min_length=1)
    status: Literal["queued", "running"]
    accepted: bool
    duplicate: Optional[bool] = None
    accepted_at: Optional[str] = None


class WorkerJobProgress(_Closed):
    percent: Optional[int] = Field(default=None, ge=0, le=100)
    stage: Optional[str] = None


class WorkerJobStatus(_Closed):
    schema_version: SchemaVersionV1
    job_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    type: WorkerJobType
    status: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    progress: Optional[WorkerJobProgress] = None
    checkpoint: Optional[dict] = None
    error: Optional[dict] = None
    created_at: str
    updated_at: str


class WorkerCancelResponse(_Closed):
    schema_version: SchemaVersionV1
    job_id: str = Field(min_length=1)
    status: Literal["cancelling", "cancelled"]
    previous_status: Optional[Literal["queued", "running"]] = None
    requested_at: Optional[str] = None


WorkerEventType = Literal[
    "job.accepted",
    "job.started",
    "job.progress",
    "job.checkpoint",
    "job.completed",
    "job.failed",
    "job.cancelled",
]


class WorkerEvent(_Closed):
    schema_version: SchemaVersionV1
    event_id: str = Field(min_length=1)
    seq: int = Field(ge=1)
    job_id: str = Field(min_length=1)
    run_id: Optional[str] = None
    task_id: Optional[str] = None
    timestamp: str
    type: WorkerEventType
    payload: Optional[dict] = None
    error: Optional[dict] = None


class WorkerErrorBlock(_Closed):
    code: WorkerErrorCode
    user_message: str = Field(min_length=1)
    developer_detail: str
    retryable: bool
    correlation_id: str = Field(min_length=1)
    cause: Optional[str] = None


class WorkerErrorEnvelope(_Closed):
    schema_version: SchemaVersionV1
    error: WorkerErrorBlock
