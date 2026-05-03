from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.schemas.telemetry import (
    CallerLocationSnapshot,
    HeartRateRppgEstimate,
    PipelineStatus,
    RespirationMethod,
    RespRateEstimate,
    TelemetryUpdate,
    utc_now,
)
from app.core.ingestion import telemetry_state
from app.services.broadcast import broadcast_telemetry
from app.services.telemetry_aggregate import clear_transcript_ingest_state, resume_transcript_ingest

router = APIRouter(tags=["incident"])

# In-memory ring buffer for local dev & handoff to Alan/Alex (replace with DB / queue).
_MAX = 200
_recent: list[dict[str, Any]] = []


class VitalsIn(BaseModel):
    heartRateBpm: float | None = None
    respiratoryRate: float | None = None
    bpmAnalyzing: bool = False


class LocationIn(BaseModel):
    latitude: float
    longitude: float
    accuracyM: float | None = None
    altitudeM: float | None = None
    headingDeg: float | None = None
    speedMps: float | None = None
    source: Literal["browser"] = "browser"
    recordedAt: str


class IncidentTelemetryIn(BaseModel):
    schemaVersion: Literal[1] = 1
    sessionId: str = Field(..., min_length=8)
    roomName: str = ""
    livekitIdentity: str = ""
    callStartedAt: str = ""
    sentAt: str = ""
    location: LocationIn | None = None
    vitals: VitalsIn


def _parse_recorded_at(iso_s: str) -> datetime:
    if not iso_s or not str(iso_s).strip():
        return utc_now()
    try:
        return datetime.fromisoformat(str(iso_s).replace("Z", "+00:00"))
    except ValueError:
        return utc_now()


def last_incident_caller_snapshot() -> CallerLocationSnapshot | None:
    """
    Latest real GPS from incident_feed POSTs — used when dispatch clicks refresh location
    (no hardcoded demo coordinates).
    """
    for row in reversed(_recent):
        raw = row.get("location")
        if not isinstance(raw, dict):
            continue
        try:
            lat = float(raw["latitude"])
            lng = float(raw["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
            continue
        sid = str(row.get("sessionId") or "").strip()
        short = f"{sid[:8]}…" if len(sid) >= 8 else (sid or "caller")
        acc_raw = raw.get("accuracyM")
        acc_m: float | None
        if isinstance(acc_raw, (int, float)) and acc_raw >= 0:
            acc_m = float(acc_raw)
        else:
            acc_m = None
        rec = raw.get("recordedAt")
        ts = _parse_recorded_at(str(rec)) if rec is not None else utc_now()
        return CallerLocationSnapshot(
            label=f"Caller GPS ({short})",
            latitude=lat,
            longitude=lng,
            accuracy_m=acc_m,
            updated_at=ts,
        )
    return None


def _incident_to_telemetry(body: IncidentTelemetryIn) -> TelemetryUpdate:
    """Map incident_feed POST body to a live `TelemetryUpdate` for WebSocket subscribers."""
    caller: CallerLocationSnapshot | None = None
    if body.location is not None:
        loc = body.location
        sid = body.sessionId.strip()
        short = f"{sid[:8]}…" if len(sid) >= 8 else sid
        caller = CallerLocationSnapshot(
            label=f"Caller GPS ({short})",
            latitude=loc.latitude,
            longitude=loc.longitude,
            accuracy_m=loc.accuracyM,
            updated_at=_parse_recorded_at(loc.recordedAt),
        )

    v = body.vitals
    heart_rate_rppg: HeartRateRppgEstimate | None = None
    if not v.bpmAnalyzing and v.heartRateBpm is not None:
        bpm = int(round(float(v.heartRateBpm)))
        bpm = max(30, min(220, bpm))
        heart_rate_rppg = HeartRateRppgEstimate(value=bpm, confidence=0.72)
    # While bpmAnalyzing, omit heart_rate_rppg — frontend keeps last HR until a number arrives.

    rr_val: int | None = None
    if v.respiratoryRate is not None and float(v.respiratoryRate) > 0:
        rr_val = int(round(float(v.respiratoryRate)))
        rr_val = max(0, min(80, rr_val))

    resp = RespRateEstimate(
        value=rr_val,
        method=RespirationMethod.UNKNOWN,
        confidence=0.65 if rr_val is not None else 0.0,
    )

    return TelemetryUpdate(
        pipeline_status=PipelineStatus.LIVE,
        caller_location=caller,
        heart_rate_rppg=heart_rate_rppg,
        resp_rate_estimate=resp,
        transcript_snippet="",
        scene_hazards=[],
        substances=[],
    )


@router.post("/incident/session/start")
async def incident_session_start(session_id: str = Query(default="", description="Client session id for logs")) -> dict[str, Any]:
    """New bystander session — resume STT ingestion (after a prior session/end pause)."""
    _ = session_id
    resume_transcript_ingest(telemetry_state)
    return {"ok": True}


@router.post("/incident/session/end")
async def incident_session_end(session_id: str = Query(default="", description="Client session id for logs")) -> dict[str, Any]:
    """
    Bystander ended the LiveKit session — clear server transcript buffers and tell dispatcher UIs to wipe the call log.
    """
    _ = session_id

    clear_transcript_ingest_state(telemetry_state)
    await broadcast_telemetry(
        TelemetryUpdate(
            pipeline_status=PipelineStatus.LIVE,
            clear_transcript=True,
            transcript_snippet="",
        )
    )
    return {"ok": True}


@router.post("/incident/telemetry")
async def ingest_incident_telemetry(body: IncidentTelemetryIn) -> dict[str, Any]:
    """
    Accepts periodic batches of GPS + vitals during an incident session.

    Persist to your datastore / stream — this stub keeps the last N payloads in RAM.
    """
    resume_transcript_ingest(telemetry_state)
    payload = body.model_dump()
    payload["_receivedAtServer"] = time.time()
    _recent.append(payload)
    if len(_recent) > _MAX:
        del _recent[: len(_recent) - _MAX]
    await broadcast_telemetry(_incident_to_telemetry(body))
    return {"ok": True, "buffered": len(_recent)}


@router.get("/incident/telemetry/recent")
async def recent_incident_telemetry(limit: int = 20) -> list[dict[str, Any]]:
    """
    Dev-only helper: read the last N ingested batches. Remove or protect before production.
    """
    n = max(1, min(limit, 100))
    return _recent[-n:]
