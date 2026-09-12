"""Offline fixture envelope binding (unified, ADR-017).

One closed envelope covers the two historical variants; a fixture uses exactly
one variant marker (``schema_version`` + ``contract`` or
``fixture_envelope_version`` + ``kind``). Variant-specific required fields and
payload-contract resolution are enforced by the offline validators
(scripts/validate-fixture.py, scripts/check-contracts.ps1,
tests/fixtures-support loaders).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema_version import SchemaVersionV1

FixtureProvenanceKind = Literal["synthetic", "public-domain", "licensed-excerpt"]
FixtureOrigin = Literal["synthetic", "curated-public", "user-contributed"]


class FixtureContract(BaseModel):
    """Closed block; 'schema' shadows a BaseModel attribute so the field uses an alias."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_: str = Field(alias="schema", min_length=3)
    schema_version: str


class FixturePrompt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_id: str = Field(min_length=3)
    prompt_version: str = Field(min_length=1)


class FixtureExpectedOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    schema_: str = Field(alias="schema", min_length=1)
    payload: dict


class FixtureProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Optional[FixtureProvenanceKind] = None
    origin: Optional[FixtureOrigin] = None
    synthetic: Optional[bool] = None
    license: Optional[str] = None
    notes: Optional[str] = None
    source_url: Optional[str] = None


class FixtureStability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stable_fields: Optional[list[str]] = Field(default=None, min_length=1)
    volatile_fields: Optional[list[str]] = None
    deterministic: Optional[bool] = None
    ignored_fields: Optional[list[str]] = None


class FixtureEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Optional[SchemaVersionV1] = None
    fixture_envelope_version: Optional[SchemaVersionV1] = None
    fixture_id: str = Field(min_length=3)
    description: Optional[str] = Field(default=None, min_length=1)
    contract: Optional[FixtureContract] = None
    kind: Optional[str] = Field(default=None, min_length=1)
    prompt: Optional[FixturePrompt] = None
    input: dict
    expected: Optional[dict] = None
    expected_outputs: Optional[list[FixtureExpectedOutput]] = None
    provenance: FixtureProvenance
    stability: Optional[FixtureStability] = None
