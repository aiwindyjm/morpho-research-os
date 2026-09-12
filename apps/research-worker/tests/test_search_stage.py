import pytest

from morpho_worker.clock import FakeClock
from morpho_worker.domain.source import SourceType
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.interfaces import StageContext
from morpho_worker.providers.cache import InMemoryCache
from morpho_worker.providers.mock import MockSearchProvider
from morpho_worker.providers.ports import RawSearchResult, SearchRequest
from morpho_worker.providers.usage import InMemoryUsageLedger
from morpho_worker.stages.search_stage import (
    SearchStage,
    canonicalize_url,
    normalize_source,
    url_dedup_key,
)


def context(**params):
    return StageContext(run_id="run-1", task_id="task-1", params=params)


def test_canonicalization_collapses_tracking_noise():
    variants = [
        "https://Example.com/A/?utm_source=x&utm_medium=y&q=entanglement&fbclid=zz#section-2",
        "https://example.com/A?q=entanglement",
        "https://example.com:443/A/?q=entanglement",
        "HTTPS://EXAMPLE.COM/A?q=entanglement&utm_term=z",
    ]
    keys = {url_dedup_key(canonicalize_url(url)) for url in variants}
    assert len(keys) == 1
    canonical = canonicalize_url(variants[0])
    assert canonical == "https://example.com/A?q=entanglement"
    assert "#section-2" not in canonical


def test_different_pages_keep_different_keys():
    assert url_dedup_key(canonicalize_url("https://example.com/a")) != url_dedup_key(
        canonicalize_url("https://example.com/b")
    )


def test_normalize_source_keeps_provenance_and_stable_id():
    raw = RawSearchResult(
        title="  Bell test experiments ",
        url="https://example.com/paper?utm_source=x",
        snippet="loophole-free bell tests",
        source_type="paper",
        published_at="2015-10-21",
        metadata={"authors": ["Hensen"]},
    )
    source = normalize_source(raw, provider_id="mock", retrieved_at="2026-01-01T00:00:00+00:00")
    again = normalize_source(raw, provider_id="mock", retrieved_at="2026-02-02T00:00:00+00:00")

    assert source.title == "Bell test experiments"
    assert source.source_type is SourceType.PAPER
    assert source.found_via == "mock"
    assert source.url_dedup_key == again.url_dedup_key
    assert source.source_id == again.source_id  # stable across runs
    assert source.metadata == {"authors": ["Hensen"]}
    assert source.quality is None  # evaluation happens at extraction stage


def test_unknown_source_type_defaults_to_web_page():
    source = normalize_source(
        RawSearchResult(title="t", url="https://example.com"),
        provider_id="mock",
        retrieved_at="",
    )
    assert source.source_type is SourceType.WEB_PAGE


def test_search_stage_dedups_within_batch():
    provider = MockSearchProvider(
        results=[
            RawSearchResult(title="First", url="https://example.com/a?utm_source=x"),
            RawSearchResult(title="Second", url="https://example.com/a"),
            RawSearchResult(title="Other", url="https://example.com/b"),
        ]
    )
    stage = SearchStage(provider, provider_id="mock", clock=FakeClock())
    sources = stage.search("quantum", context())
    assert [source.title for source in sources] == ["First", "Other"]
    assert len(provider.calls) == 1


def test_cache_hit_never_reconsumes_provider():
    provider = MockSearchProvider(
        results=[RawSearchResult(title="A", url="https://example.com/a")]
    )
    cache = InMemoryCache()
    usage = InMemoryUsageLedger()
    stage = SearchStage(
        provider, provider_id="mock", cache=cache, usage=usage, clock=FakeClock()
    )
    first = stage.search("quantum", context(source_types=["paper"]))
    second = stage.search("quantum", context(source_types=["paper"]))
    assert first == second
    assert len(provider.calls) == 1  # provider consumed once
    records = usage.all()
    assert records[0].cache_hit is False
    assert records[1].cache_hit is True
    assert records[1].input_tokens == 0


def test_cache_varies_by_normalized_query_and_options():
    provider = MockSearchProvider(
        results=[RawSearchResult(title="A", url="https://example.com/a")]
    )
    cache = InMemoryCache()
    stage = SearchStage(provider, provider_id="mock", cache=cache, clock=FakeClock())
    stage.search("quantum  entanglement", context())  # whitespace/case-insensitive
    stage.search("Quantum Entanglement", context())
    assert len(provider.calls) == 1
    stage.search("quantum entanglement", context(source_types=["paper"]))
    assert len(provider.calls) == 2  # different options = different cache entry


def test_provider_failure_is_recorded_and_propagates():
    provider = MockSearchProvider(
        results=[],
        failures_before_success=99,
        failure=MorphoError(
            ErrorCode.SEARCH_FAILED, "Search is failing.", retryable=True
        ),
    )
    usage = InMemoryUsageLedger()
    stage = SearchStage(
        provider, provider_id="mock", usage=usage, clock=FakeClock()
    )
    with pytest.raises(MorphoError) as excinfo:
        stage.search("quantum", context())
    assert excinfo.value.code is ErrorCode.SEARCH_FAILED
    failed_records = [record for record in usage.all() if record.status == "failed"]
    assert len(failed_records) == 1
    assert failed_records[0].error_code == ErrorCode.SEARCH_FAILED.value


def test_search_stage_implements_port():
    from morpho_worker.interfaces import SearchStagePort

    stage = SearchStage(MockSearchProvider(), clock=FakeClock())
    assert isinstance(stage, SearchStagePort)


def test_search_request_carries_context_options():
    captured = {}

    class SpyProvider(MockSearchProvider):
        def search(self, request: SearchRequest):
            captured.update(
                languages=request.languages,
                source_types=request.source_types,
                domains=request.source_domains,
            )
            return super().search(request)

    stage = SearchStage(
        SpyProvider(results=[]), provider_id="mock", clock=FakeClock()
    )
    stage.search(
        "q",
        context(languages=["en", "zh"], source_types=["paper"], source_domains=["arxiv.org"]),
    )
    assert captured["languages"] == ["en", "zh"]
    assert captured["source_types"] == ["paper"]
    assert captured["domains"] == ["arxiv.org"]
