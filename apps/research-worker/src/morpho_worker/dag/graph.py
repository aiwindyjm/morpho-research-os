"""DAG graph utilities: validation, readiness, and dependency cascades.

The DAG is validated whenever tasks are created or added dynamically:
unknown/self dependencies and cycles are rejected up front with the
documented ``TASK_DEPENDENCY_FAILED`` error instead of being discovered as a
hang at runtime.
"""

from __future__ import annotations

from typing import Iterable, Sequence

from morpho_worker.dag.states import TaskStatus
from morpho_worker.errors import ErrorCode, MorphoError


def dependency_error(detail: str, correlation_id: str = "") -> MorphoError:
    return MorphoError(
        ErrorCode.TASK_DEPENDENCY_FAILED,
        "The research task graph is invalid or a dependency failed.",
        developer_detail=detail,
        retryable=False,
        correlation_id=correlation_id,
    )


def validate_dag(tasks: Sequence) -> None:
    """Reject unknown/self dependencies and cycles (Kahn's algorithm)."""

    by_id = {task.task_id: task for task in tasks}
    for task in tasks:
        for dep in task.depends_on:
            if dep == task.task_id:
                raise dependency_error(f"task {task.task_id} depends on itself")
            if dep not in by_id:
                raise dependency_error(
                    f"task {task.task_id} depends on unknown task {dep}"
                )

    indegree = {task.task_id: 0 for task in tasks}
    dependents: dict[str, list[str]] = {task.task_id: [] for task in tasks}
    for task in tasks:
        for dep in task.depends_on:
            indegree[task.task_id] += 1
            dependents[dep].append(task.task_id)

    queue = [task_id for task_id, degree in indegree.items() if degree == 0]
    visited = 0
    while queue:
        current = queue.pop()
        visited += 1
        for downstream in dependents[current]:
            indegree[downstream] -= 1
            if indegree[downstream] == 0:
                queue.append(downstream)
    if visited != len(tasks):
        stuck = sorted(task_id for task_id, degree in indegree.items() if degree > 0)
        raise dependency_error(f"dependency cycle detected among: {', '.join(stuck)}")


def dependency_satisfied(task, tasks_by_id: dict) -> bool:
    """A dependency is satisfied when it completed or was explicitly skipped."""

    for dep in task.depends_on:
        dependency = tasks_by_id.get(dep)
        if dependency is None:
            return False
        if dependency.status is TaskStatus.COMPLETED:
            continue
        if dependency.status is TaskStatus.CANCELLED and dependency.skipped:
            continue
        return False
    return True


def ready_tasks(tasks: Sequence) -> list:
    by_id = {task.task_id: task for task in tasks}
    return [
        task
        for task in tasks
        if task.status is TaskStatus.PENDING and dependency_satisfied(task, by_id)
    ]


def downstream_ids(tasks: Iterable, root_ids: Iterable[str]) -> set[str]:
    """All transitive dependents of the given roots."""

    dependents: dict[str, list[str]] = {}
    for task in tasks:
        for dep in task.depends_on:
            dependents.setdefault(dep, []).append(task.task_id)
    result: set[str] = set()
    stack = list(root_ids)
    while stack:
        current = stack.pop()
        for downstream in dependents.get(current, []):
            if downstream not in result:
                result.add(downstream)
                stack.append(downstream)
    return result


def topological_levels(tasks: Sequence) -> list[list[str]]:
    """Levels of parallelism (tests and scheduling introspection)."""

    indegree = {task.task_id: len(set(task.depends_on)) for task in tasks}
    dependents: dict[str, list[str]] = {}
    for task in tasks:
        for dep in task.depends_on:
            dependents.setdefault(dep, []).append(task.task_id)
    current = sorted(task_id for task_id, degree in indegree.items() if degree == 0)
    levels: list[list[str]] = []
    while current:
        levels.append(current)
        following: list[str] = []
        for task_id in current:
            for downstream in dependents.get(task_id, []):
                indegree[downstream] -= 1
                if indegree[downstream] == 0:
                    following.append(downstream)
        current = sorted(following)
    if sum(len(level) for level in levels) != len(indegree):
        raise dependency_error("dependency cycle detected")
    return levels
