"""SearxngSearch tests: scripted transports only, never a real instance."""
from urllib.parse import parse_qs, urlsplit

import pytest

from morpho_worker.config import ProviderConfig, ProviderKind, WorkerConfig
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.factory import ProviderFactory
from morpho_worker.providers.openai_compat import EndpointNotAllowed
from morpho_worker.providers.ports import SearchRequest
from morpho_worker.providers.retry import RetryingProvider
from morpho_worker.providers.searxng import SearxngSearch


def _provider(base_url="http://127.0.0.1:8888"):
    return ProviderConfig(provider_id="searxng-local", kind=ProviderKind.SEARCH, base_url=base_url)


def _ok_transport(payload):
    def transport(url, headers):
        return 200, payload
    return transport


def test_search_parses_results_and_caps_count():
    payload = {"results": [
        {"url": f"https://s.test/{i}", "title": f"t{i}", "content": f"c{i}",
         "publishedDate": "2024-05-01T00:00:00"} for i in range(15)
    ]}
    adapter = SearxngSearch(_provider(), transport=_ok_transport(payload))
    results = adapter.search(SearchRequest(query="qwen", max_results=10))
    assert len(results) == 10
    assert results[0].url == "https://s.test/0"
    assert results[0].source_type == "web_page"


def test_search_dedups_urls():
    payload = {"results": [
        {"url": "https://s.test/a?utm_source=x", "title": "a", "content": "c"},
        {"url": "https://s.test/a", "title": "a2", "content": "c2"},
    ]}
    adapter = SearxngSearch(_provider(), transport=_ok_transport(payload))
    results = adapter.search(SearchRequest(query="q", max_results=10))
    assert len(results) == 1


def test_http_error_maps_to_search_failed():
    adapter = SearxngSearch(_provider(), transport=lambda u, h: (503, {}))
    with pytest.raises(MorphoError) as e:
        adapter.search(SearchRequest(query="q", max_results=5))
    assert e.value.code == ErrorCode.SEARCH_FAILED


def test_malformed_payload_maps_to_search_failed():
    adapter = SearxngSearch(_provider(), transport=_ok_transport({"unrelated": True}))
    with pytest.raises(MorphoError) as e:
        adapter.search(SearchRequest(query="q", max_results=5))
    assert e.value.code == ErrorCode.SEARCH_FAILED


# Request shaping ---------------------------------------------------------------


def test_request_url_carries_query_format_language_and_pageno():
    captured = {}

    def transport(url, headers):
        captured.update(url=url, headers=headers)
        return 200, {"results": [{"url": "https://s.test/1", "title": "t", "content": "c"}]}

    adapter = SearxngSearch(_provider(), transport=transport)
    adapter.search(SearchRequest(query="qwen release", languages=["en", "zh"]))
    parts = urlsplit(captured["url"])
    query = parse_qs(parts.query)
    assert parts.scheme == "http" and parts.netloc == "127.0.0.1:8888"
    assert parts.path == "/search"
    assert query["q"] == ["qwen release"]
    assert query["format"] == ["json"]
    assert query["language"] == ["en|zh"]
    assert query["pageno"] == ["1"]
    assert "time_range" not in query
    assert captured["headers"]["Accept"] == "application/json"


def test_request_omits_language_when_not_requested():
    def transport(url, headers):
        assert "language" not in parse_qs(urlsplit(url).query)
        return 200, {"results": []}

    SearxngSearch(_provider(), transport=transport).search(SearchRequest(query="q"))
    # Reaching this point means the transport assertion held.


def test_skips_entries_without_url_and_keeps_parseable_published_dates():
    payload = {"results": [
        {"title": "no url", "content": "c"},
        {"url": "https://s.test/1", "title": "t1", "content": "c1",
         "publishedDate": "2024-05-01T00:00:00"},
        {"url": "https://s.test/2", "title": "t2", "content": "c2",
         "publishedDate": "not-a-date"},
        "not-even-a-dict",
    ]}
    results = SearxngSearch(_provider(), transport=_ok_transport(payload)).search(
        SearchRequest(query="q", max_results=10)
    )
    assert [r.url for r in results] == ["https://s.test/1", "https://s.test/2"]
    assert results[0].published_at == "2024-05-01T00:00:00"
    assert results[1].published_at is None
    assert results[0].snippet == "c1"


def test_time_range_maps_to_searxng_bucket(monkeypatch):
    import datetime as dt

    from morpho_worker.providers import searxng

    monkeypatch.setattr(
        searxng, "_utcnow", lambda: dt.datetime(2026, 9, 12, tzinfo=dt.timezone.utc)
    )

    def query_of(request):
        captured = {}

        def transport(url, headers):
            captured.update(url=url)
            return 200, {"results": []}

        SearxngSearch(_provider(), transport=transport).search(request)
        return parse_qs(urlsplit(captured["url"]).query)

    # Explicit window: 9 days needs the coarsest bucket that covers it.
    explicit = query_of(SearchRequest(
        query="q", time_range_from="2026-09-01", time_range_to="2026-09-10"
    ))
    assert explicit["time_range"] == ["month"]

    # from-only window measured against the clock: 1 day.
    recent = query_of(SearchRequest(query="q", time_range_from="2026-09-11T00:00:00Z"))
    assert recent["time_range"] == ["day"]

    # Older than a year: SearXNG cannot express it, parameter omitted.
    stale = query_of(SearchRequest(query="q", time_range_from="2020-01-01"))
    assert "time_range" not in stale

    # to-only is not expressible either.
    upper_only = query_of(SearchRequest(query="q", time_range_to="2026-09-10"))
    assert "time_range" not in upper_only


