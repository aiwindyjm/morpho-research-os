"""Plan review store (RES-01).

The plan lifecycle is the product's core safety gate: a plan exists only as
a reviewable draft until the user approves it. The store keeps every plan
version (never overwritten), supersedes old versions on revision, and is
the single authority consulted before a run may start
(:meth:`require_approved`).
"""

from __future__ import annotations

import threading

from morpho_worker.clock import Clock
from morpho_worker.domain.research import PlanStatus, ResearchPlan
from morpho_worker.errors import ErrorCode, MorphoError


class PlanStore:
    def __init__(self, clock: Clock | None = None) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._versions: dict[str, list[ResearchPlan]] = {}

    def save(self, plan: ResearchPlan) -> ResearchPlan:
        """Register a new plan version; older versions are superseded."""

        stored = plan.model_copy(deep=True)
        stored.updated_at = self._clock.now_utc().isoformat() if self._clock else plan.updated_at
        with self._lock:
            history = self._versions.setdefault(stored.plan_id, [])
            for older in history:
                if older.status is PlanStatus.PENDING_REVIEW:
                    older.status = PlanStatus.SUPERSEDED
            history.append(stored)
        return stored.model_copy(deep=True)

    def get(self, plan_id: str, version: int | None = None) -> ResearchPlan | None:
        with self._lock:
            history = self._versions.get(plan_id)
            if not history:
                return None
            if version is None:
                return history[-1].model_copy(deep=True)
            for plan in history:
                if plan.plan_version == version:
                    return plan.model_copy(deep=True)
            return None

    def revise(self, plan_id: str, revised: ResearchPlan) -> ResearchPlan:
        """Add a user- or planner-revised version; it restarts review."""

        latest = self.get(plan_id)
        if latest is None:
            raise MorphoError(
                ErrorCode.PLAN_NOT_APPROVED,
                "The plan does not exist and cannot be revised.",
                retryable=False,
            )
        revised = revised.model_copy(deep=True)
        revised.plan_id = plan_id
        revised.plan_version = latest.plan_version + 1
        revised.status = PlanStatus.PENDING_REVIEW
        return self.save(revised)

    def approve(self, plan_id: str, note: str = "") -> ResearchPlan:
        plan = self._require(plan_id)
        if plan.status is PlanStatus.SUPERSEDED:
            raise MorphoError(
                ErrorCode.PLAN_NOT_APPROVED,
                "A superseded plan version cannot be approved.",
                retryable=False,
            )
        plan.status = PlanStatus.APPROVED
        plan.reviewer_note = note
        return self._replace(plan)

    def reject(self, plan_id: str, note: str = "") -> ResearchPlan:
        plan = self._require(plan_id)
        if plan.status is PlanStatus.SUPERSEDED:
            raise MorphoError(
                ErrorCode.PLAN_NOT_APPROVED,
                "A superseded plan version cannot be rejected.",
                retryable=False,
            )
        plan.status = PlanStatus.REJECTED
        plan.reviewer_note = note
        return self._replace(plan)

    def require_approved(self, plan_id: str) -> ResearchPlan:
        """The gate used before any DAG execution."""

        plan = self._require(plan_id)
        if plan.status is not PlanStatus.APPROVED:
            raise MorphoError(
                ErrorCode.PLAN_NOT_APPROVED,
                "The research plan has not been approved yet. Review and approve the plan before running it.",
                developer_detail=f"plan_id={plan_id} status={plan.status.value} version={plan.plan_version}",
                retryable=False,
            )
        return plan

    # internals -----------------------------------------------------------

    def _require(self, plan_id: str) -> ResearchPlan:
        plan = self.get(plan_id)
        if plan is None:
            raise MorphoError(
                ErrorCode.PLAN_NOT_APPROVED,
                "The research plan does not exist.",
                developer_detail=f"plan_id={plan_id}",
                retryable=False,
            )
        return plan

    def _replace(self, plan: ResearchPlan) -> ResearchPlan:
        with self._lock:
            history = self._versions[plan.plan_id]
            for index, candidate in enumerate(history):
                if candidate.plan_version == plan.plan_version:
                    history[index] = plan.model_copy(deep=True)
                    break
        return plan.model_copy(deep=True)
