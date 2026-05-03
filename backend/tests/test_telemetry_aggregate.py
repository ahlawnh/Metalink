from __future__ import annotations

import time

from app.services.telemetry_aggregate import (
    TelemetryState,
    build_telemetry_payload,
    record_transcript_side_effects,
    transcript_critical_stress,
)


def test_transcript_critical_stress_triggers() -> None:
    assert transcript_critical_stress("oh my god he's not breathing help me")
    assert transcript_critical_stress("She's dying please hurry")
    assert not transcript_critical_stress("everything is fine here")


def test_build_telemetry_payload_bystander_stress_from_transcript() -> None:
    state = TelemetryState()
    state.transcript_buffer = "caller says oh my god he's not breathing help me"
    state.latest_vision = {
        "hazards": [],
        "vitals": {"estimated_respiratory_rate": 0, "chest_rise_detected": False},
        "ai_dispatcher_alert": "No obvious scene hazards detected.",
        "patient_position": "unknown",
        "cyanosis_detected": False,
        "bystander_action": "unknown",
    }
    payload = build_telemetry_payload(state=state)
    assert "bystander_stress" in payload
    assert payload["bystander_stress"]["label"] == "critical_panic"
    assert payload["bystander_stress"]["score"] >= 0.9


def test_respiratory_rate_from_breathe_only_not_vision_field() -> None:
    state = TelemetryState()
    state.latest_vision = {
        "hazards": [],
        "vitals": {"estimated_respiratory_rate": 99, "chest_rise_detected": True},
        "ai_dispatcher_alert": "x",
        "patient_position": "supine",
        "cyanosis_detected": False,
        "bystander_action": "none",
    }
    now = time.time()
    state.last_breathe_timestamps_s = [now - 5.0, now - 2.0]
    payload = build_telemetry_payload(state=state)
    assert payload["vitals"]["estimated_respiratory_rate"] == 2


def test_record_transcript_side_effects_breathe_updates_rr_window() -> None:
    state = TelemetryState()
    record_transcript_side_effects(state, text="breathe", is_final=True)
    record_transcript_side_effects(state, text="breathe", is_final=True)
    payload = build_telemetry_payload(state=state)
    assert payload["vitals"]["estimated_respiratory_rate"] == 2
