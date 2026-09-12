"""Provider configuration and usage accounting bindings (closed records)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema_version import SchemaVersionV1

ProviderKind = Literal["llm", "search", "embedding"]


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProviderRetry(_Closed):
    max_attempts: int = Field(ge=1, le=10)
    backoff_ms: int = Field(ge=0)


class ProviderConfig(_Closed):
    schema_version: SchemaVersionV1
    provider_id: str = Field(min_length=1)
    kind: ProviderKind
    base_url: str = Field(min_length=1)
    key_reference: Optional[str] = None
    model: str = Field(min_length=1)
    timeout_ms: int = Field(ge=100)
    retry: ProviderRetry
    extra_headers: Optional[dict[str, str]] = None


class EstimatedCost(_Closed):
    amount: float = Field(ge=0)
    currency: Literal["USD"]


class UsageRecord(_Closed):
    schema_version: SchemaVersionV1
    usage_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    run_id: Optional[str] = None
    provider_id: str = Field(min_length=1)
    kind: Optional[ProviderKind] = None
    model: str = Field(min_length=1)
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    duration_ms: int = Field(ge=0)
    estimated_cost_usd: Optional[EstimatedCost] = None
    cache_hit: Optional[bool] = None
    retries: Optional[int] = Field(default=None, ge=0)
    created_at: str
