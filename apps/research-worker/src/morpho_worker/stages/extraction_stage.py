"""Source evaluation and content extraction (RES-04).

Three cooperating pieces:

- ``SourceContentResolver``: produces a cacheable ``SourceContent`` per
  source. Cache keys use the source's canonical dedup key, so repeated
  extraction of the same source never re-fetches. The V0.1 draft resolver
  uses content delivered by the search provider (mock mode); real fetch
  adapters arrive after the provider contract freeze.
- ``SourceEvaluator``: an explainable, rule-based quality assessment
  (authority/freshness/relevance/type-fit with reasons). Quality describes
  authority and fitness for planning - it is never a truth verdict.
- ``ExtractionStage``: runs the source-extraction prompt through the
  structured output gate and normalizes the result. The extraction id is
  derived from the content fingerprint, so two URLs carrying identical
  content produce ONE extraction record (content-level dedup), and blank
  content fails deterministically with ``SOURCE_PARSE_FAILED``.
"""

from __future__ import annotations

from datetime import datetime

from morpho_worker.clock import Clock
from morpho_worker.domain.extraction import (
    ExtractedClaim,
    ExtractedEntity,
    ExtractedRelation,
    ExtractionResult,
)
from morpho_worker.domain.source import Source, SourceContent, SourceQuality
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.ids import content_fingerprint, stable_id
from morpho_worker.interfaces import ExtractionStagePort, StageContext
from morpho_worker.pipeline.structured import StructuredOutputPipeline
from morpho_worker.providers.cache import (
    NAMESPACE_SOURCE_CONTENT,
    CachePort,
    cache_key,
)
from pydantic import BaseModel, ConfigDict, Field, field_validator

_MAX_PROMPT_CHARS = 6000


class SourceContentResolver:
    def __init__(self, *, cache: CachePort | None = None, clock: Clock | None = None) -> None:
        self._cache = cache
        self._clock = clock

    def resolve(self, source: Source) -> SourceContent:
        key = cache_key(
            NAMESPACE_SOURCE_CONTENT,
            schema_version=1,
            fingerprint=source.url_dedup_key,
        )
        if self._cache is not None:
            cached = self._cache.get(NAMESPACE_SOURCE_CONTENT, key)
            if cached is not None:
                return SourceContent.model_validate(cached)

        # Draft content path: the search result carries the content (mock
        # provider or snippet). Real fetch adapters are post-freeze work.
        content = str(source.metadata.get("content") or "") or source.snippet
        fetched_at = self._clock.now_utc().isoformat() if self._clock else ""
        resolved = SourceContent(
            source_id=source.source_id,
            url_dedup_key=source.url_dedup_key,
            content=content,
            fingerprint=content_fingerprint(content),
            fetched_at=fetched_at,
        )
        if self._cache is not None:
            self._cache.put(NAMESPACE_SOURCE_CONTENT, key, resolved.model_dump(mode="json"))
        return resolved


def _authority_for_type(source_type) -> float:
    return {
        "paper": 0.9,
        "documentation": 0.8,
        "book": 0.85,
        "dataset": 0.75,
        "news": 0.6,
        "blog": 0.45,
        "forum": 0.35,
        "web_page": 0.5,
        "video": 0.4,
    }.get(source_type.value if hasattr(source_type, "value") else str(source_type), 0.5)


def _freshness_score(published_at: str | None, now: datetime) -> float:
    if not published_at:
        return 0.5  # unknown freshness is neutral, not zero
    try:
        parsed = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    except ValueError:
        return 0.5
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=now.tzinfo)
    age_days = max(0.0, (now - parsed).total_seconds() / 86400)
    # 0-1 year keeps full score, then decays to 0.2 over ~5 years.
    if age_days <= 365:
        return 1.0
    return max(0.2, 1.0 - (age_days - 365) / (365 * 5))


def _relevance_score(topic: str, dimension: str, content: str) -> float:
    topic_terms = {
        word.casefold() for word in topic.split() if len(word) > 2
    } | {word.casefold() for word in dimension.split() if len(word) > 2}
    if not topic_terms:
        return 0.5
    text = content.casefold()
    hits = sum(1 for term in topic_terms if term in text)
    return min(1.0, hits / len(topic_terms))


class SourceEvaluator:
    """Explainable quality assessment. Scores are planning metadata."""

    #: Explainable coverage weights (kept local to the evaluator; PRD's
    #: project-coverage formula lives in the coverage projection, not here).
    WEIGHTS = {"authority": 0.4, "relevance": 0.3, "freshness": 0.2, "type_fit": 0.1}

    def __init__(self, clock: Clock | None = None) -> None:
        self._clock = clock

    def evaluate(
        self,
        source: Source,
        content: SourceContent,
        *,
        topic: str = "",
        dimension: str = "",
        requested_types: list[str] | None = None,
    ) -> SourceQuality:
        now = self._clock.now_utc() if self._clock else datetime(2026, 1, 1)
        authority = _authority_for_type(source.source_type)
        freshness = _freshness_score(source.published_at, now)
        relevance = _relevance_score(topic or source.title, dimension, content.content)
        requested = {value.strip().lower() for value in (requested_types or [])}
        type_fit = 1.0 if (not requested or source.source_type.value in requested) else 0.4

        overall = (
            self.WEIGHTS["authority"] * authority
            + self.WEIGHTS["relevance"] * relevance
            + self.WEIGHTS["freshness"] * freshness
            + self.WEIGHTS["type_fit"] * type_fit
        )
        reasons = [
            f"authority {authority:.2f}: source type is {source.source_type.value}",
            f"freshness {freshness:.2f}: published "
            + (source.published_at or "unknown"),
            f"relevance {relevance:.2f}: topic/dimension term overlap in content",
            f"type fit {type_fit:.2f}: requested types "
            + (", ".join(sorted(requested)) if requested else "unrestricted"),
        ]
        tier = "high" if overall >= 0.7 else ("medium" if overall >= 0.4 else "low")
        return SourceQuality(
            authority=round(authority, 4),
            freshness=round(freshness, 4),
            relevance=round(relevance, 4),
            type_fit=round(type_fit, 4),
            overall=round(overall, 4),
            tier=tier,
            reasons=reasons,
        )


