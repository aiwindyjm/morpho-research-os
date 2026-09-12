"""Clock abstraction so time-dependent behavior (TTL, backoff, timestamps) is
deterministic in tests."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Protocol


class Clock(Protocol):
    def now_utc(self) -> datetime: ...

    def monotonic(self) -> float: ...

    def sleep(self, seconds: float) -> None: ...


class SystemClock:
    def now_utc(self) -> datetime:
        return datetime.now(timezone.utc)

    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        if seconds > 0:
            time.sleep(seconds)


class FakeClock:
    """Manually advanced clock; ``sleep`` advances instantly."""

    def __init__(self, start: datetime | None = None) -> None:
        self._now = start or datetime(2026, 1, 1, tzinfo=timezone.utc)
        self._mono = 0.0
        self._lock = threading.Lock()

    def now_utc(self) -> datetime:
        with self._lock:
            return self._now

    def monotonic(self) -> float:
        with self._lock:
            return self._mono

    def sleep(self, seconds: float) -> None:
        with self._lock:
            self._now = datetime.fromtimestamp(
                self._now.timestamp() + seconds, tz=timezone.utc
            )
            self._mono += seconds

    def advance(self, seconds: float) -> None:
        self.sleep(seconds)
