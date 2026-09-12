"""Search stage (RES-03).

Domain boundary around a ``SearchProvider``:

- canonical ``Source`` records (title, url, canonical url, type, timestamps,
  quality placeholder) - provider details never leak past this stage;
- URL canonicalization plus a stable dedup key: identical URLs, and URLs
  that canonicalize identically (tracking parameters, fragments, case,
  default ports), collapse to one source; source ids are stable across runs
  so downstream records and the later Vault export stay consistent;
- cache reads per ``docs/ai/CACHE_AND_COST.md``: a cache hit never touches
  the provider and records a usage entry with ``cache_hit=True``;
- provider errors propagate as structured, retryable ``MorphoError``s.

Content-level duplication (two different URLs carrying the same content) is
handled at extraction time via the source-content cache keyed by content
fingerprint, not here.
"""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from morpho_worker.clock import Clock
from morpho_worker.domain.source import Source, SourceType
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.ids import content_fingerprint, new_id, stable_id
from morpho_worker.interfaces import SearchStagePort, StageContext
from morpho_worker.providers.cache import NAMESPACE_SEARCH, CachePort, cache_key
from morpho_worker.providers.ports import (
    RawSearchResult,
    SearchProvider,
    SearchRequest,
)
from morpho_worker.providers.usage import UsageLedger, UsageRecord, utc_now_iso

_TRACKING_PARAM_PREFIXES = ("utm_", "mc_", "hsa_")
_TRACKING_PARAMS = {"fbclid", "gclid", "msclkid", "dclid", "ref", "ref_src", "igshid"}


def canonicalize_url(url: str) -> str:
    """Deterministic URL canonicalization for dedup keys."""

    raw = url.strip()
    parts = urlsplit(raw)
    scheme = parts.scheme.lower() or "https"
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        return raw
    port = parts.port
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    netloc = host if port is None or default_port else f"{host}:{port}"

    path = parts.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")

    query_items = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in _TRACKING_PARAMS
        and not key.lower().startswith(_TRACKING_PARAM_PREFIXES)
    ]
    query_items.sort()
    query = urlencode(query_items)

    return urlunsplit((scheme, netloc, path, query, ""))


def url_dedup_key(canonical_url: str) -> str:
    """Stable across runs: the identity of a source is its canonical URL."""

    return content_fingerprint(canonical_url)


_SOURCE_TYPE_BY_LABEL = {member.value: member for member in SourceType}


def normalize_source(
    raw: RawSearchResult,
    *,
    provider_id: str,
    retrieved_at: str,
) -> Source:
    canonical = canonicalize_url(raw.url)
    label = raw.source_type.strip().lower()
    metadata = dict(raw.metadata)
    if raw.content:
        # Draft content path: provider-delivered content feeds the
        # source-content resolver; real fetch adapters follow the freeze.
        metadata.setdefault("content", raw.content)
    return Source(
        source_id=stable_id("source", canonical),
        url=raw.url.strip(),
        canonical_url=canonical,
        url_dedup_key=url_dedup_key(canonical),
        title=raw.title.strip() or canonical,
        source_type=_SOURCE_TYPE_BY_LABEL.get(label, SourceType.WEB_PAGE),
        found_via=provider_id,
        published_at=raw.published_at,
        retrieved_at=retrieved_at,
        snippet=raw.snippet,
        metadata=metadata,
    )


class SearchStage(SearchStagePort):
    def __init__(
        self,
        search_provider: SearchProvider,
        *,
        provider_id: str = "mock",
        cache: CachePort | None = None,
        usage: UsageLedger | None = None,
        clock: Clock | None = None,
    ) -> None:
        self._provider = search_provider
        self._provider_id = provider_id
        self._cache = cache
        self._usage = usage
        self._clock = clock

    def search(self, query: str, context: StageContext) -> list[Source]:
        normalized_query = " ".join(query.split()).casefold()
        key = cache_key(
            NAMESPACE_SEARCH,
            schema_version=1,
            provider_id=self._provider_id,
            normalized_input={
                "query": normalized_query,
                "source_types": sorted(context.params.get("source_types", [])),
            },
        )
        started = self._clock.monotonic() if self._clock else 0.0

        if self._cache is not None:
            cached = self._cache.get(NAMESPACE_SEARCH, key)
            if cached is not None:
                sources = [Source.model_validate(item) for item in cached]
                self._record_usage(context, duration_ms=0, cache_hit=True, count=len(sources))
                return sources

        request = SearchRequest(
            query=query,
            languages=list(context.params.get("languages", [])),
            source_types=list(context.params.get("source_types", [])),
            source_domains=list(context.params.get("source_domains", [])),
            correlation_id=context.correlation_id,
        )
        try:
            raw_results = self._provider.search(request)
        except MorphoError:
            self._record_usage(context, duration_ms=self._elapsed_ms(started), cache_hit=False, count=0, status="failed", error_code=ErrorCode.SEARCH_FAILED.value)
            raise
        retrieved_at = (
            self._clock.now_utc().isoformat() if self._clock else utc_now_iso()
        )

        sources: dict[str, Source] = {}
        for raw in raw_results:
            source = normalize_source(
                raw, provider_id=self._provider_id, retrieved_at=retrieved_at
            )
            # In-batch dedup by stable canonical key: first occurrence wins.
            sources.setdefault(source.url_dedup_key, source)

        payload = [source.model_dump(mode="json") for source in sources.values()]
        if self._cache is not None:
            self._cache.put(NAMESPACE_SEARCH, key, payload)
        self._record_usage(
            context, duration_ms=self._elapsed_ms(started), cache_hit=False, count=len(payload)
        )
        return list(sources.values())

    # internals -------------------------------------------------------------

    def _elapsed_ms(self, started: float) -> int:
        if self._clock is None:
            return 0
        return int((self._clock.monotonic() - started) * 1000)

    def _record_usage(
        self,
        context: StageContext,
        *,
        duration_ms: int,
        cache_hit: bool,
        count: int,
        status: str = "success",
        error_code: str | None = None,
    ) -> None:
        if self._usage is None:
            return
        self._usage.record(
            UsageRecord(
                usage_id=new_id(),
                provider_id=self._provider_id,
                model="search",
                purpose="search",
                run_id=context.run_id,
                task_id=context.task_id,
                correlation_id=context.correlation_id,
                duration_ms=duration_ms,
                cache_hit=cache_hit,
                status=status,
                error_code=error_code,
                created_at=utc_now_iso(),
            )
        )