class ExtractionOutput(BaseModel):
    """Validated shape of the extraction LLM response."""

    model_config = ConfigDict(extra="forbid")

    entities: list[ExtractedEntity] = Field(default_factory=list)
    relations: list[ExtractedRelation] = Field(default_factory=list)
    claims: list[ExtractedClaim] = Field(default_factory=list)
    summary: str = ""
    key_points: list[str] = Field(default_factory=list)

    @field_validator("summary", "key_points", mode="before")
    @classmethod
    def _strip(cls, value):
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return value


def normalize_extraction_output(
    output: ExtractionOutput,
    *,
    source: Source,
    fingerprint: str,
) -> ExtractionResult:
    """Deterministic normalization inside the output gate."""

    seen_entities: dict[tuple[str, str], ExtractedEntity] = {}
    for entity in output.entities:
        name = " ".join(entity.name.split())
        if not name:
            continue
        key = (name.casefold(), entity.type.value)
        existing = seen_entities.get(key)
        if existing is None:
            seen_entities[key] = entity.model_copy(
                update={
                    "name": name,
                    "aliases": [alias.strip() for alias in entity.aliases if alias.strip()],
                }
            )
        else:
            merged_aliases = list(existing.aliases)
            for alias in entity.aliases:
                if alias.strip() and alias.strip() not in merged_aliases:
                    merged_aliases.append(alias.strip())
            seen_entities[key] = existing.model_copy(update={"aliases": merged_aliases})

    relations: dict[tuple[str, str, str], ExtractedRelation] = {}
    for relation in output.relations:
        subject = " ".join(relation.subject.split())
        predicate = " ".join(relation.predicate.split())
        obj = " ".join(relation.object.split())
        if not (subject and predicate and obj):
            continue
        relations.setdefault(
            (subject.casefold(), predicate.casefold(), obj.casefold()),
            relation.model_copy(
                update={"subject": subject, "predicate": predicate, "object": obj}
            ),
        )

    claims: list[ExtractedClaim] = []
    for claim in output.claims:
        subject = " ".join(claim.subject.split())
        predicate = " ".join(claim.predicate.split())
        object_value = " ".join(claim.object_value.split())
        if not (subject and predicate and object_value):
            continue
        claims.append(
            claim.model_copy(
                update={
                    "subject": subject,
                    "predicate": predicate,
                    "object_value": object_value,
                    "quote": claim.quote.strip() if claim.quote else None,
                    "section": claim.section.strip() if claim.section else None,
                }
            )
        )

    return ExtractionResult(
        extraction_id=stable_id("extraction", fingerprint),
        source_id=source.source_id,
        url_dedup_key=source.url_dedup_key,
        entities=list(seen_entities.values()),
        relations=list(relations.values()),
        claims=claims,
        summary=output.summary,
        key_points=output.key_points,
    )


class ExtractionStage(ExtractionStagePort):
    def __init__(
        self,
        pipeline: StructuredOutputPipeline,
        *,
        provider_id: str,
        model: str,
        evaluator: SourceEvaluator,
        content_resolver: SourceContentResolver,
    ) -> None:
        self._pipeline = pipeline
        self._provider_id = provider_id
        self._model = model
        self._evaluator = evaluator
        self._content_resolver = content_resolver

    def content_for(self, source: Source) -> SourceContent:
        return self._content_resolver.resolve(source)

    def evaluate(self, source: Source, content: SourceContent, context: StageContext) -> SourceQuality:
        return self._evaluator.evaluate(
            source,
            content,
            topic=str(context.params.get("topic", "")),
            dimension=context.dimension,
            requested_types=list(context.params.get("source_types", [])),
        )

    def extract(
        self, source: Source, content: SourceContent, context: StageContext
    ) -> ExtractionResult:
        if not content.content.strip():
            raise MorphoError(
                ErrorCode.SOURCE_PARSE_FAILED,
                "The source contains no extractable content.",
                developer_detail=f"source_id={source.source_id} fingerprint={content.fingerprint}",
                retryable=False,
                correlation_id=context.correlation_id,
            )
        prompt_input = {
            "topic": str(context.params.get("topic", "")),
            "dimension": context.dimension or "general",
            "content": content.content[:_MAX_PROMPT_CHARS],
        }
        result, _usage = self._pipeline.run(
            prompt_id="extraction.source-extraction",
            prompt_input=prompt_input,
            output_schema=ExtractionOutput,
            normalize=lambda out: normalize_extraction_output(
                out, source=source, fingerprint=content.fingerprint
            ),
            provider_id=self._provider_id,
            model=self._model,
            run_id=context.run_id,
            task_id=context.task_id,
            correlation_id=context.correlation_id,
        )
        return result
