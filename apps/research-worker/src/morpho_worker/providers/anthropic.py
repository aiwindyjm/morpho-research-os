"""Native Anthropic (Claude) LLM adapter (draft; frozen by W2-03).

Implements the :class:`~morpho_worker.providers.ports.LLMProvider` port
against Anthropic's Messages API (``POST {base_url}/v1/messages``):

- authentication uses the ``x-api-key`` header plus the mandatory
  ``anthropic-version`` header; the secret is a *key reference* resolved
  from the environment only at call time and never logged, cached, or
  stored;
- the response's ``content`` blocks are joined (text blocks only) into the
  response text; token counts come from the ``usage`` object.

Provider id conventions (configuration, not domain enums): the intended id
is ``anthropic`` (e.g. ``MORPHO_PROVIDER_ANTHROPIC_BASE_URL`` /
``MORPHO_PROVIDER_ANTHROPIC_KEY_REF`` / ``MORPHO_PROVIDER_ANTHROPIC_MODEL``),
with ``protocol = "anthropic"`` on the provider entry so the factory routes
to this adapter. The default config registers the id unrouted with an empty
model: accidental use fails loudly with PROVIDER_UNAVAILABLE instead of
silently calling a real endpoint.

Network access is isolated behind an injected transport callable so tests
never touch a real network; the default urllib transport is only used in
real deployments and enforces the same endpoint safety rules as the
OpenAI-compatible adapter (https anywhere, plain http only for loopback,
no redirects).

Error mapping (identical to the OpenAI-compatible adapter):

- missing/unresolvable key reference           -> PROVIDER_AUTH_FAILED
- transport timeout                            -> PROVIDER_TIMEOUT (retryable)
- connection errors / 429 / 5xx                -> PROVIDER_UNAVAILABLE (retryable)
- 401/403                                      -> PROVIDER_AUTH_FAILED
- other 4xx                                    -> PROVIDER_UNAVAILABLE (not retryable)
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any, Mapping

from morpho_worker.config import ProviderConfig, resolve_key_reference
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.openai_compat import (
    HttpTransport,
    _NoRedirect,
    validate_endpoint,
)
from morpho_worker.providers.ports import LLMRequest, LLMResponse

#: Anthropic API version pinned per the Messages API contract.
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_BASE_URL = "https://api.anthropic.com"


def urllib_transport(provider: ProviderConfig) -> HttpTransport:
    """Default transport built from the provider config.

    This path performs real network I/O and is therefore never exercised by
    tests; tests inject deterministic fakes instead.
    """

    parts = validate_endpoint(provider.base_url.rstrip("/") + "/v1/messages")
    url = parts.geturl()
    # Redirects are not followed: credentials must not be replayed elsewhere.
    opener = urllib.request.build_opener(_NoRedirect)

    def transport(payload: dict, headers: dict) -> tuple[int, dict]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
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


class AnthropicLLM:
    def __init__(
        self,
        provider: ProviderConfig,
        *,
        env: Mapping[str, str] | None = None,
        transport: HttpTransport | None = None,
    ) -> None:
        self.provider = provider
        self._env = dict(env or {})
        self._transport = transport or urllib_transport(provider)

    def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.provider.model
        if not model:
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "The provider is not configured with a model.",
                developer_detail=f"provider_id={self.provider.provider_id}",
                retryable=False,
            )
        headers: dict[str, str] = {"anthropic-version": ANTHROPIC_VERSION}
        key_reference = self.provider.key_reference
        if key_reference:
            secret = resolve_key_reference(key_reference, self._env)
            if not secret:
                raise MorphoError(
                    ErrorCode.PROVIDER_AUTH_FAILED,
                    "The configured model credential is missing. Set the referenced environment variable or keychain entry.",
                    developer_detail=(
                        f"provider_id={self.provider.provider_id} "
                        f"key_reference={key_reference} (value never logged)"
                    ),
                    retryable=False,
                )
            headers["x-api-key"] = secret

        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": request.max_output_tokens,
            "temperature": request.temperature,
            "messages": [{"role": "user", "content": request.prompt}],
        }
        if request.system:
            payload["system"] = request.system

        started = time.monotonic()
        try:
            status, body = self._transport(payload, headers)
        except TimeoutError as exc:
            raise MorphoError(
                ErrorCode.PROVIDER_TIMEOUT,
                "The model provider timed out.",
                developer_detail=f"provider_id={self.provider.provider_id} timeout_seconds={self.provider.timeout_seconds}",
                retryable=True,
                correlation_id=request.correlation_id,
            ) from exc
        except OSError as exc:
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "The model provider could not be reached.",
                developer_detail=f"provider_id={self.provider.provider_id} error={exc}",
                retryable=True,
                correlation_id=request.correlation_id,
            ) from exc
        duration_ms = int((time.monotonic() - started) * 1000)

        if status in (401, 403):
            raise MorphoError(
                ErrorCode.PROVIDER_AUTH_FAILED,
                "The model provider rejected the credential.",
                developer_detail=f"provider_id={self.provider.provider_id} status={status}",
                retryable=False,
                correlation_id=request.correlation_id,
                details={"http_status": status},
            )
        if status >= 400:
            retryable = status == 429 or status >= 500
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "The model provider could not complete the request.",
                developer_detail=f"provider_id={self.provider.provider_id} status={status}",
                retryable=retryable,
                correlation_id=request.correlation_id,
                details={"http_status": status},
            )

        try:
            blocks = body["content"]
            usage = body.get("usage") or {}
            stop_reason = str(body.get("stop_reason", ""))
        except (KeyError, TypeError) as exc:
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "The model provider returned an unreadable response.",
                developer_detail=f"provider_id={self.provider.provider_id} missing content/usage in response",
                retryable=False,
                correlation_id=request.correlation_id,
            ) from exc
        text = "".join(
            block.get("text", "")
            for block in blocks
            if isinstance(block, dict) and block.get("type") == "text"
        )
        return LLMResponse(
            text=text,
            provider_id=self.provider.provider_id,
            model=str(body.get("model", model)),
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
            duration_ms=duration_ms,
            finish_reason=stop_reason,
        )
