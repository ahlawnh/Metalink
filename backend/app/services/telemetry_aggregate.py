from __future__ import annotations

import asyncio
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


BREATHE_WINDOW_S = 60.0
TRANSCRIPT_SEGMENT_LIMIT = 40
HAZARD_CONFIRM_THRESHOLD = 2
HAZARD_CONFIDENCE_FLOOR = 0.65

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
    transcript_segments: list[dict[str, Any]] = field(default_factory=list)
    last_breathe_timestamps_s: list[float] = field(default_factory=list)
    # Set True when bystander ends call — stops append_transcript_segment until session/start.
    transcript_ingest_paused: bool = False
    # Tracks consecutive-frame detection counts per hazard type for consistency gating.
    hazard_candidate_counts: dict[str, int] = field(default_factory=dict)


def gate_hazards(state: TelemetryState, new_hazards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Multi-frame hazard consistency gate.

    - Drops hazards below HAZARD_CONFIDENCE_FLOOR immediately.
    - Increments per-type counters for hazards seen this frame; decays types not seen.
    - Only returns hazards whose type has been seen >= HAZARD_CONFIRM_THRESHOLD consecutive frames.
    """
    # Apply confidence floor first — blurry-frame low-confidence detections never accumulate.
    candidates = [h for h in new_hazards if float(h.get("confidence", 0)) >= HAZARD_CONFIDENCE_FLOOR]

    seen_types = {h.get("type", "") for h in candidates if h.get("type")}

    # Increment counters for types present this frame.
    for h_type in seen_types:
        state.hazard_candidate_counts[h_type] = state.hazard_candidate_counts.get(h_type, 0) + 1

    # Decay (but don't remove) types not seen this frame so a brief occlusion doesn't wipe them.
    for h_type in list(state.hazard_candidate_counts):
        if h_type not in seen_types:
            state.hazard_candidate_counts[h_type] = max(0, state.hazard_candidate_counts[h_type] - 1)

    confirmed_types = {t for t, c in state.hazard_candidate_counts.items() if c >= HAZARD_CONFIRM_THRESHOLD}
    return [h for h in candidates if h.get("type", "") in confirmed_types]


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


def transcript_critical_stress(buffer: str) -> bool:
    """
    Panic / life-threat language in the rolling transcript (hackathon heuristic).
    Shared with `scripts.mic_deepgram_stress_test` for consistent UX.
    """
    low = buffer.lower()
    if "not breathing" in low or "isn't breathing" in low:
        return True
    if "help me" in low and ("god" in low or "please" in low or "not" in low):
        return True
    if "oh my god" in low and ("breathing" in low or "help" in low):
        return True
    if "he's dying" in low or "she's dying" in low:
        return True
    return False


def _bystander_stress_payload(buffer: str) -> Optional[dict[str, Any]]:
    """Maps transcript to optional `bystander_stress` dict for broadcast (BystanderStress)."""
    if not buffer.strip():
        return None
    if transcript_critical_stress(buffer):
        return {"score": 0.95, "label": "critical_panic", "confidence": 0.82}
    low = buffer.lower()
    if "help" in low or "please" in low or "hurry" in low:
        return {"score": 0.48, "label": "elevated_distress", "confidence": 0.45}
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


def append_transcript_segment(
    state: TelemetryState,
    *,
    speaker: str,
    text: str,
    timestamp: Optional[float] = None,
    is_final: bool = True,
    confidence: float = 0.0,
    original_text: Optional[str] = None,
) -> None:
    if state.transcript_ingest_paused:
        return
    trimmed = text.strip()
    if not trimmed:
        return

    safe_speaker = speaker if speaker in {"caller", "dispatcher"} else "caller"
    ts = timestamp if isinstance(timestamp, (int, float)) else time.time()
    segment: dict[str, Any] = {
        "segment_id": uuid.uuid4().hex[:12],
        "speaker": safe_speaker,
        "text": trimmed,
        "timestamp": datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z"),
        "is_final": bool(is_final),
        "confidence": max(0.0, min(1.0, float(confidence or 0.0))),
    }
    if original_text and original_text.strip() and original_text.strip() != trimmed:
        segment["original_text"] = original_text.strip()
    state.transcript_segments.append(segment)
    state.transcript_segments = state.transcript_segments[-TRANSCRIPT_SEGMENT_LIMIT:]
    state.transcript_buffer = " ".join(
        f"{segment['speaker'].title()}: {segment['text']}" for segment in state.transcript_segments
    )


def patch_segment_translation(
    state: TelemetryState,
    *,
    segment_id: str,
    translated_text: str,
    original_text: str,
) -> bool:
    """
    Find a segment by its id and update it with the translated text in-place.
    Returns True if the segment was found and patched.
    """
    for seg in state.transcript_segments:
        if seg.get("segment_id") == segment_id:
            seg["original_text"] = original_text.strip()
            seg["text"] = translated_text.strip()
            state.transcript_buffer = " ".join(
                f"{s['speaker'].title()}: {s['text']}" for s in state.transcript_segments
            )
            return True
    return False


def patch_transcript_segment(
    state: TelemetryState,
    *,
    segment_id: str,
    text: Optional[str] = None,
    is_final: Optional[bool] = None,
    confidence: Optional[float] = None,
    timestamp: Optional[float] = None,
) -> bool:
    """
    Update a transcript segment in-place (used for interim STT updates).
    Returns True if the segment was found and patched.
    """
    if state.transcript_ingest_paused:
        return False

    for seg in state.transcript_segments:
        if seg.get("segment_id") != segment_id:
            continue

        if text is not None:
            trimmed = text.strip()
            if trimmed:
                seg["text"] = trimmed

        if is_final is not None:
            seg["is_final"] = bool(is_final)

        if confidence is not None:
            try:
                seg["confidence"] = max(0.0, min(1.0, float(confidence)))
            except (TypeError, ValueError):
                pass

        if timestamp is not None and isinstance(timestamp, (int, float)):
            seg["timestamp"] = datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")

        state.transcript_buffer = " ".join(f"{s['speaker'].title()}: {s['text']}" for s in state.transcript_segments)
        return True

    return False


def clear_transcript_ingest_state(state: TelemetryState) -> None:
    """Wipe in-memory STT transcript when the bystander session ends (room disconnect)."""
    state.transcript_segments.clear()
    state.transcript_buffer = ""
    state.last_breathe_timestamps_s.clear()
    state.transcript_ingest_paused = True


def resume_transcript_ingest(state: TelemetryState) -> None:
    """Allow Deepgram / mock transcript to append again when a new bystander session starts."""
    state.transcript_ingest_paused = False


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

    # Vision does not supply RR (single frame); only transcript "breathe" cadence fills RR here.
    breathe_rr = estimated_rr_from_breathe_timestamps(state.last_breathe_timestamps_s)
    vitals["estimated_respiratory_rate"] = breathe_rr

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
        "transcript_segments": state.transcript_segments,
        "ai_dispatcher_alert": alert,
        "patient_position": state.latest_vision.get("patient_position", "unknown"),
        "cyanosis_detected": bool(state.latest_vision.get("cyanosis_detected", False)),
        "bystander_action": state.latest_vision.get("bystander_action", "unknown"),
        "rolling_summary": rolling_summary,
    }
    stress = _bystander_stress_payload(state.transcript_buffer)
    if stress is not None:
        payload["bystander_stress"] = stress
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
