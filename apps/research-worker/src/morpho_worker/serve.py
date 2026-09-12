"""Worker serve entrypoint (``python -m morpho_worker.serve``).

Boots the draft HTTP worker protocol on loopback with offline/mock
providers (the serve path never holds credentials: routing to real
providers is the Rust supervisor's configuration, delivered through the
worker's config boundary elsewhere).

Environment (draft names, frozen with the W2-02 supervisor contract):

- ``MORPHO_WORKER_HOST``       bind host, default ``127.0.0.1``
- ``MORPHO_WORKER_PORT``       bind port (required)
- ``MORPHO_WORKER_SESSION_TOKEN`` bearer token the Rust supervisor supplied
  (required; every endpoint requires ``Authorization: Bearer <token>``)

Startup logs one line — ``morpho-worker listening on http://HOST:PORT
protocol=1`` — so supervisors can wait on readiness instead of polling.
Shutdown is graceful and exits 0: SIGTERM, SIGINT, or EOF on stdin (the
supervisor closing the pipe) all stop accepting jobs, join in-flight job
threads (bounded), and close the listener. Missing or invalid required
environment is a startup error printed to stderr with exit code 2.
"""

from __future__ import annotations

import json
import os
import signal
import sys
import threading
from pathlib import Path
from typing import Mapping, Sequence

from morpho_worker.clock import SystemClock
from morpho_worker.jobs import JobService
from morpho_worker.stages.claims_stage import ClaimBuilder, ValidationStage
from morpho_worker.stages.extraction_stage import (
    ExtractionStage,
    SourceContentResolver,
    SourceEvaluator,
)
from morpho_worker.stages.search_stage import SearchStage
from morpho_worker.stores import PlanStore
from morpho_worker.transport import WorkerService
from morpho_worker.version import WORKER_PROTOCOL_VERSION

EXIT_OK = 0
EXIT_CONFIG_ERROR = 2

_CONTENT_CONCEPTS = (
    "Quantum entanglement correlates distant particles. No local hidden-variable "
    "model can reproduce the observed correlations. Entanglement requires "
    "nonclassical correlations between measurement outcomes."
)
_CONTENT_HISTORY = (
    "John Bell derived his inequalities while working at CERN. Bell published "
    "the inequality in 1964. The 2015 loophole-free experiments rejected local realism."
)


def _fixtures_dir() -> Path | None:
    """The worker's offline fixtures when running from source (packaged
    deployments skip them and serve an empty mock corpus)."""

    for candidate in Path(__file__).resolve().parents:
        target = candidate / "tests" / "fixtures"
        if (target / "extraction_output_quantum.json").is_file():
            return target
    return None


def _offline_payloads() -> tuple[list, dict[str, list[str]]]:
    """Deterministic offline mock corpus: search results plus a merged
    extraction superset payload (fixture-agnostic, same trick as the CLI)."""

    from morpho_worker.providers.ports import RawSearchResult

    results = [
        RawSearchResult(
            title="Entanglement concepts",
            url="https://concepts.test/page",
            source_type="paper",
            content=_CONTENT_CONCEPTS,
        ),
        RawSearchResult(
            title="Bell history",
            url="https://history.test/bell",
            source_type="web_page",
            content=_CONTENT_HISTORY,
        ),
    ]
    fixtures = _fixtures_dir()
    scripted: dict[str, list[str]] = {}
    if fixtures is not None:
        concepts = json.loads(
            (fixtures / "extraction_output_quantum.json").read_text(encoding="utf-8")
        )
        history = json.loads(
            (fixtures / "extraction_output_history.json").read_text(encoding="utf-8")
        )
        merged = {
            "entities": concepts["entities"] + history["entities"],
            "relations": concepts["relations"] + history["relations"],
            "claims": concepts["claims"] + history["claims"],
            "summary": "Merged offline fixture payload for the serve entrypoint.",
            "key_points": concepts["key_points"] + history["key_points"],
        }
        scripted["extraction.source-extraction"] = [json.dumps(merged)]
    return results, scripted


