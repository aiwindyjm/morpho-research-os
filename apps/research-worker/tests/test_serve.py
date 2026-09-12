"""Serve entrypoint tests (loopback only, offline/mock providers).

Spawns ``python -m morpho_worker.serve`` as a subprocess bound to an
ephemeral loopback port, drives ``GET /health`` and the ``POST /jobs``
happy path with the session token, then closes stdin and asserts the
documented clean shutdown (exit code 0). No real network, no credentials
(the token is a fixture value).
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

from morpho_worker.transport import WorkerClient

WORKER_ROOT = Path(__file__).resolve().parents[1]
SRC = WORKER_ROOT / "src"

SESSION_TOKEN = "serve-test-token"


def _free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _spawn(port: int, env_extra: dict[str, str] | None = None):
    env = dict(os.environ)
    env["PYTHONPATH"] = str(SRC) + os.pathsep + env.get("PYTHONPATH", "")
    env["MORPHO_WORKER_HOST"] = "127.0.0.1"
    env["MORPHO_WORKER_PORT"] = str(port)
    env["MORPHO_WORKER_SESSION_TOKEN"] = SESSION_TOKEN
    env.update(env_extra or {})
    return subprocess.Popen(
        [sys.executable, "-m", "morpho_worker.serve"],
        cwd=str(WORKER_ROOT),
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )


def _wait_until(predicate, timeout: float = 20.0, interval: float = 0.05):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = predicate()
        if last:
            return last
        time.sleep(interval)
    raise AssertionError(f"condition not met within {timeout}s; last: {last!r}")


def test_serve_health_and_jobs_happy_path_then_clean_eof_shutdown():
    port = _free_loopback_port()
    process = _spawn(port)
    stdout_lines: list[str] = []
    failures: list[BaseException] = []

    def read_stdout():
        try:
            for line in process.stdout:
                stdout_lines.append(line.rstrip("\n"))
        except BaseException as exc:  # surface reader-thread failures
            failures.append(exc)

    reader = threading.Thread(target=read_stdout, daemon=True)
    reader.start()
    try:
        client = WorkerClient("127.0.0.1", port, SESSION_TOKEN)
        # The server answers /health with the token (and rejects without it).
        _wait_until(lambda: _health_ok(client))
        anonymous = WorkerClient("127.0.0.1", port, session_token=None)
        assert anonymous.get("/health")[0] == 401

        # POST /jobs happy path: offline pipeline runs to COMPLETED.
        request = {
            "schema_version": "1",
            "kind": "research_run",
            "approve_plan": True,
            "config": {
                "domain": "physics",
                "topic": "quantum entanglement",
                "purpose": "learning",
                "depth": 3,
                "dimensions": ["concepts", "history"],
                "languages": ["en"],
                "source_types": ["paper", "web_page"],
            },
        }
        status, payload = client.post("/jobs", request)
        assert status == 201
        job_id = payload["job"]["job_id"]
        job = _wait_until(lambda: _terminal(client, job_id))
        assert job["status"] == "COMPLETED", job
        assert job["counts"]["tasks_completed"] == job["counts"]["tasks_total"]
        assert job["error"] is None

        # stdin EOF: the supervisor closing the pipe is a clean shutdown.
        process.stdin.close()
        returncode = process.wait(timeout=30)
        assert returncode == 0, process.stderr.read() if process.stderr else None
    finally:
        if process.poll() is None:  # pragma: no cover - defensive teardown
            process.kill()
        reader.join(timeout=5)
    assert not failures

    # The documented startup line was logged exactly once, with protocol=1.
    startup = [line for line in stdout_lines if "listening" in line]
    assert startup == [
        f"morpho-worker listening on http://127.0.0.1:{port} protocol=1"
    ]


def _health_ok(client: WorkerClient):
    try:
        status, payload = client.get("/health")
    except OSError:
        return None
    if status != 200 or payload.get("status") != "ok":
        return None
    return payload


def _terminal(client: WorkerClient, job_id: str):
    status, payload = client.get(f"/jobs/{job_id}")
    assert status == 200
    job = payload["job"]
    return job if job["status"] in {"COMPLETED", "NEEDS_REVIEW", "FAILED", "CANCELLED"} else None


def test_serve_missing_required_environment_is_config_error():
    port = _free_loopback_port()
    process = _spawn(port, env_extra={"MORPHO_WORKER_SESSION_TOKEN": ""})
    try:
        returncode = process.wait(timeout=20)
        stderr = process.stderr.read() if process.stderr else ""
    finally:
        if process.poll() is None:  # pragma: no cover
            process.kill()
    assert returncode == 2
    assert "MORPHO_WORKER_SESSION_TOKEN" in stderr


def test_serve_invalid_port_is_config_error():
    process = _spawn(0, env_extra={"MORPHO_WORKER_PORT": "not-a-number"})
    try:
        returncode = process.wait(timeout=20)
        stderr = process.stderr.read() if process.stderr else ""
    finally:
        if process.poll() is None:  # pragma: no cover
            process.kill()
    assert returncode == 2
    assert "MORPHO_WORKER_PORT" in stderr


def test_parse_env_defaults_and_errors():
    from morpho_worker.serve import _parse_env

    parsed = _parse_env(
        {"MORPHO_WORKER_PORT": "8765", "MORPHO_WORKER_SESSION_TOKEN": "t"}
    )
    assert parsed == ("127.0.0.1", 8765, "t")
    assert _parse_env({}) == "MORPHO_WORKER_PORT is required."
    assert isinstance(
        _parse_env({"MORPHO_WORKER_PORT": "70000", "MORPHO_WORKER_SESSION_TOKEN": "t"}),
        str,
    )
    assert isinstance(_parse_env({"MORPHO_WORKER_PORT": "8765"}), str)
