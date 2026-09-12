"""Research engine CLI: question -> plan -> approval gate -> run -> JSON.

Closes the local compute research loop from one command::

    python run_research.py --profile offline --config-json '{...}' --out-dir OUT
    python run_research.py --profile local  --config-file cfg.json --out-dir OUT --approve

Behavior:

- Without ``--approve`` the plan is drafted and persisted as ``plan.json``
  only; the run never starts (the plan store's review gate is the product's
  safety invariant, so the CLI cannot bypass it either).
- With ``--approve`` the plan is approved, the DAG runs, and the normalized
  knowledge JSON plus run/usage evidence lands in ``--out-dir``. The CLI
  writes ONLY the whitelisted result filenames into that directory.
- ``--profile offline`` (the default) wires deterministic mock providers and
  the bundled fixtures: zero network, zero credentials.
- Invalid config input is an argparse-style error (exit code 2).
- ``KeyboardInterrupt`` (Ctrl-C) propagates: the orchestrator is shut down
  by the ``finally`` block and Python surfaces the interrupt to the caller.

The offline payload trick (merged extraction fixture) is copied from
``tests/test_pipeline_offline.py::merged_extraction_payload`` on purpose:
extraction calls are keyed by content and which scripted payload a given
content pulls is scheduling-dependent, so one merged superset payload is
correct for any content. Do not import test code from here.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Mapping, Sequence

# Bootstrap so `import morpho_worker` works from source without an install
# (mirrors tests/conftest.py; run_research.py sits at the worker root).
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from pydantic import BaseModel

from morpho_worker.clock import SystemClock
from morpho_worker.config import (
    ProviderRole,
    WorkerConfig,
    from_env,
)
from morpho_worker.dag.states import RunStatus
from morpho_worker.domain.research import ResearchConfig
from morpho_worker.errors import MorphoError
from morpho_worker.events import EventLog
from morpho_worker.interfaces import InMemoryResultSink
from morpho_worker.orchestrator import ResearchOrchestrator
from morpho_worker.pipeline.prompts import PromptRegistry
from morpho_worker.pipeline.structured import StructuredOutputPipeline
from morpho_worker.providers.cache import InMemoryCache
from morpho_worker.providers.factory import ProviderFactory
from morpho_worker.providers.mock import MockLLMProvider, MockSearchProvider
from morpho_worker.providers.ports import RawSearchResult
from morpho_worker.providers.retry import RetryPolicy
from morpho_worker.providers.usage import InMemoryUsageLedger
from morpho_worker.stages.claims_stage import ClaimBuilder, ValidationStage
from morpho_worker.stages.extraction_stage import (
    ExtractionStage,
    SourceContentResolver,
    SourceEvaluator,
)
from morpho_worker.stages.planner import LLMPlanner
from morpho_worker.stages.search_stage import SearchStage
from morpho_worker.stores import PlanStore

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "tests" / "fixtures"

#: Fixed output filename whitelist (containment contract for --out-dir).
RESULT_FILES: dict[str, str] = {
    # filename -> sink record_type (strings the orchestrator persists)
    "sources.json": "source",
    "knowledge_nodes.json": "node",
    "relations.json": "relation",
    "claims.json": "claim",
    "validation_report.json": "validation-report",
    # Writer role: vault-ready note projections (PRD section 10).
    "notes.json": "note",
    # Incremental research diff against the prior completed run (PRD 14).
    "incremental_report.json": "incremental-report",
}
PLAN_FILE = "plan.json"
RUN_FILE = "run.json"
USAGE_FILE = "usage_totals.json"

TERMINAL_RUN_STATUSES = ("COMPLETED", "FAILED", "CANCELLED", "NEEDS_REVIEW")
_OK_RUN_STATUSES = ("COMPLETED", "NEEDS_REVIEW")
POLL_INTERVAL_SECONDS = 0.05
RUN_TIMEOUT_SECONDS = 600.0

# --- offline fixtures (copied from tests/test_pipeline_offline.py) ------------

_CONTENT_CONCEPTS = (
    "Quantum entanglement correlates distant particles. No local hidden-variable "
    "model can reproduce the observed correlations. Entanglement requires "
    "nonclassical correlations between measurement outcomes."
)
_CONTENT_HISTORY = (
    "John Bell derived his inequalities while working at CERN. Bell published "
    "the inequality in 1964. The 2015 loophole-free experiments rejected local realism."
)


def _offline_search_results() -> list[RawSearchResult]:
    """The deterministic 3-result quantum set (canonical-URL dup included)."""

    return [
        RawSearchResult(
            title="Entanglement concepts",
            url="https://concepts.test/page?utm_source=x",
            source_type="paper",
            published_at="2024-05-01",
            content=_CONTENT_CONCEPTS,
        ),
        RawSearchResult(
            # Canonical duplicate of the first URL (tracking param + case).
            title="Entanglement concepts (mirror listing)",
            url="HTTPS://CONCEPTS.TEST/page",
            source_type="paper",
            published_at="2024-05-01",
            content=_CONTENT_CONCEPTS,
        ),
        RawSearchResult(
            title="Bell history",
            url="https://history.test/bell",
            source_type="web_page",
            published_at="2023-01-15",
            content=_CONTENT_HISTORY,
        ),
    ]


def merged_extraction_payload() -> str:
    """One content-agnostic superset extraction payload (merged fixtures)."""

    concepts = json.loads(
        (FIXTURES / "extraction_output_quantum.json").read_text(encoding="utf-8")
    )
    history = json.loads(
        (FIXTURES / "extraction_output_history.json").read_text(encoding="utf-8")
    )
    merged = {
        "entities": concepts["entities"] + history["entities"],
        "relations": concepts["relations"] + history["relations"],
        "claims": concepts["claims"] + history["claims"],
        "summary": "Merged offline fixture payload for deterministic e2e.",
        "key_points": concepts["key_points"] + history["key_points"],
    }
    return json.dumps(merged)


def default_offline_payloads() -> dict[str, list[str]]:
    """Default offline mock scripts: planner fixture + merged extraction."""

    return {
        "planner.plan-draft": [
            (FIXTURES / "planner_output_quantum.json").read_text(encoding="utf-8")
        ],
        "extraction.source-extraction": [merged_extraction_payload()],
    }


# --- construction helpers ------------------------------------------------------


def build_config(profile: str, env: Mapping[str, str]) -> WorkerConfig:
    """Environment config with the profile applied through from_env ordering.

    The CLI profile is routed through ``MORPHO_PROFILE`` (the same ordering
    ``from_env`` implements: profile preset first, explicit ``MORPHO_ROLE_*``
    on top), so an explicit per-role environment variable still wins over
    the profile. A non-default CLI profile overrides any ``MORPHO_PROFILE``
    already present in the environment.
    """

    profile = (profile or "default").strip().lower()
    if profile not in {"default", "local", "offline"}:
        raise ValueError(f"unknown profile: {profile!r}")
    merged_env = dict(env)
    if profile != "default":
        merged_env["MORPHO_PROFILE"] = profile
    return from_env(merged_env)


def build_orchestrator(
    config: WorkerConfig,
    *,
    fixture_payloads: dict[str, list[str]] | None = None,
    search_provider_id: str | None = None,
    max_workers: int = 2,
    env: Mapping[str, str] | None = None,
) -> tuple[ResearchOrchestrator, InMemoryResultSink, InMemoryUsageLedger, PlanStore]:
    """Wire the full pipeline.

    Offline mock mode mirrors ``tests/test_pipeline_offline.py::
    build_orchestrator`` (shared pipeline, scripted mock LLM, deterministic
    mock search). Otherwise providers come from ``ProviderFactory``:
    ``llm_for`` for the planner and extraction roles (one structured-output
    pipeline per role, sharing the cache/usage ledger), ``search_for`` for
    search with the optional provider selection.
    """

    clock = SystemClock()
    cache = InMemoryCache()
    usage = InMemoryUsageLedger()
    event_log = EventLog(clock)
    sink = InMemoryResultSink()
    plan_store = PlanStore(clock=clock)
    retry = RetryPolicy(max_attempts=3, backoff_seconds=0.0)
    prompts = PromptRegistry()

    if config.offline_mock:
        llm = MockLLMProvider(scripted=fixture_payloads or default_offline_payloads())
        pipeline = StructuredOutputPipeline(
            llm, prompts, usage=usage, cache=cache, retry=retry, clock=clock
        )
        planner = LLMPlanner(
            pipeline, provider_id="mock", model="mock-model", clock=clock
        )
        search = SearchStage(
            MockSearchProvider(results=_offline_search_results()),
            provider_id="mock", cache=cache, usage=usage, clock=clock,
        )
        extraction = ExtractionStage(
            pipeline, provider_id="mock", model="mock-model",
            evaluator=SourceEvaluator(clock=clock),
            content_resolver=SourceContentResolver(cache=cache, clock=clock),
        )
    else:
        factory = ProviderFactory(config, env=dict(env or os.environ))
        planner_provider, planner_llm = factory.llm_for(ProviderRole.PLANNER)
        extract_provider, extract_llm = factory.llm_for(ProviderRole.EXTRACTION)
        planner_pipeline = StructuredOutputPipeline(
            planner_llm, prompts, usage=usage, cache=cache, retry=retry, clock=clock
        )
        extract_pipeline = StructuredOutputPipeline(
            extract_llm, prompts, usage=usage, cache=cache, retry=retry, clock=clock
        )
        planner = LLMPlanner(
            planner_pipeline,
            provider_id=planner_provider.provider_id if planner_provider else "mock",
            model=planner_provider.model if planner_provider else "mock-model",
            clock=clock,
        )
        search = SearchStage(
            # "Mock search unless a real search provider is configured": the
            # default corpus is the same quantum fixture set the offline
            # branch uses, never an empty mock. A real --search-provider
            # selection stays on the live adapter path (no fixtures injected).
            factory.search_for(
                fixture_results=(
                    None if search_provider_id else _offline_search_results()
                ),
                search_provider_id=search_provider_id,
            ),
            provider_id=search_provider_id or "mock",
            cache=cache, usage=usage, clock=clock,
        )
        extraction = ExtractionStage(
            extract_pipeline,
            provider_id=extract_provider.provider_id if extract_provider else "mock",
            model=extract_provider.model if extract_provider else "mock-model",
            evaluator=SourceEvaluator(clock=clock),
            content_resolver=SourceContentResolver(cache=cache, clock=clock),
        )

    orchestrator = ResearchOrchestrator(
        planner=planner,
        plan_store=plan_store,
        search_stage=search,
        extraction_stage=extraction,
        claim_builder=ClaimBuilder(),
        validation_stage=ValidationStage(clock=clock),
        sink=sink,
        event_log=event_log,
        clock=clock,
        max_workers=max_workers,
    )
    return orchestrator, sink, usage, plan_store


# --- result writing --------------------------------------------------------------


def _dump(record) -> dict:
    if isinstance(record, BaseModel):
        return record.model_dump(mode="json")
    return record


def _write_json(path: Path, payload) -> Path:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def write_results(
    out_dir: Path,
    plan,
    run_id: str,
    orchestrator: ResearchOrchestrator,
    sink: InMemoryResultSink,
    usage: InMemoryUsageLedger,
) -> list[Path]:
    """Write the whitelisted result files into ``out_dir`` (created with
    parents). Only the fixed filenames are ever written here."""

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    written.append(_write_json(out_dir / PLAN_FILE, _dump(plan)))
    run = orchestrator.run_status(run_id)
    written.append(
        _write_json(
            out_dir / RUN_FILE,
            {
                "run": _dump(run) if run is not None else None,
                "tasks": [_dump(task) for task in orchestrator.task_status(run_id)],
            },
        )
    )
    for filename, record_type in RESULT_FILES.items():
        written.append(
            _write_json(out_dir / filename, [_dump(r) for r in sink.all(record_type)])
        )
    written.append(_write_json(out_dir / USAGE_FILE, usage.totals()))
    return written


def _wait_for_terminal(
    orchestrator: ResearchOrchestrator, run_id: str,
    timeout_seconds: float = RUN_TIMEOUT_SECONDS,
) -> str:
    """Poll run status until a terminal state or the wall-clock timeout."""

    deadline = time.monotonic() + timeout_seconds
    while True:
        run = orchestrator.run_status(run_id)
        status = run.status.value if run is not None else "PENDING"
        if status in TERMINAL_RUN_STATUSES:
            return status
        if time.monotonic() >= deadline:
            return "TIMEOUT"
        time.sleep(POLL_INTERVAL_SECONDS)


# --- CLI ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run_research",
        description=(
            "Draft a research plan and (with --approve) run the full "
            "search/extract/normalize/claims/validate pipeline, writing the "
            "normalized knowledge JSON to --out-dir."
        ),
    )
    parser.add_argument(
        "--profile", choices=("default", "local", "offline"), default="offline",
        help="provider routing preset (default: offline, no network)",
    )
    parser.add_argument(
        "--config-file", type=Path, default=None,
        help="path to a JSON file matching ResearchConfig",
    )
    parser.add_argument(
        "--config-json", default=None,
        help="inline JSON string matching ResearchConfig",
    )
    parser.add_argument(
        "--approve", action="store_true",
        help="approve the drafted plan and execute the run",
    )
    parser.add_argument(
        "--out-dir", type=Path, required=True,
        help="directory for the whitelisted result JSON files (created)",
    )
    parser.add_argument(
        "--search-provider", default=None,
        help="optional configured kind=search provider id (e.g. a SearxNG instance)",
    )
    parser.add_argument(
        "--max-workers", type=int, default=2,
        help="DAG worker concurrency (default: 2)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.config_file is None and not args.config_json:
        parser.error("one of --config-file or --config-json is required")
    if args.config_file is not None and args.config_json:
        parser.error("--config-file and --config-json are mutually exclusive")

    if args.config_file is not None:
        try:
            raw_config = args.config_file.read_text(encoding="utf-8")
        except OSError as exc:
            parser.error(f"cannot read --config-file: {exc}")
    else:
        raw_config = args.config_json
    try:
        research_config = ResearchConfig.model_validate(json.loads(raw_config))
    except ValueError as exc:  # JSONDecodeError and pydantic ValidationError
        parser.error(f"invalid research config: {exc}")

    try:
        config = build_config(args.profile, os.environ)
    except ValueError as exc:
        parser.error(str(exc))

    if args.search_provider and config.offline_mock:
        print(
            "run_research: warning: --search-provider ignored in offline profile",
            file=sys.stderr,
        )

    try:
        orchestrator, sink, usage, _plan_store = build_orchestrator(
            config,
            search_provider_id=args.search_provider,
            max_workers=args.max_workers,
        )
    except MorphoError as exc:
        print(f"run_research: error: {exc.user_message}", file=sys.stderr)
        return 2
    try:
        out_dir = Path(args.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        plan = orchestrator.create_plan(research_config)
        if not args.approve:
            _write_json(out_dir / PLAN_FILE, _dump(plan))
            print(
                f"plan {plan.plan_id} pending review "
                f"({out_dir / PLAN_FILE}); re-run with --approve to execute"
            )
            return 0

        plan = orchestrator.approve_plan(
            plan.plan_id, note="approved by run_research CLI"
        )
        _write_json(out_dir / PLAN_FILE, _dump(plan))
        run_id = orchestrator.start_run(plan.plan_id)
        status = _wait_for_terminal(orchestrator, run_id)
        if status == "TIMEOUT":
            print(
                f"run {run_id} did not reach a terminal state within "
                f"{RUN_TIMEOUT_SECONDS:.0f}s",
                file=sys.stderr,
            )

        write_results(out_dir, plan, run_id, orchestrator, sink, usage)
        print(
            f"run {run_id} {status}: "
            f"{len(sink.all('source'))} sources, "
            f"{len(sink.all('node'))} nodes, "
            f"{len(sink.all('claim'))} claims -> {out_dir}"
        )
        return 0 if status in _OK_RUN_STATUSES else 1
    finally:
        orchestrator.shutdown()


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
