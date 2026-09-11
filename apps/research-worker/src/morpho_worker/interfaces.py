"""Stage interfaces and the result sink boundary (PY-04, draft).

Every research stage is a port with a typed input/output contract:

    Planner -> Search -> Extraction -> Entity/Relation -> Claims/Validation

``ResultSink`` is the only way validated records leave the stages: the
worker itself never writes SQLite or the Vault; the sink implementation is
injected (in-memory for tests/mocks, Rust-backed via the worker protocol
later). ``InMemoryResultSink`` persists idempotently by record id so retries
and crash recovery cannot duplicate records.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Protocol, Sequence, runtime_checkable

from pydantic import BaseModel

from morpho_worker.clock import Clock
from morpho_worker.domain.claims import Claim, ValidationReport
from morpho_worker.domain.extraction import ExtractionResult
from morpho_worker.domain.knowledge import KnowledgeNode, Relation
from morpho_worker.domain.research import ResearchConfig, ResearchPlan, ResearchSection
from morpho_worker.domain.source import Source, SourceContent
from morpho_worker.ids import new_id, stable_id, content_fingerprint
from morpho_worker.providers.usage import utc_now_iso


@dataclass(frozen=True)
class StageContext:
    """Identity context threaded through every stage call."""

    run_id: str
    task_id: str
    section_id: str = ""
    dimension: str = ""
    correlation_id: str = ""
    params: dict = field(default_factory=dict)


class PlannerPort(Protocol):
    def draft_plan(self, config: ResearchConfig, *, project_id: str = "") -> ResearchPlan: ...


@runtime_checkable
class SearchStagePort(Protocol):
    def search(self, query: str, context: StageContext) -> list[Source]: ...


class ExtractionStagePort(Protocol):
    def extract(
        self, source: Source, content: SourceContent, context: StageContext
    ) -> ExtractionResult: ...


class EntityStagePort(Protocol):
    def normalize_entities(
        self, extractions: Sequence[ExtractionResult], context: StageContext
    ) -> list[KnowledgeNode]: ...


class RelationStagePort(Protocol):
    def normalize_relations(
        self,
        extractions: Sequence[ExtractionResult],
        nodes: Sequence[KnowledgeNode],
        context: StageContext,
    ) -> list[Relation]: ...


class ValidationStagePort(Protocol):
    def validate(
        self,
        *,
        claims: Sequence[Claim],
        nodes: Sequence[KnowledgeNode],
        context: StageContext,
    ) -> ValidationReport: ...


@runtime_checkable
class ResultSink(Protocol):
    def persist(self, record_type: str, record: BaseModel) -> str: ...


class InMemoryResultSink:
    """Idempotent in-memory sink: persisting the same record id twice
    replaces the same record instead of duplicating it."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._records: dict[tuple[str, str], BaseModel] = {}

    def persist(self, record_type: str, record: BaseModel) -> str:
        record_id = getattr(record, "record_id", None) or _record_identity(record)
        with self._lock:
            self._records[(record_type, record_id)] = record
        return record_id

    def get(self, record_type: str, record_id: str) -> BaseModel | None:
        with self._lock:
            return self._records.get((record_type, record_id))

    def all(self, record_type: str) -> list[BaseModel]:
        with self._lock:
            return [record for (kind, _), record in self._records.items() if kind == record_type]


_ID_FIELDS = (
    "source_id",
    "node_id",
    "claim_id",
    "evidence_id",
    "relation_id",
    "extraction_id",
    "plan_id",
    "run_id",
    "usage_id",
    "conflict_id",
)


def _record_identity(record: BaseModel) -> str:
    for name in _ID_FIELDS:
        value = getattr(record, name, None)
        if isinstance(value, str) and value:
            return value
    raise ValueError(f"record {type(record).__name__} has no identity field")


class MockPlanner:
    """Deterministic planner mock: one section per configured dimension.

    Fulfills the PY-04 skeleton acceptance; the real planner (RES-01) wraps
    an LLM through the structured output gate and produces richer sections.
    """

    def __init__(self, clock: Clock | None = None) -> None:
        self._clock = clock

    def draft_plan(self, config: ResearchConfig, *, project_id: str = "") -> ResearchPlan:
        now = self._clock.now_utc().isoformat() if self._clock else utc_now_iso()
        fingerprint = content_fingerprint(config.model_dump_json())
        sections = [
            ResearchSection(
                section_id=stable_id("section", fingerprint, dimension),
                title=f"Research dimension: {dimension}",
                dimension=dimension,
                objective=f"Investigate {dimension} of {config.topic}.",
                tasks=[],
            )
            for dimension in config.dimensions
        ]
        return ResearchPlan(
            plan_id=stable_id("plan", fingerprint),
            project_id=project_id or config.project_id,
            config=config,
            sections=sections,
            config_fingerprint=fingerprint,
            created_at=now,
            updated_at=now,
        )


class MockSearchStage:
    """Deterministic search stage mock over fixture sources."""

    def __init__(self, sources_by_query: dict[str, list[Source]] | None = None) -> None:
        self._sources_by_query = sources_by_query or {}

    def search(self, query: str, context: StageContext) -> list[Source]:
        return list(self._sources_by_query.get(query, []))


class MockExtractionStage:
    """Deterministic extraction stage mock: empty material per source."""

    def extract(
        self, source: Source, content: SourceContent, context: StageContext
    ) -> ExtractionResult:
        return ExtractionResult(
            extraction_id=stable_id("extraction", content.fingerprint),
            source_id=source.source_id,
            url_dedup_key=source.url_dedup_key,
        )


def new_run_id() -> str:
    return new_id()


def stage_timestamp(clock: Clock | None = None) -> str:
    return clock.now_utc().isoformat() if clock else utc_now_iso()
