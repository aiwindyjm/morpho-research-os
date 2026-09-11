"""OpenAI-compatible LLM adapter (draft; frozen by W2-03).

One adapter serves every OpenAI-compatible backend (GLM, Ollama's
OpenAI endpoint, OpenAI, DeepSeek, ...): the base URL, model, timeout, retry
budget, and key *reference* are all configuration. The secret value is
resolved from the environment only at call time and is never logged,
cached, or stored.

Network access is isolated behind an injected transport callable so tests
never touch a real network; the default urllib transport is only used in
real deployments.

Endpoint safety rules for the default transport (local desktop worker):

- only ``https://`` and ``http://`` schemes are accepted;
- plain ``http://`` is restricted to loopback hosts (the local-model case,
  e.g. Ollama) so credentials never travel over cleartext to remote hosts;
- redirects are not followed.

Draft error mapping (documented in the worker README, ratified by W2-03):

- missing/unresolvable key reference           -> PROVIDER_AUTH_FAILED
- transport timeout                            -> PROVIDER_TIMEOUT (retryable)
- connection errors / 429 / 5xx                -> PROVIDER_UNAVAILABLE (retryable)
- 401/403                                      -> PROVIDER_AUTH_FAILED
- other 4xx                                    -> PROVIDER_UNAVAILABLE (not retryable)
"""

from __future__ import annotations

import ipaddress
import json
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Mapping
from urllib.parse import urlsplit

from morpho_worker.config import ProviderConfig, resolve_key_reference
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.ports import LLMRequest, LLMResponse

#: transport(payload: dict, headers: dict) -> (http_status, parsed_json_body).
#: Implementations raise TimeoutError on timeout and OSError on connection
#: failures, mirroring the stdlib socket error hierarchy.
HttpTransport = Callable[[dict, dict], tuple[int, dict]]


class EndpointNotAllowed(ValueError):
    """The configured provider endpoint violates the transport safety rules."""


def validate_endpoint(url: str) -> urlsplit.SplitResult:
    """Enforce the endpoint safety rules and return the parsed URL."""

    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise EndpointNotAllowed(f"provider endpoint must be http(s) with a host: {url!r}")
    if parts.scheme == "https":
        return parts
    host = parts.hostname.rstrip(".")
    try:
        address = ipaddress.ip_address(host)
        loopback = address.is_loopback
    except ValueError:
        loopback = host.lower() in ("localhost",)
    if not loopback:
        raise EndpointNotAllowed(
            f"plain http is only allowed for loopback endpoints, got: {url!r}"
        )
    return parts


def urllib_transport(provider: ProviderConfig) -> HttpTransport:
    """Default transport built from the provider config.

    This path performs real network I/O and is therefore never exercised by
    tests; tests inject deterministic fakes instead.
    """

    parts = validate_endpoint(provider.base_url.rstrip("/") + "/chat/completions")
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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


class OpenAICompatibleLLM:
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
            headers["Authorization"] = f"Bearer {secret}"

        messages: list[dict[str, str]] = []
        if request.system:
            messages.append({"role": "system", "content": request.system})
        if request.prompt:
            messages.append({"role": "user", "content": request.prompt})
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_output_tokens,
        }
        if request.expect_json:
            payload["response_format"] = {"type": "json_object"}

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
            choice = body["choices"][0]["message"]["content"]
            usage = body.get("usage") or {}
        except (KeyError, IndexError, TypeError) as exc:
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "The model provider returned an unreadable response.",
                developer_detail=f"provider_id={self.provider.provider_id} missing choices/usage in response",
                retryable=False,
                correlation_id=request.correlation_id,
            ) from exc
        return LLMResponse(
            text=choice if isinstance(choice, str) else json.dumps(choice, ensure_ascii=False),
            provider_id=self.provider.provider_id,
            model=body.get("model", model),
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            duration_ms=duration_ms,
            finish_reason=str(body.get("choices", [{}])[0].get("finish_reason", "")),
        )
