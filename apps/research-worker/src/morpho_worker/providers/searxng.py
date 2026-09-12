"""SearXNG search adapter (optional real search source; RES-03 boundary).

A self-hosted SearXNG instance's JSON API is queried with a single GET
request whose query parameters are derived from the ``SearchRequest``. The
adapter is only constructed when configuration explicitly selects a
``kind=search`` provider; the worker default remains the deterministic mock.

Network access is isolated behind an injected transport callable exactly like
the OpenAI-compatible adapter (see ``openai_compat``): tests never touch a
real network, and the default urllib transport is only used in real
deployments. For this adapter the transport's payload slot carries the full
request URL (GET) instead of a JSON body.

Endpoint safety rules are the same and are enforced eagerly at construction:
only ``https://`` or loopback ``http://`` endpoints are accepted, and
redirects are not followed. SearXNG's JSON API needs no credential, so the
``env`` mapping is accepted for interface parity but unused.

Error mapping (SEARCH_FAILED everywhere, mirroring the port contract):

- transport timeout / connection errors        -> SEARCH_FAILED (retryable)
- HTTP 429 / 5xx                               -> SEARCH_FAILED (retryable)
- other 4xx                                    -> SEARCH_FAILED (not retryable)
- unreadable payload (no ``results`` list)     -> SEARCH_FAILED (not retryable)
"""

from __future__ import annotations

import datetime as dt
import json
import urllib.error
import urllib.request
from typing import Mapping
from urllib.parse import urlencode

from morpho_worker.config import ProviderConfig
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.openai_compat import (
    _NoRedirect,
    HttpTransport,
    validate_endpoint,
)
from morpho_worker.providers.ports import RawSearchResult, SearchRequest
from morpho_worker.stages.search_stage import canonicalize_url

#: SearXNG accepts only coarse recency buckets; the narrowest bucket that
#: still covers the requested window is chosen (a superset never drops an
#: in-window result).
_TIME_RANGE_BUCKETS: tuple[tuple[str, int], ...] = (
    ("day", 1),
    ("week", 7),
    ("month", 31),
    ("year", 366),
)


def _utcnow() -> dt.datetime:
    # Module-level indirection so tests can pin the clock deterministically.
    return dt.datetime.now(dt.timezone.utc)


def _parse_iso(value: object) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed


def _time_range_bucket(request: SearchRequest) -> str | None:
    """Map the request's time window onto SearXNG's ``time_range`` parameter.

    A lower bound alone is measured against the current clock; a window wider
    than a year, an upper bound only, or unparseable bounds cannot be
    expressed by SearXNG and omit the parameter (the engine then defaults to
    unrestricted results).
    """

    start = _parse_iso(request.time_range_from)
    if start is None:
        return None
    end = _parse_iso(request.time_range_to) or _utcnow()
    span_days = (end - start).total_seconds() / 86400
    if span_days < 0:
        return None
    for label, days in _TIME_RANGE_BUCKETS:
        if span_days <= days:
            return label
    return None


def _published_at(value: object) -> str | None:
    """Keep ``publishedDate`` as the original string when parseable."""

    if not isinstance(value, str) or not value.strip():
        return None
    if _parse_iso(value) is None:
        return None
    return value.strip()


def urllib_search_transport(provider: ProviderConfig) -> HttpTransport:
    """Default GET transport built from the provider config.

    This path performs real network I/O and is therefore never exercised by
    tests; tests inject deterministic fakes instead.
    """

    # Redirects are not followed, mirroring the LLM transport rule.
    opener = urllib.request.build_opener(_NoRedirect)

    def transport(url: str, headers: dict) -> tuple[int, dict]:
        request = urllib.request.Request(
            url,
            headers={"Accept": "application/json", **headers},
            method="GET",
        )
        try:
            with opener.open(request, timeout=provider.timeout_seconds) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body: dict = {}
            try:
                body = json.loads(exc.read().decode("utf-8"))
            except Exception:  # noqa: S110 - body is best-effort for errors
                pass
            return exc.code, body
        except TimeoutError:
            raise
        except (OSError, urllib.error.URLError) as exc:
            raise OSError(str(exc)) from exc

    return transport


class SearxngSearch:
    """SearXNG adapter implementing the ``SearchProvider`` port."""

    def __init__(
        self,
        provider: ProviderConfig,
        *,
        env: Mapping[str, str] | None = None,
        transport: HttpTransport | None = None,
    ) -> None:
        # Fail fast on unsafe endpoints, with or without an injected
        # transport: plain http is loopback-only (same rule as the
        # OpenAI-compatible adapter).
        validate_endpoint(provider.base_url.rstrip("/") + "/search")
        self.provider = provider
        # SearXNG's JSON API needs no credential; env is kept for interface
        # parity with the other adapters.
        self._env = dict(env or {})
        self._transport = transport or urllib_search_transport(provider)

    def search(self, request: SearchRequest) -> list[RawSearchResult]:
        params: dict[str, str] = {
            "q": request.query,
            "format": "json",
            "pageno": "1",
        }
        if request.languages:
            params["language"] = "|".join(request.languages)
        time_range = _time_range_bucket(request)
        if time_range:
            params["time_range"] = time_range
        url = self.provider.base_url.rstrip("/") + "/search?" + urlencode(params)
        headers = {"Accept": "application/json"}

        try:
            status, body = self._transport(url, headers)
        except TimeoutError as exc:
            raise MorphoError(
                ErrorCode.SEARCH_FAILED,
                "The search provider timed out.",
                developer_detail=(
                    f"provider_id={self.provider.provider_id} "
                    f"timeout_seconds={self.provider.timeout_seconds}"
                ),
                retryable=True,
                correlation_id=request.correlation_id,
            ) from exc
        except OSError as exc:
            raise MorphoError(
                ErrorCode.SEARCH_FAILED,
                "The search provider could not be reached.",
                developer_detail=f"provider_id={self.provider.provider_id} error={exc}",
                retryable=True,
                correlation_id=request.correlation_id,
            ) from exc

        if status >= 400:
            retryable = status == 429 or status >= 500
            raise MorphoError(
                ErrorCode.SEARCH_FAILED,
                "The search provider could not complete the request.",
                developer_detail=f"provider_id={self.provider.provider_id} status={status}",
                retryable=retryable,
                correlation_id=request.correlation_id,
                details={"http_status": status},
            )

        results = body.get("results") if isinstance(body, dict) else None
        if not isinstance(results, list):
            raise MorphoError(
                ErrorCode.SEARCH_FAILED,
                "The search provider returned an unreadable response.",
                developer_detail=(
                    f"provider_id={self.provider.provider_id} "
                    "missing results list in response"
                ),
                retryable=False,
                correlation_id=request.correlation_id,
            )

        parsed: list[RawSearchResult] = []
        seen: set[str] = set()
        limit = max(0, request.max_results)
        for entry in results:
            if len(parsed) >= limit:
                break
            if not isinstance(entry, dict):
                continue
            entry_url = entry.get("url")
            if not isinstance(entry_url, str) or not entry_url.strip():
                continue
            canonical = canonicalize_url(entry_url)
            if canonical in seen:
                continue
            seen.add(canonical)
            title = entry.get("title")
            snippet = entry.get("content")
            parsed.append(
                RawSearchResult(
                    title=title.strip() if isinstance(title, str) else "",
                    url=entry_url.strip(),
                    snippet=snippet.strip() if isinstance(snippet, str) else "",
                    source_type="web_page",
                    published_at=_published_at(entry.get("publishedDate")),
                )
            )
        return parsed
