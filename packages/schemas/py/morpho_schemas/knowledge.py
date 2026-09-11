"""Knowledge-layer domain record bindings (open records).

Chain: Source -> Evidence -> Claim -> Knowledge. Claims and evidence are never
folded into node summaries; conflicting claims coexist.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schema_version import SchemaVersionV1

SourceKind = Literal["web", "paper", "book", "github", "dataset", "news", "other"]
QualityRating = Literal["high", "medium", "low", "unevaluated"]
ContentFormat = Literal["html", "pdf", "markdown", "plain", "json"]
KnowledgeNodeType = Literal[
    "concept",
    "person",
    "organization",
    "company",
    "paper",
    "book",
    "experiment",
    "event",
    "technology",
    "product",
    "application",
    "policy",
    "dataset",
    "controversy",
]
NodeStatus = Literal["active", "merged", "superseded"]
Confidence = Literal["confirmed", "high", "medium", "low", "unverified", "conflicting"]
ReviewState = Literal["unreviewed", "needs-review", "reviewed"]
EvidenceDirection = Literal["support", "contradict"]
RelationConfidence = Literal["confirmed", "high", "medium", "low", "unverified"]
ArtifactKind = Literal["vault-export", "report", "graph-snapshot", "coverage-report", "other"]


class _Open(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourceQuality(_Closed):
    authority: Optional[QualityRating] = None
    fitness: Optional[QualityRating] = None
    evaluated_at: Optional[str] = None
    notes: Optional[str] = None


class Source(_Open):
    schema_version: SchemaVersionV1
    source_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    url: str = Field(min_length=1)
    title: str = Field(min_length=1)
    kind: SourceKind
    published_at: Optional[str] = None
    retrieved_at: str
    languages: Optional[list[str]] = None
    dedup_key: str = Field(min_length=1)
    quality: Optional[SourceQuality] = None


class SourceContent(_Open):
    schema_version: SchemaVersionV1
    content_id: str = Field(min_length=1)
    source_id: str = Field(min_length=1)
    format: ContentFormat
    content_hash: str = Field(min_length=8)
    language: Optional[str] = None
    fetched_at: str
    cache_ref: Optional[str] = None


class KnowledgeNode(_Open):
    schema_version: SchemaVersionV1
    node_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    type: KnowledgeNodeType
    title: str = Field(min_length=1)
    aliases: Optional[list[str]] = None
    summary: Optional[str] = None
    status: Optional[NodeStatus] = None
    confidence: Confidence
    source_ids: Optional[list[str]] = None
    claim_ids: Optional[list[str]] = None
    metadata: Optional[dict] = None
    created_at: str
    updated_at: str


class ClaimProvenance(_Closed):
    created_by: Optional[Literal["user", "ai"]] = None
    prompt_id: Optional[str] = None
    prompt_version: Optional[str] = None
    task_id: Optional[str] = None


class Claim(_Open):
    schema_version: SchemaVersionV1
    claim_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    subject_node_id: str = Field(min_length=1)
    predicate: str = Field(min_length=1)
    object: str = Field(min_length=1)
    scope: Optional[str] = None
    status: Confidence
    evidence_ids: Optional[list[str]] = None
    provenance: Optional[ClaimProvenance] = None
    review_state: Optional[ReviewState] = None
    created_at: str
    updated_at: str


class EvidenceLocator(_Closed):
    quote: Optional[str] = None
    page: Optional[str] = None
    section: Optional[str] = None
    fragment: Optional[str] = None


class Evidence(_Open):
    schema_version: SchemaVersionV1
    evidence_id: str = Field(min_length=1)
    claim_id: str = Field(min_length=1)
    source_id: str = Field(min_length=1)
    direction: EvidenceDirection
    locator: EvidenceLocator
    extraction_method: Optional[Literal["ai", "user"]] = None
    retrieved_at: str
    revised_at: Optional[str] = None
    superseded_by: Optional[str] = None


class Relation(_Open):
    schema_version: SchemaVersionV1
    relation_id: str = Field(min_length=1)
    from_node_id: str = Field(min_length=1)
    to_node_id: str = Field(min_length=1)
    predicate: str = Field(min_length=1)
    direction: Optional[Literal["directed", "undirected"]] = None
    confidence: RelationConfidence
    status: Optional[NodeStatus] = None
    source_ids: Optional[list[str]] = None
    claim_ids: Optional[list[str]] = None
    provenance: Optional[ClaimProvenance] = None
    created_at: str
    updated_at: Optional[str] = None


class Artifact(_Open):
    schema_version: SchemaVersionV1
    artifact_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    kind: ArtifactKind
    run_id: Optional[str] = None
    path: Optional[str] = None
    format: Optional[Literal["markdown", "json", "png", "svg"]] = None
    note: Optional[str] = None
    created_at: str
