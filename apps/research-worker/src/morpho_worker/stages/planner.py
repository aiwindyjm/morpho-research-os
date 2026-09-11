"""Planner stage (RES-01).

Converts a ResearchConfig into a structured ResearchPlan draft through the
structured output gate. The planner ONLY produces a plan in
``pending_review``: approval, rejection, and revision live in the
PlanStore, and no DAG execution can start before ``require_approved``.

Normalization rules applied to validated LLM output (deterministic):

- section/task strings are trimmed; empty sections are dropped;
- a section whose dimension case-fold matches a configured dimension adopts
  the configured spelling;
- every configured dimension missing from the LLM output gets a default
  section, so plan coverage always spans the requested dimensions;
- every section ends with at least one search task;
- ids are stable per config fingerprint, so regenerating from an unchanged
  config yields the same plan identity (new plan_version).
"""

from __future__ import annotations

from morpho_worker.clock import Clock
from morpho_worker.domain.research import (
    PlannerTaskDraft,
    ResearchConfig,
    ResearchPlan,
    ResearchSection,
    RuntimeTaskType,
)
from morpho_worker.ids import content_fingerprint, stable_id
from morpho_worker.interfaces import PlannerPort, stage_timestamp
from morpho_worker.pipeline.structured import StructuredOutputPipeline
from morpho_worker.providers.usage import utc_now_iso
from pydantic import BaseModel, ConfigDict, Field


class PlannerSectionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dimension: str
    title: str = ""
    objective: str = ""
    tasks: list[PlannerTaskDraft] = Field(default_factory=list)


class PlannerOutput(BaseModel):
    """Validated shape of the planner LLM response (draft schema
    ``morpho.worker.planner-output.v1``; frozen by W2-04)."""

    model_config = ConfigDict(extra="forbid")

    sections: list[PlannerSectionOutput] = Field(default_factory=list)
    notes: str = ""


def _default_section(dimension: str, topic: str) -> PlannerSectionOutput:
    return PlannerSectionOutput(
        dimension=dimension,
        title=f"Research dimension: {dimension}",
        objective=f"Investigate {dimension} of {topic}.",
        tasks=[
            PlannerTaskDraft(
                title=f"Search {dimension} sources",
                objective=f"Find sources about {dimension} of {topic}.",
                runtime_type=RuntimeTaskType.SEARCH,
            )
        ],
    )


def _materialize(section: PlannerSectionOutput, fingerprint: str) -> ResearchSection:
    canonical = section.dimension
    return ResearchSection(
        section_id=stable_id("section", fingerprint, canonical),
        title=section.title or f"Research dimension: {canonical}",
        dimension=canonical,
        objective=section.objective,
        tasks=list(section.tasks),
    )


def normalize_plan_output(
    output: PlannerOutput,
    *,
    config: ResearchConfig,
    project_id: str = "",
    plan_version: int = 1,
    timestamp: str | None = None,
) -> ResearchPlan:
    """Deterministic plan normalization (runs inside the output gate)."""

    configured = {dimension.casefold(): dimension for dimension in config.dimensions}
    now = timestamp or utc_now_iso()
    fingerprint = content_fingerprint(config.model_dump_json())

    sections: list[ResearchSection] = []
    seen: set[str] = set()
    for raw in output.sections:
        dimension = raw.dimension.strip()
        if not dimension:
            continue
        canonical = configured.get(dimension.casefold(), dimension)
        if canonical in seen:
            continue
        seen.add(canonical)
        tasks = [
            task.model_copy(update={"title": task.title.strip() or f"Search {canonical}"})
            for task in raw.tasks
            if task.title.strip()
        ]
        if not tasks:
            section = _default_section(canonical, config.topic)
            tasks = list(section.tasks)
        sections.append(
            _materialize(
                PlannerSectionOutput(
                    dimension=canonical,
                    title=raw.title,
                    objective=raw.objective,
                    tasks=tasks,
                ),
                fingerprint,
            )
        )

    for spelling in config.dimensions:
        if spelling not in seen:
            sections.append(_materialize(_default_section(spelling, config.topic), fingerprint))

    return ResearchPlan(
        plan_id=stable_id("plan", fingerprint),
        project_id=project_id or config.project_id,
        plan_version=plan_version,
        status="pending_review",
        config=config,
        sections=sections,
        config_fingerprint=fingerprint,
        reviewer_note="",
        created_at=now,
        updated_at=now,
    )


class LLMPlanner(PlannerPort):
    """Planner backed by a strong model through the structured output gate."""

    def __init__(
        self,
        pipeline: StructuredOutputPipeline,
        *,
        provider_id: str,
        model: str,
        clock: Clock | None = None,
    ) -> None:
        self._pipeline = pipeline
        self._provider_id = provider_id
        self._model = model
        self._clock = clock

    def draft_plan(self, config: ResearchConfig, *, project_id: str = "") -> ResearchPlan:
        fingerprint = content_fingerprint(config.model_dump_json())
        timestamp = stage_timestamp(self._clock)
        plan, _usage = self._pipeline.run(
            prompt_id="planner.plan-draft",
            prompt_input={
                "domain": config.domain,
                "topic": config.topic,
                "purpose": config.purpose,
                "depth": config.depth,
                "dimensions": ", ".join(config.dimensions),
                "languages": ", ".join(config.languages),
                "source_types": ", ".join(config.source_types) or "any",
            },
            output_schema=PlannerOutput,
            normalize=lambda out: normalize_plan_output(
                out,
                config=config,
                project_id=project_id,
                timestamp=timestamp,
            ),
            provider_id=self._provider_id,
            model=self._model,
            run_id="",
            task_id="",
            correlation_id=f"plan:{fingerprint}",
        )
        return plan
