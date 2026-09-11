"""Orchestrator dispatch skeleton (PY-04).

The orchestrator is the only component allowed to move research work
forward and the only writer of job events. This skeleton provides the
task-type dispatch table and structured event emission; the durable DAG
lifecycle (plan gating, scheduling, pause/cancel/retry, checkpoints) grows
into this class in RES-01/RES-02.
"""

from __future__ import annotations

from typing import Any, Callable

from morpho_worker.domain.research import RuntimeTaskType
from morpho_worker.errors import MorphoError
from morpho_worker.events import EventLog

StageHandler = Callable[..., Any]


class Orchestrator:
    def __init__(self, event_log: EventLog | None = None, job_id: str = "") -> None:
        self._handlers: dict[RuntimeTaskType, StageHandler] = {}
        self._event_log = event_log
        self._job_id = job_id

    def register(self, task_type: RuntimeTaskType, handler: StageHandler) -> None:
        self._handlers[task_type] = handler

    def dispatch(self, task_type: RuntimeTaskType, task_id: str, /, **kwargs: Any) -> Any:
        """Run one task's stage through its registered handler.

        Structured stage errors propagate unchanged; the orchestrator
        records start/completion/failure events when an event log is bound.
        """

        if task_type not in RuntimeTaskType:
            raise MorphoError(
                "UNSUPPORTED_TASK_TYPE",
                "The requested task type is not supported by this worker.",
                developer_detail=f"task_type={task_type!r}",
                retryable=False,
            )
        handler = self._handlers.get(task_type)
        if handler is None:
            raise MorphoError(
                "TASK_HANDLER_MISSING",
                "No stage is registered for this task type.",
                developer_detail=f"task_type={task_type.value}",
                retryable=False,
            )
        self._emit(task_id, "task.started", {"task_type": task_type.value})
        try:
            result = handler(**kwargs)
        except MorphoError as exc:
            self._emit(
                task_id,
                "task.failed",
                {"task_type": task_type.value, "error_code": exc.to_dict()["code"]},
            )
            raise
        self._emit(task_id, "task.completed", {"task_type": task_type.value})
        return result

    def _emit(self, task_id: str, event_type: str, payload: dict) -> None:
        if self._event_log is None:
            return
        self._event_log.append(
            self._job_id or "orchestrator",
            event_type,
            payload,
            task_id=task_id,
            dedup_key=None,
        )
