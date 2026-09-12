"""Task state machine (draft; W2-01 freezes the schema).

Only the orchestrator/runner performs transitions, and every transition is
validated here before it is persisted - events are projections of persisted
state, never the other way around (PRD §7).

Documented machine (PRD §7)::

    PENDING -> PLANNING -> RUNNING -> VALIDATING -> COMPLETED
                             |-> NEEDS_REVIEW
                             |-> PAUSED -> RUNNING
                             |-> FAILED -> RUNNING (retry)
                             |-> CANCELLED

Draft extensions (flagged in the worker README, ratified with the W2
contract freeze): ``FAILED -> PENDING`` allows the scheduler to requeue a
retryable failure or a manually retried task without pretending the task is
already running, ``PENDING -> FAILED`` records dependents whose upstream
failed with ``TASK_DEPENDENCY_FAILED`` (RESEARCH_ENGINE.md explicitly names
this dependent-failure state), and the interruptible states
(PLANNING/RUNNING/VALIDATING) may return to ``PENDING`` during crash
recovery so interrupted work resumes from its checkpoint.
"""

from __future__ import annotations

from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    PLANNING = "PLANNING"
    RUNNING = "RUNNING"
    VALIDATING = "VALIDATING"
    COMPLETED = "COMPLETED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    PAUSED = "PAUSED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


ALLOWED_TRANSITIONS: dict[TaskStatus, frozenset[TaskStatus]] = {
    TaskStatus.PENDING: frozenset(
        {TaskStatus.PLANNING, TaskStatus.RUNNING, TaskStatus.CANCELLED,
         TaskStatus.FAILED}
    ),
    TaskStatus.PLANNING: frozenset(
        {TaskStatus.RUNNING, TaskStatus.PENDING, TaskStatus.FAILED,
         TaskStatus.CANCELLED}
    ),
    TaskStatus.RUNNING: frozenset(
        {
            TaskStatus.VALIDATING,
            TaskStatus.COMPLETED,
            TaskStatus.NEEDS_REVIEW,
            TaskStatus.PAUSED,
            TaskStatus.FAILED,
            TaskStatus.CANCELLED,
            TaskStatus.PENDING,
        }
    ),
    TaskStatus.VALIDATING: frozenset(
        {TaskStatus.COMPLETED, TaskStatus.NEEDS_REVIEW, TaskStatus.FAILED,
         TaskStatus.CANCELLED, TaskStatus.PENDING}
    ),
    TaskStatus.NEEDS_REVIEW: frozenset(
        {TaskStatus.COMPLETED, TaskStatus.RUNNING, TaskStatus.CANCELLED}
    ),
    TaskStatus.PAUSED: frozenset({TaskStatus.RUNNING, TaskStatus.CANCELLED}),
    TaskStatus.FAILED: frozenset(
        {TaskStatus.RUNNING, TaskStatus.PENDING, TaskStatus.CANCELLED}
    ),
    TaskStatus.COMPLETED: frozenset(),
    TaskStatus.CANCELLED: frozenset(),
}

TERMINAL_STATUSES = frozenset({TaskStatus.COMPLETED, TaskStatus.CANCELLED})
#: States a task can be in while work is (or was) in flight; used by crash
#: recovery to find interrupted work.
INTERRUPTIBLE_STATUSES = frozenset(
    {TaskStatus.PLANNING, TaskStatus.RUNNING, TaskStatus.VALIDATING}
)


class IllegalTransition(ValueError):
    def __init__(self, from_status: TaskStatus, to_status: TaskStatus) -> None:
        super().__init__(
            f"illegal task transition {from_status.value} -> {to_status.value}"
        )


def validate_transition(from_status: TaskStatus, to_status: TaskStatus) -> None:
    if to_status not in ALLOWED_TRANSITIONS[from_status]:
        raise IllegalTransition(from_status, to_status)


class RunStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
