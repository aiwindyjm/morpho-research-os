"""Structured LLM output gate.

Every LLM call in the worker goes through this pipeline::

    prompt render -> provider call -> parse -> validate -> normalize
                                     (cache around validated payloads)

LLM output can never bypass the gate: callers receive the *normalized domain
object*, and only validated payloads ever enter the cache. Parsing accepts
common code-fence wrapping but is otherwise strict JSON; failures raise the
documented ``LLM_INVALID_JSON`` error with a ``phase`` detail distinguishing
JSON parse errors from schema validation errors.

Cache keys include the prompt id/version, provider/model, and the canonical
(normalized) input, per ``docs/ai/CACHE_AND_COST.md``. A cache hit records a
usage entry with ``cache_hit=True`` and never calls the provider.
"""

from __future__ import annotations

import json
from typing import Callable, TypeVar

from pydantic import BaseModel, ValidationError

from morpho_worker.clock import Clock, SystemClock
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.ids import new_id
from morpho_worker.pipeline.prompts import PromptRegistry
from morpho_worker.providers.cache import NAMESPACE_LLM, CachePort, cache_key
from morpho_worker.providers.ports import LLMProvider, LLMRequest
from morpho_worker.providers.retry import RetryPolicy, sleep_backoff
from morpho_worker.providers.usage import UsageLedger, UsageRecord, estimate_cost, utc_now_iso

TModel = TypeVar("TModel", bound=BaseModel)
TOut = TypeVar("TOut")

_SCHEMA_VERSION = 1


def parse_llm_json(text: str, *, correlation_id: str = "") -> object:
    """Strict JSON parse with code-fence tolerance."""

    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].lstrip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise MorphoError(
            ErrorCode.LLM_INVALID_JSON,
            "The model returned output that is not valid JSON.",
            developer_detail=f"phase=parse error={exc}",
            retryable=True,
            correlation_id=correlation_id,
            details={"phase": "parse"},
        ) from exc


def validate_llm_payload(
    payload: object, output_schema: type[TModel], *, correlation_id: str = ""
) -> TModel:
    """Validate a parsed payload against its schema."""

    try:
        return output_schema.model_validate(payload)
    except ValidationError as exc:
        issues = [
            {
                "loc": [str(part) for part in error["loc"]],
                "type": error["type"],
                "msg": error["msg"],
            }
            for error in exc.errors()
        ]
        raise MorphoError(
            ErrorCode.LLM_INVALID_JSON,
            "The model output does not match the required structure.",
            developer_detail="phase=schema_validation",
            retryable=True,
            correlation_id=correlation_id,
            details={"phase": "schema_validation", "issues": issues[:20]},
        ) from exc