def build_job_service(
    *, heartbeat_seconds: float = 15.0, max_workers: int = 2
) -> JobService:
    """Offline/mock job service: deterministic providers, no network, no
    credentials (same wiring as the offline pipeline tests)."""

    from morpho_worker.events import EventLog
    from morpho_worker.interfaces import InMemoryResultSink, MockPlanner
    from morpho_worker.orchestrator import ResearchOrchestrator
    from morpho_worker.pipeline.prompts import PromptRegistry
    from morpho_worker.pipeline.structured import StructuredOutputPipeline
    from morpho_worker.providers.cache import InMemoryCache
    from morpho_worker.providers.mock import MockLLMProvider, MockSearchProvider
    from morpho_worker.providers.retry import RetryPolicy
    from morpho_worker.providers.usage import InMemoryUsageLedger

    results, scripted = _offline_payloads()

    def factory(event_log: EventLog):
        clock = SystemClock()
        cache = InMemoryCache()
        usage = InMemoryUsageLedger()
        pipeline = StructuredOutputPipeline(
            MockLLMProvider(scripted=scripted),
            PromptRegistry(),
            usage=usage,
            cache=cache,
            retry=RetryPolicy(max_attempts=3, backoff_seconds=0.0),
            clock=clock,
        )
        search = SearchStage(
            MockSearchProvider(results=results),
            provider_id="mock",
            cache=cache,
            usage=usage,
            clock=clock,
        )
        extraction = ExtractionStage(
            pipeline,
            provider_id="mock",
            model="mock-model",
            evaluator=SourceEvaluator(clock=clock),
            content_resolver=SourceContentResolver(cache=cache, clock=clock),
        )
        return ResearchOrchestrator(
            planner=MockPlanner(clock=clock),
            plan_store=PlanStore(clock=clock),
            search_stage=search,
            extraction_stage=extraction,
            claim_builder=ClaimBuilder(),
            validation_stage=ValidationStage(clock=clock),
            sink=InMemoryResultSink(),
            event_log=event_log,
            clock=clock,
            max_workers=max_workers,
        )

    return JobService(orchestrator_factory=factory, heartbeat_seconds=heartbeat_seconds)


def _watch_stdin_eof(stop: threading.Event, stream) -> None:
    """Stop the server when the supervisor closes our stdin (EOF)."""

    try:
        while stream.readline() != "":
            continue
    except (OSError, ValueError):
        pass
    stop.set()


def serve(
    host: str,
    port: int,
    session_token: str,
    *,
    stop: threading.Event | None = None,
    stdout=None,
    stdin=None,
) -> int:
    """Run the worker until ``stop`` is set; return the exit code."""

    stop = stop or threading.Event()
    jobs = build_job_service()
    worker = WorkerService(
        session_token=session_token, host=host, port=port, job_service=jobs
    )
    worker.start()
    out = stdout or sys.stdout
    print(
        f"morpho-worker listening on http://{host}:{port} "
        f"protocol={WORKER_PROTOCOL_VERSION}",
        file=out,
        flush=True,
    )

    watchers: list[threading.Thread] = []
    for signum in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(signum, lambda *_: stop.set())
        except (ValueError, OSError):  # pragma: no cover - non-main thread
            pass
    if stdin is not False:
        watcher = threading.Thread(
            target=_watch_stdin_eof, args=(stop, stdin or sys.stdin), daemon=True
        )
        watcher.start()
        watchers.append(watcher)

    try:
        stop.wait()
    finally:
        jobs.shutdown()
        worker.stop()
    return EXIT_OK


def _parse_env(env: Mapping[str, str]) -> tuple[str, int, str] | str:
    host = (env.get("MORPHO_WORKER_HOST") or "127.0.0.1").strip() or "127.0.0.1"
    raw_port = (env.get("MORPHO_WORKER_PORT") or "").strip()
    if not raw_port:
        return "MORPHO_WORKER_PORT is required."
    try:
        port = int(raw_port, 10)
    except ValueError:
        return f"MORPHO_WORKER_PORT must be an integer, got {raw_port!r}."
    if not (0 < port < 65536):
        return f"MORPHO_WORKER_PORT is out of range: {port}."
    token = (env.get("MORPHO_WORKER_SESSION_TOKEN") or "").strip()
    if not token:
        return "MORPHO_WORKER_SESSION_TOKEN is required."
    return host, port, token


def main(argv: Sequence[str] | None = None, env: Mapping[str, str] | None = None) -> int:
    _ = argv  # no CLI flags yet; configuration is entirely environmental
    parsed = _parse_env(os.environ if env is None else env)
    if isinstance(parsed, str):
        print(f"morpho-worker: configuration error: {parsed}", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    host, port, token = parsed
    return serve(host, port, token)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
