from __future__ import annotations

import os
from typing import Any, Union

from app.core.websocket_manager import telemetry_manager
from app.schemas.telemetry import (
    AlertSeverity,
    ConsciousnessLevel,
    CriticalAlert,
    CyanosisFlag,
    DetectedItem,
    EventType,
    PatientPosition,
    PipelineStatus,
    RespirationMethod,
    RespRateEstimate,
    TelemetryUpdate,
    WebSocketEvent,
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
        pipeline_status=_pipeline_status(),
        critical_alerts=critical_alerts,
    )


async def broadcast_telemetry(payload: Union[dict[str, Any], TelemetryUpdate]) -> None:
    telemetry = payload if isinstance(payload, TelemetryUpdate) else telemetry_from_service_payload(payload)
    await telemetry_manager.broadcast(
        WebSocketEvent(
            event_type=EventType.TELEMETRY_UPDATE,
            payload=telemetry,
        )
    )

    for alert in telemetry.critical_alerts:
        await telemetry_manager.broadcast(
            WebSocketEvent(
                event_type=EventType.ALERT_CRITICAL,
                payload=alert,
            )
        )


async def broadcast_transcript(event: dict[str, Any]) -> None:
    # Transcript events are aggregated into TelemetryState and published immediately after.
    # Emitting a partial TelemetryUpdate here would clear hazard/vital fields in the UI.
    return
