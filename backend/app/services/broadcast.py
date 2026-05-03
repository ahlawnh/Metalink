from __future__ import annotations

import os
from typing import Any, Optional, Union

from app.core.outbound_coalesce import telemetry_coalescer
from app.schemas.telemetry import (
    AgonalBreathingSignal,
    AlertSeverity,
    BystanderStress,
    ConsciousnessLevel,
    CriticalAlert,
    CyanosisFlag,
    DetectedItem,
    HeartRateRppgEstimate,
    HapticCue,
    PatientPosition,
    PipelineStatus,
    RespirationMethod,
    RespRateEstimate,
    TelemetryUpdate,
)


def _confidence(value: Any, default: float = 0.6) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


def _map_hazard(hazard: dict[str, Any]) -> DetectedItem:
    label = hazard.get("description") or hazard.get("item") or hazard.get("type") or "Unknown hazard"
    return DetectedItem(item=str(label), confidence=_confidence(hazard.get("confidence")))


def _map_position(value: Any) -> PatientPosition:
    normalized = str(value or "unknown").lower()
    if normalized in {position.value for position in PatientPosition}:
        return PatientPosition(normalized)
    if normalized in {"seated", "sitting"}:
        return PatientPosition.SLUMPED
    return PatientPosition.UNKNOWN


def _map_consciousness(patient_status: Any, transcript: str) -> ConsciousnessLevel:
    normalized = str(patient_status or "").lower()
    lower_transcript = transcript.lower()
    if "unresponsive" in normalized or "not responding" in lower_transcript:
        return ConsciousnessLevel.UNRESPONSIVE
    if "responsive" in normalized:
        return ConsciousnessLevel.RESPONSIVE
    return ConsciousnessLevel.UNKNOWN


def _pipeline_status() -> PipelineStatus:
    return PipelineStatus.MOCK if os.getenv("MOCK_AI", "true").lower() in {"1", "true", "yes", "on"} else PipelineStatus.LIVE


def _optional_bystander_stress(raw: Any) -> Optional[BystanderStress]:
    if not isinstance(raw, dict):
        return None
    try:
        return BystanderStress(
            score=_confidence(raw.get("score"), default=0.5),
            label=str(raw.get("label") or ""),
            confidence=_confidence(raw.get("confidence"), default=0.5),
        )
    except Exception:
        return None


def _optional_heart_rate_rppg(raw: Any) -> Optional[HeartRateRppgEstimate]:
    if not isinstance(raw, dict):
        return None
    try:
        val = raw.get("value")
        v = int(val) if isinstance(val, (int, float)) else None
        return HeartRateRppgEstimate(
            value=v,
            confidence=_confidence(raw.get("confidence"), default=0.0),
            disclaimer=str(
                raw.get("disclaimer")
                or "Experimental camera-derived estimate; not a medical device."
            ),
        )
    except Exception:
        return None


def _optional_agional_breathing(raw: Any) -> Optional[AgonalBreathingSignal]:
    if not isinstance(raw, dict):
        return None
    try:
        return AgonalBreathingSignal(
            suspected=bool(raw.get("suspected", False)),
            confidence=_confidence(raw.get("confidence"), default=0.0),
        )
    except Exception:
        return None


def _optional_haptic_cue(raw: Any) -> Optional[HapticCue]:
    if not isinstance(raw, dict):
        return None
    try:
        pattern = raw.get("pattern") or "none"
        if pattern not in ("none", "cpr_metronome"):
            pattern = "none"
        bpm = raw.get("bpm")
        bpm_i = int(bpm) if isinstance(bpm, (int, float)) else None
        return HapticCue(active=bool(raw.get("active", False)), pattern=pattern, bpm=bpm_i)
    except Exception:
        return None


def telemetry_from_service_payload(payload: dict[str, Any]) -> TelemetryUpdate:
    vitals = payload.get("vitals") if isinstance(payload.get("vitals"), dict) else {}
    hazards = payload.get("hazards") if isinstance(payload.get("hazards"), list) else []
    transcript = str(payload.get("transcription_buffer") or payload.get("transcript_snippet") or "")
    alert_text = str(payload.get("ai_dispatcher_alert") or "").strip()
    respiratory_rate = vitals.get("estimated_respiratory_rate")

    critical_alerts: list[CriticalAlert] = []
    if alert_text and alert_text.lower() != "no obvious scene hazards detected.":
        critical_alerts.append(
            CriticalAlert(
                id="service-ai-dispatcher-alert",
                severity=AlertSeverity.CRITICAL if hazards else AlertSeverity.WARNING,
                title="AI Dispatcher Alert",
                message=alert_text,
                confidence=max((_confidence(hazard.get("confidence")) for hazard in hazards if isinstance(hazard, dict)), default=0.7),
                source="vision",
            )
        )

    agonal = _optional_agional_breathing(payload.get("agonal_breathing"))
    if agonal is None and payload.get("agonal_breathing_suspected") is not None:
        agonal = AgonalBreathingSignal(
            suspected=bool(payload.get("agonal_breathing_suspected")),
            confidence=_confidence(payload.get("agonal_breathing_confidence"), default=0.0),
        )

    return TelemetryUpdate(
        scene_hazards=[_map_hazard(hazard) for hazard in hazards if isinstance(hazard, dict)],
        substances=[],
        patient_position=_map_position(payload.get("patient_position")),
        cyanosis_flag=CyanosisFlag(detected=bool(payload.get("cyanosis_detected", False)), confidence=0.5),
        resp_rate_estimate=RespRateEstimate(
            value=int(respiratory_rate) if isinstance(respiratory_rate, (int, float)) and respiratory_rate >= 0 else None,
            method=RespirationMethod.VISION,
            confidence=0.7 if respiratory_rate else 0.0,
        ),
        consciousness_level=_map_consciousness(payload.get("patient_status"), transcript),
        transcript_snippet=transcript,
        rolling_summary=str(payload.get("rolling_summary") or ""),
        pipeline_status=_pipeline_status(),
        critical_alerts=critical_alerts,
        bystander_stress=_optional_bystander_stress(payload.get("bystander_stress")),
        heart_rate_rppg=_optional_heart_rate_rppg(payload.get("heart_rate_rppg")),
        agonal_breathing=agonal,
        haptic_cue=_optional_haptic_cue(payload.get("haptic_cue")),
    )


async def broadcast_telemetry(payload: Union[dict[str, Any], TelemetryUpdate]) -> None:
    telemetry = payload if isinstance(payload, TelemetryUpdate) else telemetry_from_service_payload(payload)
    await telemetry_coalescer.submit(telemetry)


async def broadcast_transcript(event: dict[str, Any]) -> None:
    # Transcript events are aggregated into TelemetryState and published immediately after.
    # Emitting a partial TelemetryUpdate here would clear hazard/vital fields in the UI.
    return
