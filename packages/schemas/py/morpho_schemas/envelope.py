"""Offline fixture envelope binding."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema_version import SchemaVersionV1

FixtureProvenanceKind = Literal["synthetic", "public-domain", "licensed-excerpt"]


class FixtureContract(BaseModel):
    """Closed block; 'schema' shadows a BaseModel attribute so the field uses an alias."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_: str = Field(alias="schema", min_length=3)
    schema_version: str


class FixturePrompt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_id: str = Field(min_length=3)
    prompt_version: str = Field(min_length=1)


class FixtureProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: FixtureProvenanceKind
    notes: Optional[str] = None
    source_url: Optional[str] = None


class FixtureStability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stable_fields: list[str] = Field(min_length=1)
    volatile_fields: list[str]


class FixtureEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: SchemaVersionV1
    fixture_id: str = Field(min_length=3)
    description: str = Field(min_length=1)
    contract: FixtureContract
    prompt: Optional[FixturePrompt] = None
    provenance: FixtureProvenance
    input: dict
    expected: Optional[dict] = None
    stability: FixtureStability
