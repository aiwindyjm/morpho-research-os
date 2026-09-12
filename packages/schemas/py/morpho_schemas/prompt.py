"""Prompt metadata bindings (closed record)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema_version import SchemaVersionV1

PromptStage = Literal[
    "planner",
    "search",
    "extraction",
    "entity",
    "relation",
    "validation",
    "writing",
    "synthesis",
]

ModelCapability = Literal["strong", "medium", "cheap"]


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SchemaRef(_Closed):
    schema_: str = Field(alias="schema", min_length=3)
    schema_version: str = Field(min_length=1)


class ModelHint(_Closed):
    capability: ModelCapability


class GoldenCase(_Closed):
    case_id: str = Field(min_length=3)
    fixture_ref: str = Field(min_length=3)


class PromptMetadata(_Closed):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: SchemaVersionV1
    prompt_id: str = Field(min_length=5)
    version: str = Field(min_length=5)
    stage: PromptStage
    purpose: str = Field(min_length=1)
    input_schema: SchemaRef
    output_schema: SchemaRef
    model_hint: Optional[ModelHint] = None
    safety: Optional[list[str]] = None
    golden_cases: list[GoldenCase] = Field(min_length=1)
