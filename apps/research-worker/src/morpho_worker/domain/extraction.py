"""Extraction layer: the validated intermediate material one source yields.

Extraction results are the input to entity/relation/claim normalization
(RES-05/RES-06). They are produced only through the structured output gate
and keep their source provenance everywhere.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from morpho_worker.domain.knowledge import KnowledgeType


class ExtractedEntity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    type: KnowledgeType
    aliases: list[str] = Field(default_factory=list)
    description: str = ""


class ExtractedRelation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str
    predicate: str
    object: str
    confidence: float = Field(default=0.5, ge=0, le=1)


class ExtractedClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str
    predicate: str
    object_value: str
    quote: str | None = None
    section: str | None = None
    confidence: float = Field(default=0.5, ge=0, le=1)


class ExtractionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extraction_id: str
    source_id: str
    url_dedup_key: str
    extraction_method: str = "llm.source-extraction.v1"
    entities: list[ExtractedEntity] = Field(default_factory=list)
    relations: list[ExtractedRelation] = Field(default_factory=list)
    claims: list[ExtractedClaim] = Field(default_factory=list)
    summary: str = ""
    key_points: list[str] = Field(default_factory=list)
