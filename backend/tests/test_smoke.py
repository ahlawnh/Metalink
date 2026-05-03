from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


@pytest.fixture
def client() -> TestClient:
    get_settings.cache_clear()
    with TestClient(app) as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_telemetry_status(client: TestClient) -> None:
    response = client.get("/api/telemetry/status")
    assert response.status_code == 200
    body = response.json()
    assert body["pipeline_status"] == "mock"
    assert body["mock_ai"] is True
    assert "connected_clients" in body


def test_telemetry_scenarios(client: TestClient) -> None:
    response = client.get("/api/telemetry/scenarios")
    assert response.status_code == 200
    scenarios = response.json()["scenarios"]
    assert "overdose_case" in scenarios


def test_livekit_token_returns_503_when_unconfigured(client: TestClient) -> None:
    response = client.get("/api/livekit/token")
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"].lower()


def test_websocket_envelope_and_schema_version(client: TestClient) -> None:
    with client.websocket_connect("/api/ws/telemetry?scenario=normal_case") as ws:
        first = ws.receive_json()
        assert first["schema_version"] == "v2"
        assert first["event_type"] == "pipeline.status"
        second = ws.receive_json()
        assert second["event_type"] == "heartbeat"
        third = ws.receive_json()
        assert third["event_type"] == "telemetry.update"
        assert third["payload"]["pipeline_status"] == "mock"


def test_websocket_request_summary(client: TestClient) -> None:
    with client.websocket_connect("/api/ws/telemetry?scenario=normal_case") as ws:
        _ = ws.receive_json()
        _ = ws.receive_json()
        _ = ws.receive_json()
        ws.send_json({"event_type": "request.summary"})
        while True:
            msg = ws.receive_json()
            if msg.get("event_type") == "telemetry.summary_updated":
                assert msg["schema_version"] == "v2"
                assert "rolling_summary" in msg["payload"]
                assert isinstance(msg["payload"]["rolling_summary"], str)
                assert len(msg["payload"]["rolling_summary"]) > 0
                break


def test_websocket_dispatcher_cpr_guidance(client: TestClient) -> None:
    """Dispatcher broadcast must reach other subscribers with `haptic_cue` (CPR tempo)."""
    with client.websocket_connect("/api/ws/telemetry?scenario=normal_case") as operator:
        with client.websocket_connect("/api/ws/telemetry?scenario=normal_case") as caller:
            for _ in range(3):
                operator.receive_json()
            for _ in range(3):
                caller.receive_json()
            # Use 115 BPM so we do not collide with mock snapshot metronome at 110 when sequence % 5 == 0.
            operator.send_json({"event_type": "dispatcher.cpr_guidance", "active": True, "bpm": 115})
            while True:
                msg = caller.receive_json()
                if msg.get("event_type") != "telemetry.update":
                    continue
                hc = (msg.get("payload") or {}).get("haptic_cue")
                if isinstance(hc, dict) and hc.get("bpm") == 115:
                    assert hc.get("pattern") == "cpr_metronome"
                    assert hc.get("active") is True
                    break
            operator.send_json({"event_type": "dispatcher.cpr_guidance", "active": False})
            while True:
                msg = caller.receive_json()
                if msg.get("event_type") != "telemetry.update":
                    continue
                hc = (msg.get("payload") or {}).get("haptic_cue")
                if isinstance(hc, dict) and hc.get("active") is False and hc.get("pattern") == "none":
                    return


@pytest.mark.skipif(
    os.getenv("STABILITY_TEST") != "1",
    reason="Set STABILITY_TEST=1 to run the 5-minute WebSocket stability check.",
)
def test_websocket_five_minute_stability(client: TestClient) -> None:
    import time

    deadline = time.monotonic() + 300.0
    with client.websocket_connect("/api/ws/telemetry?scenario=normal_case") as ws:
        _ = ws.receive_json()
        _ = ws.receive_json()
        _ = ws.receive_json()
        while time.monotonic() < deadline:
            msg = ws.receive_json()
            assert msg["schema_version"] == "v2"
            assert msg["event_type"] in (
                "heartbeat",
                "telemetry.update",
                "telemetry.summary_updated",
                "alert.critical",
                "pipeline.status",
            )
