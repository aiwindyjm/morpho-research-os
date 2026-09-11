"""Structured worker errors.

Codes follow ``docs/api/ERRORS.md``: every error carries a stable code, a
safe user message, developer detail, a retryable flag, and a correlation id.

Contract note (proposal pending contract freeze, see worker README): the two
codes marked ``PROPOSAL`` below are not in the initial code list of
``docs/api/ERRORS.md``. They are required by workgroup D acceptance criteria
("a clear error when the configured model is unavailable" and "the DAG must
not run before plan approval"). They are single additions following the exact
error envelope of the existing codes and must be ratified or renamed when
workgroup A freezes the error contract.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

_DEFAULT_RETRYABLE: dict["ErrorCode", bool] = {}


class ErrorCode(str, Enum):
    WORKER_NOT_AVAILABLE = "WORKER_NOT_AVAILABLE"
    PROVIDER_AUTH_FAILED = "PROVIDER_AUTH_FAILED"
    PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
    #: PROPOSAL (pending W2-03/W2-02 contract freeze): provider or model is
    #: configured but unreachable/unavailable. Distinct from PROVIDER_TIMEOUT
    #: (the request was sent and timed out) and WORKER_NOT_AVAILABLE (the
    #: worker process itself is down).
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    SEARCH_FAILED = "SEARCH_FAILED"
    SOURCE_PARSE_FAILED = "SOURCE_PARSE_FAILED"
    LLM_INVALID_JSON = "LLM_INVALID_JSON"
    TASK_DEPENDENCY_FAILED = "TASK_DEPENDENCY_FAILED"
    VAULT_WRITE_FAILED = "VAULT_WRITE_FAILED"
    DATABASE_ERROR = "DATABASE_ERROR"
    #: PROPOSAL (pending contract freeze): a run was requested for a plan that
    #: has not been approved by the user.
    PLAN_NOT_APPROVED = "PLAN_NOT_APPROVED"


for _code in ErrorCode:
    _DEFAULT_RETRYABLE[_code] = _code in {
        ErrorCode.PROVIDER_TIMEOUT,
        ErrorCode.PROVIDER_UNAVAILABLE,
        ErrorCode.SEARCH_FAILED,
        ErrorCode.SOURCE_PARSE_FAILED,
        ErrorCode.LLM_INVALID_JSON,
        ErrorCode.TASK_DEPENDENCY_FAILED,
    }


class MorphoError(Exception):
    """The single structured error type used across the worker."""

    def __init__(
        self,
        code: ErrorCode,
        user_message: str,
        *,
        developer_detail: str = "",
        retryable: bool | None = None,
        correlation_id: str = "",
        details: dict[str, Any] | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(user_message)
        self.code = code
        self.user_message = user_message
        self.developer_detail = developer_detail
        self.retryable = _DEFAULT_RETRYABLE[code] if retryable is None else retryable
        self.correlation_id = correlation_id
        self.details = dict(details or {})
        self.cause = cause

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code.value,
            "user_message": self.user_message,
            "developer_detail": self.developer_detail,
            "retryable": self.retryable,
            "correlation_id": self.correlation_id,
        }
        if self.details:
            payload["details"] = self.details
        if self.cause is not None:
            payload["cause"] = type(self.cause).__name__
        return payload

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"MorphoError(code={self.code.value!r}, retryable={self.retryable!r}, "
            f"user_message={self.user_message!r})"
        )
