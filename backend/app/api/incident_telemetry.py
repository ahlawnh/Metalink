from __future__ import annotations

import time
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

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


@router.post("/incident/telemetry")
async def ingest_incident_telemetry(body: IncidentTelemetryIn) -> dict[str, Any]:
    """
    Accepts periodic batches of GPS + vitals during an incident session.

    Persist to your datastore / stream — this stub keeps the last N payloads in RAM.
    """
    payload = body.model_dump()
    payload["_receivedAtServer"] = time.time()
    _recent.append(payload)
    if len(_recent) > _MAX:
        del _recent[: len(_recent) - _MAX]
    return {"ok": True, "buffered": len(_recent)}


@router.get("/incident/telemetry/recent")
async def recent_incident_telemetry(limit: int = 20) -> list[dict[str, Any]]:
    """
    Dev-only helper: read the last N ingested batches. Remove or protect before production.
    """
    n = max(1, min(limit, 100))
    return _recent[-n:]
