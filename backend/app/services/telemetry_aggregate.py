from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass
class TelemetryState:
    """
    In-memory aggregation state.
    Hacker 4 can replace/extend this with Redis later; Hacker 2 keeps it simple.
    """

    latest_vision: dict[str, Any] = field(default_factory=dict)
    transcript_buffer: str = ""
    last_breathe_timestamps_s: list[float] = field(default_factory=list)


def _safe_import_broadcaster() -> tuple[Optional[Any], Optional[Any]]:
    """
    Hacker 4 owns app/services/broadcast.py. This import should succeed once they land it.
    We keep the backend runnable even if it doesn't exist yet.
    """

    try:
        from app.services.broadcast import broadcast_telemetry, broadcast_transcript  # type: ignore

        return broadcast_telemetry, broadcast_transcript
    except Exception:
        return None, None


def build_telemetry_payload(
    *,
    state: TelemetryState,
    patient_status: str = "critical",
) -> dict[str, Any]:
    """
    Build a payload matching the team's JSON contract as closely as possible without depending
    on Hacker 4's Pydantic schemas.
    """

    vitals: dict[str, Any] = state.latest_vision.get("vitals", {})
    hazards: list[dict[str, Any]] = state.latest_vision.get("hazards", [])
    alert: str = state.latest_vision.get("ai_dispatcher_alert", "No obvious scene hazards detected.")

    return {
        "timestamp": _now_iso(),
        "patient_status": patient_status,
        "vitals": {
            "estimated_respiratory_rate": vitals.get("estimated_respiratory_rate", 0),
            "chest_rise_detected": vitals.get("chest_rise_detected", False),
        },
        "hazards": hazards,
        "transcription_buffer": state.transcript_buffer,
        "ai_dispatcher_alert": alert,
    }


async def publish_telemetry(state: TelemetryState) -> None:
    broadcast_telemetry, _ = _safe_import_broadcaster()
    if broadcast_telemetry is None:
        return

    payload = build_telemetry_payload(state=state)
    maybe_awaitable = broadcast_telemetry(payload)
    if asyncio.iscoroutine(maybe_awaitable):
        await maybe_awaitable


async def publish_transcript_event(event: dict[str, Any]) -> None:
    _, broadcast_transcript = _safe_import_broadcaster()
    if broadcast_transcript is None:
        return

    maybe_awaitable = broadcast_transcript(event)
    if asyncio.iscoroutine(maybe_awaitable):
        await maybe_awaitable

