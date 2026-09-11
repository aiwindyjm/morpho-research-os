import uuid

import morpho_worker
from morpho_worker.clock import FakeClock, SystemClock
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.ids import (
    canonical_json,
    content_fingerprint,
    new_id,
    stable_id,
    stable_key,
)
from morpho_worker.version import app_version


def test_package_importable_and_versioned():
    assert morpho_worker.__version__ == app_version()
    assert morpho_worker.__version__ == "0.0.1"


def test_new_id_is_uuid7_and_sortable():
    first = new_id()
    second = new_id()
    assert uuid.UUID(first).version == 7
    assert uuid.UUID(second).version == 7
    assert first != second
    assert first <= second


def test_stable_id_and_key_are_deterministic():
    assert stable_id("node", "Concept", "quantum entanglement") == stable_id(
        "node", "Concept", "quantum entanglement"
    )
    assert stable_id("a", "b") != stable_id("b", "a")
    assert stable_key({"b": 1, "a": 2}) == stable_key({"a": 2, "b": 1})
    assert canonical_json({"b": 1, "a": [1, 2]}) == '{"a":[1,2],"b":1}'
    assert content_fingerprint("x") == content_fingerprint("x")
    assert content_fingerprint("x") != content_fingerprint("y")


def test_fake_clock_is_deterministic():
    clock = FakeClock()
    start = clock.now_utc()
    clock.sleep(1.5)
    assert clock.monotonic() == 1.5
    assert (clock.now_utc() - start).total_seconds() == 1.5
    assert SystemClock().now_utc().tzinfo is not None


def test_morpho_error_envelope_and_default_retryable():
    error = MorphoError(
        ErrorCode.PROVIDER_TIMEOUT,
        "The model provider timed out.",
        developer_detail="POST /chat/completions exceeded 60s",
        correlation_id="corr-1",
        details={"attempt": 2},
    )
    payload = error.to_dict()
    assert payload == {
        "code": "PROVIDER_TIMEOUT",
        "user_message": "The model provider timed out.",
        "developer_detail": "POST /chat/completions exceeded 60s",
        "retryable": True,
        "correlation_id": "corr-1",
        "details": {"attempt": 2},
    }
    assert MorphoError(ErrorCode.PROVIDER_AUTH_FAILED, "x").retryable is False
    assert MorphoError(ErrorCode.PLAN_NOT_APPROVED, "x").retryable is False
    assert MorphoError(ErrorCode.LLM_INVALID_JSON, "x", retryable=False).retryable is False


def test_documented_error_codes_present():
    documented = {
        "WORKER_NOT_AVAILABLE",
        "PROVIDER_AUTH_FAILED",
        "PROVIDER_TIMEOUT",
        "SEARCH_FAILED",
        "SOURCE_PARSE_FAILED",
        "LLM_INVALID_JSON",
        "TASK_DEPENDENCY_FAILED",
        "VAULT_WRITE_FAILED",
        "DATABASE_ERROR",
    }
    assert documented <= {code.value for code in ErrorCode}
