"""Knowledge layer: nodes and typed relations.

KnowledgeNode and Relation are separate records from Claims and Evidence
(docs/data/KNOWLEDGE_SCHEMA.md, RELATION_SCHEMA.md). Claims are never folded
into node summaries. Node ids are stable (deterministic per type + canonical
title) so repeated runs and the Vault writer can rely on them.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class KnowledgeType(str, Enum):
    CONCEPT = "concept"
    PERSON = "person"
    ORGANIZATION = "organization"
    COMPANY = "company"
    PAPER = "paper"
    BOOK = "book"
    EXPERIMENT = "experiment"
    EVENT = "event"
    TECHNOLOGY = "technology"
    PRODUCT = "product"
    APPLICATION = "application"
    POLICY = "policy"
    DATASET = "dataset"
    CONTROVERSY = "controversy"


class Confidence(str, Enum):
    """Documented confidence states (PRD §6)."""

    CONFIRMED = "confirmed"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNVERIFIED = "unverified"
    CONFLICTING = "conflicting"


class KnowledgeStatus(str, Enum):
    ACTIVE = "active"
    NEEDS_REVIEW = "needs_review"
    #: Merged into another node; kept for history and redirect resolution.
    MERGED = "merged"
    RETIRED = "retired"


class ProvenanceRef(BaseModel):
    """Where a piece of knowledge came from. At least one reference is set."""

    model_config = ConfigDict(extra="forbid")

    source_id: str | None = None
    extraction_id: str | None = None
    evidence_id: str | None = None
    task_id: str | None = None
    locator: str | None = None

    @model_validator(mode="after")
    def _has_reference(self) -> "ProvenanceRef":
        if not any([self.source_id, self.extraction_id, self.evidence_id, self.task_id]):
            raise ValueError("provenance requires at least one reference")
        return self


class KnowledgeNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_id: str
    type: KnowledgeType
    title: str
    aliases: list[str] = Field(default_factory=list)
    summary: str = ""
    status: KnowledgeStatus = KnowledgeStatus.ACTIVE
    confidence: Confidence = Confidence.UNVERIFIED
    source_ids: list[str] = Field(default_factory=list)
    claim_ids: list[str] = Field(default_factory=list)
    #: Extraction provenance (which extraction runs contributed).
    provenance: list[ProvenanceRef] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


class RelationStatus(str, Enum):
    ACTIVE = "active"
    NEEDS_REVIEW = "needs_review"
    RETIRED = "retired"


class Relation(BaseModel):
    """Typed connection between two knowledge nodes."""

    model_config = ConfigDict(extra="forbid")

    relation_id: str
    subject_node_id: str
    predicate: str
    object_node_id: str
    direction: Literal["directed", "undirected"] = "directed"
    confidence: Confidence = Confidence.UNVERIFIED
    provenance: list[ProvenanceRef] = Field(default_factory=list)
    status: RelationStatus = RelationStatus.ACTIVE
    created_at: str = ""
    updated_at: str = ""
