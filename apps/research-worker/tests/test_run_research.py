"""CLI tests: offline profile, tmp-path contained, approval gate enforced.

Covers the three cases from the task brief plus the exit-2 contract for
invalid config input. All runs use the offline profile (deterministic
mocks, zero network) and write only under ``tmp_path``.
"""

import json
import os
from pathlib import Path

import pytest

from morpho_worker.domain.research import ResearchConfig
from morpho_worker.interfaces import StageContext

import run_research  # sys.path bootstrap mirrors conftest; run_research.py sits at worker root

FIXTURES = Path(__file__).parent / "fixtures"

CONFIG = {
    "domain": "physics", "topic": "quantum entanglement", "purpose": "learning",
    "depth": 3, "dimensions": ["concepts", "history"], "languages": ["en"],
    "source_types": ["paper", "web_page"],
}

WHITELIST = {
    "plan.json", "run.json", "sources.json", "knowledge_nodes.json",
    "relations.json", "claims.json", "validation_report.json",
    "usage_totals.json",
}


def _payloads(fixtures: Path = FIXTURES) -> dict[str, list[str]]:
    """Offline mock scripts: the planner fixture plus the merged extraction
    payload (both extraction fixtures' lists merged into one script item,
    matching tests/test_pipeline_offline.py::merged_extraction_payload)."""

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
        "summary": "Merged offline fixture payload for deterministic e2e.",
        "key_points": concepts["key_points"] + history["key_points"],
    }
    return {
        "planner.plan-draft": [
            (fixtures / "planner_output_quantum.json").read_text(encoding="utf-8")
        ],
        "extraction.source-extraction": [json.dumps(merged)],
    }


def test_main_offline_without_approve_writes_plan_and_exits(tmp_path):
    out = tmp_path / "out"
    argv = ["--profile", "offline", "--config-json", json.dumps(CONFIG),
            "--out-dir", str(out)]
    code = run_research.main(argv)
    assert code == 0
    assert (out / "plan.json").exists()
    plan = json.loads((out / "plan.json").read_text(encoding="utf-8"))
    assert plan["status"] == "pending_review"
    assert not (out / "claims.json").exists()  # run did not execute
    assert set(os.listdir(out)) == {"plan.json"}  # nothing else written


def test_main_offline_approved_runs_to_completion(tmp_path):
    out = tmp_path / "out"
    argv = ["--profile", "offline", "--config-json", json.dumps(CONFIG),
            "--out-dir", str(out), "--approve"]
    code = run_research.main(argv)
    assert code == 0
    for name in sorted(WHITELIST):
        assert (out / name).exists(), name
    plan = json.loads((out / "plan.json").read_text(encoding="utf-8"))
    assert plan["status"] == "approved"
    run = json.loads((out / "run.json").read_text(encoding="utf-8"))
    assert run["run"]["status"] == "COMPLETED"
    assert run["tasks"]
    nodes = json.loads((out / "knowledge_nodes.json").read_text(encoding="utf-8"))
    claims = json.loads((out / "claims.json").read_text(encoding="utf-8"))
    assert nodes and claims
    reports = json.loads(
        (out / "validation_report.json").read_text(encoding="utf-8")
    )
    assert reports and reports[0]["run_id"] == run["run"]["run_id"]
    totals = json.loads((out / "usage_totals.json").read_text(encoding="utf-8"))
    assert totals["records"] > 0


def test_write_results_only_writes_whitelisted_files(tmp_path):
    out = tmp_path / "nested" / "out"  # parents must be created
    assert not out.exists()
    config = run_research.build_config("offline", {})
    assert config.offline_mock is True
    orchestrator, sink, usage, _plan_store = run_research.build_orchestrator(
        config, fixture_payloads=_payloads()
    )
    try:
        plan = orchestrator.create_plan(ResearchConfig.model_validate(CONFIG))
        orchestrator.approve_plan(plan.plan_id)
        run_id = orchestrator.start_run(plan.plan_id)
        written = run_research.write_results(
            out, plan, run_id, orchestrator, sink, usage
        )
        assert {path.name for path in written} == WHITELIST
        assert set(os.listdir(out)) == WHITELIST  # containment: no extra files
        assert all(str(path).startswith(str(out)) for path in written)
    finally:
        orchestrator.shutdown()


def test_main_invalid_config_json_exits_2(tmp_path, capsys):
    argv = ["--profile", "offline", "--config-json", "{not valid json",
            "--out-dir", str(tmp_path / "o")]
    with pytest.raises(SystemExit) as excinfo:
        run_research.main(argv)
    assert excinfo.value.code == 2
    assert "invalid research config" in capsys.readouterr().err


def test_main_missing_config_source_exits_2(tmp_path):
    with pytest.raises(SystemExit) as excinfo:
        run_research.main(["--profile", "offline", "--out-dir", str(tmp_path)])
    assert excinfo.value.code == 2


def test_main_provider_misconfiguration_is_clean_error(tmp_path, capsys):
    """A bogus --search-provider under a real (non-offline) profile must be
    a clean one-line error with exit code 2, not a traceback. The error
    raises during provider resolution in build_orchestrator, before any
    HTTP, so this stays network-free."""

    argv = ["--profile", "local", "--search-provider", "bogus",
            "--config-json", json.dumps(CONFIG), "--out-dir", str(tmp_path / "o")]
    code = run_research.main(argv)
    assert code == 2
    err = capsys.readouterr().err
    assert "run_research: error:" in err
    assert "bogus" in err
    assert "Traceback" not in err


def test_main_offline_warns_when_search_provider_ignored(tmp_path, capsys):
    argv = ["--profile", "offline", "--search-provider", "searxng",
            "--config-json", json.dumps(CONFIG), "--out-dir", str(tmp_path / "o"),
            "--approve"]
    code = run_research.main(argv)
    assert code == 0
    err = capsys.readouterr().err
    assert "run_research: warning: --search-provider ignored in offline profile" in err


def test_local_profile_without_search_provider_uses_fixture_search_corpus():
    """Wiring-only: a non-offline profile with no --search-provider must
    default to the same quantum fixture corpus as the offline branch, not an
    empty mock (3 raw results -> 2 canonical sources). No HTTP and no LLM:
    only the search stage is driven directly; the LLM adapters are merely
    constructed (provider resolution happens before any transport call)."""

    config = run_research.build_config("local", {})
    assert config.offline_mock is False
    orchestrator, _sink, _usage, _plan_store = run_research.build_orchestrator(config)
    try:
        context = StageContext(
            run_id="run-wiring-test",
            task_id="task-wiring-test",
            section_id="sec-concepts",
            dimension="concepts",
            correlation_id="run-wiring-test",
            params={"source_types": ["paper", "web_page"]},
        )
        sources = orchestrator._search_stage.search(
            "quantum entanglement concepts", context
        )
        assert len(sources) == 2  # canonical URL dedup of the 3 fixture hits
        assert {source.canonical_url for source in sources} == {
            "https://concepts.test/page",
            "https://history.test/bell",
        }
    finally:
        orchestrator.shutdown()
