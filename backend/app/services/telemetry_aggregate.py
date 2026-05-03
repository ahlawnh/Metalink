from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


BREATHE_WINDOW_S = 60.0

# Lightweight transcript hints (hackathon heuristic; not clinical diagnosis).
AGONAL_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bgasping\b|\bgasp\b", re.I), "Transcript mentions gasping—verify breathing and consider CPR guidance."),
    (re.compile(r"\bgurgling\b|\bsnoring\b", re.I), "Possible abnormal breathing sounds in transcript—verify responsiveness and airway."),
    (re.compile(r"\bagonal\b", re.I), "Possible agonal breathing mentioned—treat as high priority; verify breathing."),
]


@dataclass
class TelemetryState:
    """
    In-memory aggregation state.
    Hacker 4 can replace/extend this with Redis later; Hacker 2 keeps it simple.
    """

    latest_vision: dict[str, Any] = field(default_factory=dict)
    transcript_buffer: str = ""
    last_breathe_timestamps_s: list[float] = field(default_factory=list)


def record_transcript_side_effects(state: TelemetryState, *, text: str, is_final: bool) -> None:
    """
    Update breathe metronome timestamps from final transcript chunks.
    Protocol: bystander says the word "breathe" on each chest rise; count in rolling window ≈ breaths/min.
    """
    if not is_final or not text.strip():
        return
    if re.search(r"\bbreathe\b", text.lower()):
        now = time.time()
        state.last_breathe_timestamps_s.append(now)
        cutoff = now - BREATHE_WINDOW_S
        state.last_breathe_timestamps_s = [t for t in state.last_breathe_timestamps_s if t >= cutoff]


def estimated_rr_from_breathe_timestamps(timestamps: list[float], *, now: Optional[float] = None) -> int:
    """Approximate respiratory rate: number of 'breathe' utterances in the last BREATHE_WINDOW_S seconds."""
    if not timestamps:
        return 0
    now = now or time.time()
    recent = [t for t in timestamps if now - BREATHE_WINDOW_S <= t <= now]
    return len(recent)


def _agonal_hint(text: str) -> Optional[str]:
    lower = text.lower()
    for pattern, hint in AGONAL_PATTERNS:
        if pattern.search(lower):
            return hint
    return None


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
    rolling_summary: str = "",
) -> dict[str, Any]:
    """
    Build a payload matching the team's JSON contract as closely as possible without depending
    on Hacker 4's Pydantic schemas.
    """

    vitals: dict[str, Any] = dict(state.latest_vision.get("vitals", {})) if isinstance(state.latest_vision.get("vitals"), dict) else {}
    hazards: list[dict[str, Any]] = state.latest_vision.get("hazards", []) if isinstance(state.latest_vision.get("hazards"), list) else []
    alert: str = state.latest_vision.get("ai_dispatcher_alert", "No obvious scene hazards detected.")

    vision_rr = int(vitals.get("estimated_respiratory_rate") or 0)
    breathe_rr = estimated_rr_from_breathe_timestamps(state.last_breathe_timestamps_s)
    if vision_rr <= 0 and breathe_rr > 0:
        vitals["estimated_respiratory_rate"] = breathe_rr
    else:
        vitals["estimated_respiratory_rate"] = vision_rr

    agonal = _agonal_hint(state.transcript_buffer)
    if agonal and alert.lower() == "no obvious scene hazards detected.":
        alert = agonal
    elif agonal and agonal not in alert:
        alert = f"{alert} {agonal}"

    payload: dict[str, Any] = {
        "timestamp": _now_iso(),
        "patient_status": patient_status,
        "vitals": {
            "estimated_respiratory_rate": vitals.get("estimated_respiratory_rate", 0),
            "chest_rise_detected": vitals.get("chest_rise_detected", False),
        },
        "hazards": hazards,
        "transcription_buffer": state.transcript_buffer,
        "ai_dispatcher_alert": alert,
        "patient_position": state.latest_vision.get("patient_position", "unknown"),
        "cyanosis_detected": bool(state.latest_vision.get("cyanosis_detected", False)),
        "bystander_action": state.latest_vision.get("bystander_action", "unknown"),
        "rolling_summary": rolling_summary,
    }
    return payload


async def publish_telemetry(state: TelemetryState) -> None:
    broadcast_telemetry, _ = _safe_import_broadcaster()
    if broadcast_telemetry is None:
        return

    payload = build_telemetry_payload(state=state, rolling_summary="")
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
