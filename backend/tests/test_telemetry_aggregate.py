from __future__ import annotations

import time

from app.services.telemetry_aggregate import (
    TelemetryState,
    append_transcript_segment,
    build_telemetry_payload,
    record_transcript_side_effects,
    transcript_critical_stress,
)
from app.services.livekit_ingest import classify_livekit_audio_participant


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


def test_append_transcript_segment_keeps_speaker_labels() -> None:
    state = TelemetryState()
    append_transcript_segment(state, speaker="caller", text="help please", timestamp=1.0, confidence=0.9)
    append_transcript_segment(state, speaker="dispatcher", text="stay with me", timestamp=2.0, confidence=0.8)

    payload = build_telemetry_payload(state=state)
    assert payload["transcript_segments"][-2]["speaker"] == "caller"
    assert payload["transcript_segments"][-1]["speaker"] == "dispatcher"
    assert "Caller: help please" in payload["transcription_buffer"]
    assert "Dispatcher: stay with me" in payload["transcription_buffer"]


def test_livekit_audio_identity_classification() -> None:
    assert (
        classify_livekit_audio_participant("caller", backend_identity="aegis-link-backend")
        == "caller"
    )
    assert (
        classify_livekit_audio_participant("metalink-operator-abc", backend_identity="aegis-link-backend")
        == "dispatcher"
    )
    assert (
        classify_livekit_audio_participant("bystander-abc123", backend_identity="aegis-link-backend")
        == "caller"
    )
    assert (
        classify_livekit_audio_participant("unknown-human", backend_identity="aegis-link-backend")
        == "caller"
    )
    assert (
        classify_livekit_audio_participant("aegis-link-backend", backend_identity="aegis-link-backend")
        is None
    )
