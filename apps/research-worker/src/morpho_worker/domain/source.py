"""Source layer: canonical sources, cacheable content, and explainable
source quality. Quality describes authority and fitness for purpose; it
never declares a source's claims true or false (PRD §6).
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SourceType(str, Enum):
    WEB_PAGE = "web_page"
    PAPER = "paper"
    BOOK = "book"
    DOCUMENTATION = "documentation"
    NEWS = "news"
    BLOG = "blog"
    FORUM = "forum"
    DATASET = "dataset"
    VIDEO = "video"
    OTHER = "other"


class SourceQuality(BaseModel):
    """Explainable quality assessment. Every dimension carries its own score
    and the report explains the reasons; scores are planning metadata only."""

    model_config = ConfigDict(extra="forbid")

    authority: float = Field(ge=0, le=1)
    freshness: float = Field(ge=0, le=1)
    relevance: float = Field(ge=0, le=1)
    type_fit: float = Field(ge=0, le=1)
    overall: float = Field(ge=0, le=1)
    tier: Literal["high", "medium", "low"]
    reasons: list[str] = Field(default_factory=list)
    note: str = (
        "Source quality describes authority and fitness for purpose. "
        "It is not a statement about the truth of the content."
    )


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str
    url: str
    canonical_url: str
    #: Stable dedup key over the canonical URL (RES-03); identical across runs.
    url_dedup_key: str
    title: str
    source_type: SourceType = SourceType.WEB_PAGE
    #: Provenance: which configured provider produced this result.
    found_via: str = ""
    published_at: str | None = None
    retrieved_at: str = ""
    snippet: str = ""
    quality: SourceQuality | None = None
    metadata: dict = Field(default_factory=dict)


class SourceContent(BaseModel):
    """Cacheable content payload of one source."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    url_dedup_key: str
    content: str
    content_type: str = "text/plain"
    #: sha256 of the content; part of cache keys and run fingerprints.
    fingerprint: str
    fetched_at: str = ""
    #: Draft extraction path label used by locators (e.g. "full-text").
    locator_base: str = "full-text"
