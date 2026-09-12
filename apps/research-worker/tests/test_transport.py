import threading

import pytest

from morpho_worker.transport import WorkerClient, WorkerService
from morpho_worker.version import (
    WORKER_PROTOCOL_VERSION,
    app_version,
    is_protocol_compatible,
)


@pytest.fixture()
def service():
    with WorkerService(session_token="draft-session-token") as started:
        yield started


def test_health_reports_process_status_and_versions(service):
    status, payload = service.client().get("/health")
    assert status == 200
    assert payload == {
        "schema_version": "1",
        "status": "ok",
        "worker_version": app_version(),
        "protocol_version": WORKER_PROTOCOL_VERSION,
    }


def test_version_reports_accepted_protocol_versions(service):
    status, payload = service.client().get("/version")
    assert status == 200
    assert payload["worker_version"] == app_version()
    assert payload["protocol_version"] == WORKER_PROTOCOL_VERSION
    assert payload["accepted_protocol_versions"] == [WORKER_PROTOCOL_VERSION]


def test_protocol_compatibility_probe(service):
    client = service.client()
    status, ok = client.post("/compatibility", {"protocol_version": WORKER_PROTOCOL_VERSION})
    assert status == 200 and ok["compatible"] is True
    status, incompatible = client.post("/compatibility", {"protocol_version": "999"})
    assert status == 200 and incompatible["compatible"] is False


def test_protocol_compatibility_rule():
    assert is_protocol_compatible("1") is True
    assert is_protocol_compatible(" 1 ") is True
    assert is_protocol_compatible("2") is False
    assert is_protocol_compatible("") is False


def test_session_token_is_required(service):
    anonymous = WorkerClient(service.host, service.port, session_token=None)
    status, payload = anonymous.get("/health")
    assert status == 401
    assert payload["error"]["code"] == "UNAUTHORIZED"
    assert payload["error"]["retryable"] is False


def test_wrong_token_is_rejected(service):
    client = WorkerClient(service.host, service.port, session_token="wrong-token")
    status, _ = client.get("/version")
    assert status == 401


def test_unknown_route_returns_structured_404(service):
    status, payload = service.client().get("/does-not-exist")
    assert status == 404
    assert payload["error"]["code"] == "NOT_FOUND"
    assert "does-not-exist" in payload["error"]["developer_detail"]


def test_extra_routes_are_dispatched():
    def echo(request):
        return 200, {"schema_version": "1", "echo": request}

    with WorkerService(extra_routes={("POST", "/test/echo"): echo}) as service:
        status, payload = service.client().post("/test/echo", {"value": 7})
        assert status == 200
        assert payload["echo"] == {"value": 7}


def test_malformed_json_body_returns_clear_error():
    with WorkerService() as service:
        client = WorkerClient(service.host, service.port)
        status, payload = client.request("POST", "/compatibility", {"protocol_version": "1"})
        assert status == 200
        # A syntactically broken body surfaces a stable transport error.
        import http.client
        import json

        connection = http.client.HTTPConnection(service.host, service.port, timeout=5)
        try:
            connection.request(
                "POST",
                "/compatibility",
                body=b"{not json",
                headers={"Content-Type": "application/json"},
            )
            response = connection.getresponse()
            payload = json.loads(response.read().decode("utf-8"))
        finally:
            connection.close()
        assert response.status == 400
        assert payload["error"]["code"] == "BAD_REQUEST"


def test_server_binds_ephemeral_port_and_stops_cleanly():
    started = WorkerService().start()
    try:
        assert started.port > 0
        status, _ = started.client().get("/health")
        assert status == 200
    finally:
        started.stop()
    # Port is released; a new server can bind again.
    with WorkerService() as restarted:
        assert restarted.client().get("/health")[0] == 200


def test_concurrent_requests_are_served():
    with WorkerService() as service:
        client = service.client()
        results: list[int] = []
        lock = threading.Lock()

        def hit():
            status, _ = client.get("/health")
            with lock:
                results.append(status)

        threads = [threading.Thread(target=hit) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
        assert results == [200] * 8
