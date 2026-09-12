"""Native Google Gemini LLM adapter (draft; frozen by W2-03).

Implements the :class:`~morpho_worker.providers.ports.LLMProvider` port
against the Gemini generateContent API
(``POST {base_url}/v1beta/models/{model}:generateContent``):

- authentication uses the ``x-goog-api-key`` header; the secret is a *key
  reference* resolved from the environment only at call time and never
  logged, cached, or stored;
- the system prompt maps to ``systemInstruction``, the user prompt to a
  single ``contents`` turn, and JSON expectations to
  ``generationConfig.responseMimeType = "application/json"``;
- the response text joins the first candidate's ``content.parts`` texts;
  token counts come from ``usageMetadata``.

Provider id conventions (configuration, not domain enums): the intended id
is ``gemini`` (e.g. ``MORPHO_PROVIDER_GEMINI_BASE_URL`` /
``MORPHO_PROVIDER_GEMINI_KEY_REF`` / ``MORPHO_PROVIDER_GEMINI_MODEL``),
with ``protocol = "gemini"`` on the provider entry so the factory routes to
this adapter. The default config registers the id unrouted with an empty
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
from urllib.parse import quote

from morpho_worker.config import ProviderConfig, resolve_key_reference
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.openai_compat import (
    HttpTransport,
    _NoRedirect,
    validate_endpoint,
)
from morpho_worker.providers.ports import LLMRequest, LLMResponse

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"


def endpoint_url(base_url: str, model: str) -> str:
    """``{base}/v1beta/models/{model}:generateContent`` (model quoted)."""

    return (
        base_url.rstrip("/")
        + "/v1beta/models/"
        + quote(model, safe="")
        + ":generateContent"
    )


def urllib_transport(provider: ProviderConfig, model: str) -> HttpTransport:
    """Default transport built from the provider config.

    This path performs real network I/O and is therefore never exercised by
    tests; tests inject deterministic fakes instead.
    """

    parts = validate_endpoint(endpoint_url(provider.base_url, model))
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


class GeminiLLM:
    def __init__(
        self,
        provider: ProviderConfig,
        *,
        env: Mapping[str, str] | None = None,
        transport: HttpTransport | None = None,
    ) -> None:
        self.provider = provider
        self._env = dict(env or {})
        self._transport = transport

    def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.provider.model
        if not model:
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "The provider is not configured with a model.",
                developer_detail=f"provider_id={self.provider.provider_id}",
                retryable=False,
            )
        transport = self._transport or urllib_transport(self.provider, model)
        headers: dict[str, str] = {}
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
            headers["x-goog-api-key"] = secret

        payload: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": request.prompt}]}],
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_output_tokens,
            },
        }
        if request.system:
            payload["systemInstruction"] = {"parts": [{"text": request.system}]}
        if request.expect_json:
            payload["generationConfig"]["responseMimeType"] = "application/json"

        started = time.monotonic()
        try:
            status, body = transport(payload, headers)
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
            candidate = body["candidates"][0]
            parts = candidate["content"]["parts"]
            usage = body.get("usageMetadata") or {}
        except (KeyError, IndexError, TypeError) as exc:
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "The model provider returned an unreadable response.",
                developer_detail=f"provider_id={self.provider.provider_id} missing candidates/content in response",
                retryable=False,
                correlation_id=request.correlation_id,
            ) from exc
        text = "".join(str(part.get("text", "")) for part in parts)
        return LLMResponse(
            text=text,
            provider_id=self.provider.provider_id,
            model=str(body.get("modelVersion", model)),
            input_tokens=usage.get("promptTokenCount"),
            output_tokens=usage.get("candidatesTokenCount"),
            duration_ms=duration_ms,
            finish_reason=str(candidate.get("finishReason", "")),
        )