# Error mapping -----------------------------------------------------------------


@pytest.mark.parametrize(
    "status,retryable",
    [(429, True), (500, True), (503, True), (400, False), (404, False)],
)
def test_http_statuses_map_to_search_failed(status, retryable):
    adapter = SearxngSearch(_provider(), transport=lambda u, h: (status, {}))
    with pytest.raises(MorphoError) as excinfo:
        adapter.search(SearchRequest(query="q", max_results=5))
    assert excinfo.value.code is ErrorCode.SEARCH_FAILED
    assert excinfo.value.retryable is retryable
    assert excinfo.value.details["http_status"] == status


def test_transport_timeout_and_connection_errors_are_retryable_search_failed():
    def timeout_transport(url, headers):
        raise TimeoutError("too slow")

    def refused_transport(url, headers):
        raise OSError("connection refused")

    for transport in (timeout_transport, refused_transport):
        adapter = SearxngSearch(_provider(), transport=transport)
        with pytest.raises(MorphoError) as excinfo:
            adapter.search(SearchRequest(query="q", correlation_id="c1"))
        assert excinfo.value.code is ErrorCode.SEARCH_FAILED
        assert excinfo.value.retryable is True
        assert excinfo.value.correlation_id == "c1"


def test_non_list_results_is_search_failed_not_crash():
    for payload in ({"results": "nope"}, {"results": 3}, [], "nope"):
        adapter = SearxngSearch(_provider(), transport=_ok_transport(payload))
        with pytest.raises(MorphoError) as excinfo:
            adapter.search(SearchRequest(query="q"))
        assert excinfo.value.code is ErrorCode.SEARCH_FAILED
        assert excinfo.value.retryable is False


def test_empty_results_list_is_a_valid_empty_answer():
    results = SearxngSearch(_provider(), transport=_ok_transport({"results": []})).search(
        SearchRequest(query="q")
    )
    assert results == []


def test_non_loopback_plain_http_endpoint_rejected_at_construction():
    with pytest.raises(EndpointNotAllowed):
        SearxngSearch(_provider(base_url="http://searx.example.test"))


# Factory wiring ----------------------------------------------------------------


def _search_config():
    return WorkerConfig(
        providers={
            "searxng-local": ProviderConfig(
                provider_id="searxng-local",
                kind=ProviderKind.SEARCH,
                base_url="http://127.0.0.1:8888",
                retry_backoff_seconds=0.0,
            ),
            "glm": ProviderConfig(
                provider_id="glm", kind=ProviderKind.LLM, base_url="https://example.test/v1"
            ),
        }
    )


def test_factory_returns_searxng_adapter_when_search_provider_id_given():
    payload = {"results": [{"url": "https://s.test/1", "title": "t", "content": "c"}] * 1}
    calls = []

    def flaky_then_ok(url, headers):
        calls.append(url)
        if len(calls) < 2:
            return 503, {}
        return 200, payload

    factory = ProviderFactory(_search_config(), transport=flaky_then_ok)
    provider = factory.search_for(search_provider_id="searxng-local")
    assert isinstance(provider, RetryingProvider)
    results = provider.search(SearchRequest(query="q", max_results=5))
    assert [r.url for r in results] == ["https://s.test/1"]
    assert len(calls) == 2  # retried per the provider's retry policy


def test_factory_search_default_stays_mock():
    factory = ProviderFactory(_search_config())
    provider = factory.search_for(fixture_results=())
    assert isinstance(provider, RetryingProvider)
    assert provider.search(SearchRequest(query="q")) == []


def test_factory_search_unknown_or_wrong_kind_provider_is_structured_error():
    factory = ProviderFactory(_search_config())
    with pytest.raises(MorphoError) as excinfo:
        factory.search_for(search_provider_id="missing")
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE
    assert excinfo.value.retryable is False
    assert "missing" in excinfo.value.user_message

    with pytest.raises(MorphoError) as excinfo:
        factory.search_for(search_provider_id="glm")
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE
    assert "search" in excinfo.value.user_message


def test_factory_offline_mock_wins_over_requested_search_provider():
    factory = ProviderFactory(
        WorkerConfig(offline_mock=True, providers=_search_config().providers)
    )
    provider = factory.search_for(search_provider_id="searxng-local")
    # Offline mode never touches the network: the mock path answers directly.
    assert provider.search(SearchRequest(query="q")) == []
