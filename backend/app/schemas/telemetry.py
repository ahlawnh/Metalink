from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


SCHEMA_VERSION = "v2"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class EventType(str, Enum):
    TELEMETRY_UPDATE = "telemetry.update"
    ALERT_CRITICAL = "alert.critical"
    PIPELINE_STATUS = "pipeline.status"
    HEARTBEAT = "heartbeat"


class PipelineStatus(str, Enum):
    MOCK = "mock"
    DEGRADED = "degraded"
    LIVE = "live"


class PatientPosition(str, Enum):
    SUPINE = "supine"
    PRONE = "prone"
    SLUMPED = "slumped"
    SIDE_RECOVERY = "side_recovery"
    UNKNOWN = "unknown"


class ConsciousnessLevel(str, Enum):
    RESPONSIVE = "responsive"
    UNRESPONSIVE = "unresponsive"
    UNKNOWN = "unknown"


class RespirationMethod(str, Enum):
    VISION = "vision"
    VOICE_CADENCE = "voice_cadence"
    MANUAL = "manual"
    UNKNOWN = "unknown"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class DetectedItem(BaseModel):
    item: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)


class CyanosisFlag(BaseModel):
    detected: bool
    confidence: float = Field(..., ge=0.0, le=1.0)


class RespRateEstimate(BaseModel):
    value: Optional[int] = Field(default=None, ge=0, le=80)
    method: RespirationMethod = RespirationMethod.UNKNOWN
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class CriticalAlert(BaseModel):
    id: str = Field(..., min_length=1)
    severity: AlertSeverity = AlertSeverity.CRITICAL
    title: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)
    source: Literal["vision", "audio", "system", "mock"]


class BystanderStress(BaseModel):
    """NLP-derived panic/stress level from transcript (experimental)."""

    score: float = Field(..., ge=0.0, le=1.0)
    label: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class HeartRateRppgEstimate(BaseModel):
    """Experimental camera-derived heart rate hint; not a medical device."""

    value: Optional[int] = Field(default=None, ge=30, le=220)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    disclaimer: str = "Experimental camera-derived estimate; not a medical device."


class AgonalBreathingSignal(BaseModel):
    suspected: bool = False
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class HapticCue(BaseModel):
    """PWA (Hacker 1) should interpret; backend only signals intent."""

    active: bool = False
    pattern: Literal["none", "cpr_metronome"] = "none"
    bpm: Optional[int] = Field(default=None, ge=60, le=140)


class TelemetryUpdate(BaseModel):
    timestamp: datetime = Field(default_factory=utc_now)
    scene_hazards: list[DetectedItem] = Field(default_factory=list)
    substances: list[DetectedItem] = Field(default_factory=list)
    patient_position: PatientPosition = PatientPosition.UNKNOWN
    cyanosis_flag: CyanosisFlag = Field(default_factory=lambda: CyanosisFlag(detected=False, confidence=0.0))
    resp_rate_estimate: RespRateEstimate = Field(default_factory=RespRateEstimate)
    consciousness_level: ConsciousnessLevel = ConsciousnessLevel.UNKNOWN
    transcript_snippet: str = ""
    pipeline_status: PipelineStatus = PipelineStatus.MOCK
    critical_alerts: list[CriticalAlert] = Field(default_factory=list)
    # V3 / winning-edge optional fields (services may omit; frontend treats as optional)
    bystander_stress: Optional[BystanderStress] = None
    heart_rate_rppg: Optional[HeartRateRppgEstimate] = None
    agonal_breathing: Optional[AgonalBreathingSignal] = None
    haptic_cue: Optional[HapticCue] = None


class PipelineStatusUpdate(BaseModel):
    timestamp: datetime = Field(default_factory=utc_now)
    pipeline_status: PipelineStatus
    message: str
    mock_ai: bool
    connected_clients: int = Field(ge=0)


class Heartbeat(BaseModel):
    timestamp: datetime = Field(default_factory=utc_now)
    pipeline_status: PipelineStatus
    connected_clients: int = Field(ge=0)


class WebSocketEvent(BaseModel):
    schema_version: Literal["v2"] = SCHEMA_VERSION
    event_type: EventType
    timestamp: datetime = Field(default_factory=utc_now)
    payload: Union[TelemetryUpdate, PipelineStatusUpdate, CriticalAlert, Heartbeat]