class StructuredOutputPipeline:
    """The only sanctioned path from an LLM to worker-internal data."""

    def __init__(
        self,
        llm: LLMProvider,
        prompts: PromptRegistry,
        *,
        usage: UsageLedger | None = None,
        cache: CachePort | None = None,
        retry: RetryPolicy | None = None,
        clock: Clock | None = None,
        cost_per_1k_input: float | None = None,
        cost_per_1k_output: float | None = None,
    ) -> None:
        self._llm = llm
        self._prompts = prompts
        self._usage = usage
        self._cache = cache
        self._retry = retry or RetryPolicy(max_attempts=3)
        self._clock = clock or SystemClock()
        self._cost_per_1k_input = cost_per_1k_input
        self._cost_per_1k_output = cost_per_1k_output

    def run(
        self,
        *,
        prompt_id: str,
        prompt_input: dict,
        output_schema: type[TModel],
        normalize: Callable[[TModel], TOut],
        provider_id: str,
        model: str,
        system_extra: str = "",
        run_id: str = "",
        task_id: str = "",
        correlation_id: str = "",
        prompt_version: int = 1,
    ) -> tuple[TOut, UsageRecord]:
        """Return ``(normalized, last_usage_record)`` for traceability."""

        asset, rendered = self._prompts.render(
            prompt_id, dict(prompt_input), version=prompt_version
        )
        key = cache_key(
            NAMESPACE_LLM,
            schema_version=_SCHEMA_VERSION,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            provider_id=provider_id,
            model=model,
            normalized_input=prompt_input,
        )

        if self._cache is not None:
            cached = self._cache.get(NAMESPACE_LLM, key)
            if cached is not None:
                validated = validate_llm_payload(
                    cached, output_schema, correlation_id=correlation_id
                )
                usage = self._record_usage(
                    provider_id=provider_id,
                    model=model,
                    prompt_id=prompt_id,
                    prompt_version=prompt_version,
                    run_id=run_id,
                    task_id=task_id,
                    correlation_id=correlation_id,
                    input_tokens=0,
                    output_tokens=0,
                    duration_ms=0,
                    cache_hit=True,
                    status="success",
                )
                return normalize(validated), usage

        request = LLMRequest(
            model=model,
            system=system_extra,
            prompt=rendered,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            correlation_id=correlation_id,
        )
        last_error: MorphoError | None = None
        for attempt in self._retry.attempts_range:
            started = self._clock.monotonic()
            try:
                response = self._llm.complete(request)
            except MorphoError as exc:
                duration_ms = int((self._clock.monotonic() - started) * 1000)
                self._record_usage(
                    provider_id=provider_id,
                    model=model,
                    prompt_id=prompt_id,
                    prompt_version=prompt_version,
                    run_id=run_id,
                    task_id=task_id,
                    correlation_id=correlation_id,
                    duration_ms=duration_ms,
                    status="failed",
                    error_code=str(
                        exc.code.value if hasattr(exc.code, "value") else exc.code
                    ),
                    attempt=attempt,
                )
                last_error = exc
                if exc.retryable and attempt < self._retry.max_attempts:
                    sleep_backoff(self._clock, self._retry, attempt)
                    continue
                raise
            try:
                payload = parse_llm_json(response.text, correlation_id=correlation_id)
                validated = validate_llm_payload(
                    payload, output_schema, correlation_id=correlation_id
                )
            except MorphoError as exc:
                # Parse and schema-validation failures are retryable: another
                # attempt may produce conforming output.
                duration_ms = int((self._clock.monotonic() - started) * 1000)
                self._record_usage(
                    provider_id=provider_id,
                    model=model,
                    prompt_id=prompt_id,
                    prompt_version=prompt_version,
                    run_id=run_id,
                    task_id=task_id,
                    correlation_id=correlation_id,
                    input_tokens=response.input_tokens or 0,
                    output_tokens=response.output_tokens or 0,
                    duration_ms=duration_ms,
                    status="failed",
                    error_code=ErrorCode.LLM_INVALID_JSON.value,
                    attempt=attempt,
                )
                last_error = exc
                if attempt < self._retry.max_attempts:
                    sleep_backoff(self._clock, self._retry, attempt)
                    continue
                raise MorphoError(
                    exc.code,
                    exc.user_message,
                    developer_detail=exc.developer_detail,
                    retryable=False,
                    correlation_id=correlation_id,
                    details={
                        "attempts": self._retry.max_attempts,
                        "last_error": exc.to_dict(),
                    },
                    cause=exc,
                )
            usage = self._record_usage(
                provider_id=provider_id,
                model=model,
                prompt_id=prompt_id,
                prompt_version=prompt_version,
                run_id=run_id,
                task_id=task_id,
                correlation_id=correlation_id,
                input_tokens=response.input_tokens or 0,
                output_tokens=response.output_tokens or 0,
                duration_ms=int((self._clock.monotonic() - started) * 1000),
                status="success",
                attempt=attempt,
            )
            if self._cache is not None:
                self._cache.put(
                    NAMESPACE_LLM,
                    key,
                    validated.model_dump(mode="json"),
                )
            return normalize(validated), usage

        raise last_error or MorphoError(
            ErrorCode.LLM_INVALID_JSON,
            "The model output could not be validated.",
            retryable=False,
        )

    def _record_usage(
        self,
        *,
        provider_id: str,
        model: str,
        prompt_id: str,
        prompt_version: int,
        run_id: str,
        task_id: str,
        correlation_id: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        duration_ms: int = 0,
        cache_hit: bool = False,
        status: str,
        error_code: str | None = None,
        attempt: int = 1,
    ) -> UsageRecord:
        usage = UsageRecord(
            usage_id=new_id(),
            provider_id=provider_id,
            model=model,
            purpose="structured_output",
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            run_id=run_id,
            task_id=task_id,
            correlation_id=correlation_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=duration_ms,
            estimated_cost=estimate_cost(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_per_1k_input=self._cost_per_1k_input,
                cost_per_1k_output=self._cost_per_1k_output,
            ),
            cache_hit=cache_hit,
            attempt=attempt,
            status=status,
            error_code=error_code,
            created_at=utc_now_iso(),
        )
        if self._usage is not None:
            self._usage.record(usage)
        return usage
