"""Worker event primitives (PY-03, draft contract).

Implements the documented draft event model from ``docs/API.md``/PRD §8:

- envelope schema ``research.event.v1`` with run/task ids, a per-job
  monotonic ``sequence``, UTC timestamp, type, and an already-redacted
  payload,
- append-only, ordered event log with cursor-based reconnect
  (``replay(job_id, after_sequence=...)``),
- duplicate identification via the stable ``(job_id, sequence)`` identity,
- JSONL and SSE codecs,
- redaction of sensitive payload fields before storage.

Final field names and error semantics are frozen by W2-02; this module only
implements the documented draft so the Rust side can be integrated against
it. Raw LLM responses and secrets must never be appended: the redaction
layer is a safety net, not a license to include them.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from typing import Any

from morpho_worker.clock import Clock
from morpho_worker.ids import new_id

EVENT_SCHEMA = "research.event.v1"

#: Substring markers that trigger masking. ``cache_key`` and similar
#: non-secret identifiers are intentionally left visible.
_SENSITIVE_MARKERS = (
    "api_key",
    "apikey",
    "authorization",
    "credential",
    "password",
    "passwd",
    "secret",
    "token",
    "raw_prompt",
    "raw_response",
)
_EXACT_SENSITIVE = {"key", "raw"}
_REDACTED = "***REDACTED***"


def _is_sensitive(name: str) -> bool:
    lowered = name.lower()
    if lowered in _EXACT_SENSITIVE:
        return True
    return any(marker in lowered for marker in _SENSITIVE_MARKERS)


def redact(value: Any) -> Any:
    """Deep-copy ``value`` masking sensitive fields. Lists and dicts are
    walked recursively; everything else is returned as-is."""

    if isinstance(value, dict):
        return {
            name: (_REDACTED if _is_sensitive(name) else redact(item))
            for name, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, tuple):
        return [redact(item) for item in value]
    return value


@dataclass(frozen=True)
class EventEnvelope:
    event_id: str
    job_id: str
    sequence: int
    timestamp: str
    type: str
    task_id: str | None
    payload: dict[str, Any] = field(default_factory=dict)

    @property
    def identity(self) -> tuple[str, int]:
        """Stable identity used to detect duplicate delivery on reconnect."""

        return (self.job_id, self.sequence)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": EVENT_SCHEMA,
            "event_id": self.event_id,
            "job_id": self.job_id,
            "sequence": self.sequence,
            "timestamp": self.timestamp,
            "type": self.type,
            "task_id": self.task_id,
            "payload": self.payload,
        }

    def to_jsonl(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))

    def to_sse(self) -> str:
        data = json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))
        lines = [f"id: {self.sequence}", f"event: {self.type}", f"data: {data}", ""]
        return "\n".join(lines) + "\n"


def event_from_dict(data: dict[str, Any]) -> EventEnvelope:
    required = ("event_id", "job_id", "sequence", "timestamp", "type")
    missing = [name for name in required if name not in data]
    if missing or data.get("schema_version") != EVENT_SCHEMA:
        raise ValueError(
            f"not a valid {EVENT_SCHEMA} envelope (missing: {missing or 'schema_version'})"
        )
    payload = data.get("payload")
    if payload is not None and not isinstance(payload, dict):
        raise ValueError("event payload must be an object")
    return EventEnvelope(
        event_id=str(data["event_id"]),
        job_id=str(data["job_id"]),
        sequence=int(data["sequence"]),
        timestamp=str(data["timestamp"]),
        type=str(data["type"]),
        task_id=data.get("task_id"),
        payload=dict(payload or {}),
    )


def event_from_jsonl(line: str) -> EventEnvelope:
    try:
        data = json.loads(line)
    except json.JSONDecodeError as exc:
        raise ValueError(f"malformed event JSONL: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("event JSONL line must decode to an object")
    return event_from_dict(data)


def parse_sse(chunk: str) -> list[EventEnvelope]:
    """Parse a finite SSE chunk back into envelopes (protocol tests)."""

    events: list[EventEnvelope] = []
    for block in chunk.split("\n\n"):
        block = block.strip("\n")
        if not block.strip():
            continue
        data_lines: list[str] = []
        for line in block.split("\n"):
            if line.startswith("data:"):
                data_lines.append(line[len("data:") :].lstrip())
        if not data_lines:
            raise ValueError("SSE block without data line")
        events.append(event_from_jsonl("\n".join(data_lines)))
    return events


class EventLogClosed(RuntimeError):
    """Raised when appending to a closed job event log."""


class EventLog:
    """Ordered, append-only, reconnectable event log.

    One sequence space per job id. Appends assign the sequence under a lock,
    so events emitted from worker threads are totally ordered. Consumers
    reconnect by asking for everything after their last seen sequence.
    """

    def __init__(self, clock: Clock) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._events: dict[str, list[EventEnvelope]] = {}
        self._dedup: dict[tuple[str, str], EventEnvelope] = {}
        self._closed: set[str] = set()

    def append(
        self,
        job_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        task_id: str | None = None,
        dedup_key: str | None = None,
        redact_payload: bool = True,
    ) -> EventEnvelope:
        stored_payload = redact(payload) if redact_payload else dict(payload or {})
        with self._condition:
            if job_id in self._closed:
                raise EventLogClosed(f"event log for job {job_id} is closed")
            if dedup_key is not None:
                existing = self._dedup.get((job_id, dedup_key))
                if existing is not None:
                    return existing
            sequence = len(self._events.get(job_id, [])) + 1
            envelope = EventEnvelope(
                event_id=new_id(),
                job_id=job_id,
                sequence=sequence,
                timestamp=self._clock.now_utc().isoformat(),
                type=event_type,
                task_id=task_id,
                payload=stored_payload,
            )
            self._events.setdefault(job_id, []).append(envelope)
            if dedup_key is not None:
                self._dedup[(job_id, dedup_key)] = envelope
            self._condition.notify_all()
            return envelope

    def replay(
        self, job_id: str, after_sequence: int = 0, limit: int | None = None
    ) -> list[EventEnvelope]:
        """Events strictly after ``after_sequence`` (cursor reconnect)."""

        with self._lock:
            events = self._events.get(job_id, [])
            selected = [event for event in events if event.sequence > after_sequence]
            return selected[:limit] if limit is not None else list(selected)

    def cursor(self, job_id: str) -> int:
        """Last assigned sequence for the job (0 when no events exist)."""

        with self._lock:
            events = self._events.get(job_id, [])
            return events[-1].sequence if events else 0

    def wait_for(
        self, job_id: str, after_sequence: int, timeout: float | None = None
    ) -> list[EventEnvelope]:
        """Block until at least one event after the cursor exists.

        Waits whenever there is nothing new after ``after_sequence`` (whether
        the log is empty or only holds events at/before the cursor), which is
        what streaming consumers reconnecting on a cursor need.
        """

        with self._condition:
            events = self._events.get(job_id, [])
            if not [event for event in events if event.sequence > after_sequence]:
                self._condition.wait(timeout=timeout)
                events = self._events.get(job_id, [])
            return [event for event in events if event.sequence > after_sequence]

    def close(self, job_id: str) -> None:
        """Close a finished job's log: appends fail, replay keeps working so
        late reconnects still resume from their cursor."""

        with self._lock:
            self._closed.add(job_id)

    def to_jsonl(self, job_id: str, after_sequence: int = 0) -> str:
        return "".join(event.to_jsonl() + "\n" for event in self.replay(job_id, after_sequence))
