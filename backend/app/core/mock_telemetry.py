from __future__ import annotations

from typing import Optional

from app.core.constants import DEFAULT_MOCK_SCENARIO, SUPPORTED_MOCK_SCENARIOS
from app.schemas.telemetry import (
    AgonalBreathingSignal,
    AlertSeverity,
    BystanderStress,
    ConsciousnessLevel,
    CriticalAlert,
    CyanosisFlag,
    DetectedItem,
    HapticCue,
    HeartRateRppgEstimate,
    PatientPosition,
    PipelineStatus,
    RespirationMethod,
    RespRateEstimate,
    TelemetryUpdate,
)


def normalize_scenario(scenario: Optional[str]) -> str:
    if scenario in SUPPORTED_MOCK_SCENARIOS:
        return scenario
    return DEFAULT_MOCK_SCENARIO


def build_mock_telemetry(scenario: Optional[str], sequence: int) -> TelemetryUpdate:
    scenario_name = normalize_scenario(scenario)
    builders = {
        "normal_case": _normal_case,
        "overdose_case": _overdose_case,
        "scene_hazard_case": _scene_hazard_case,
        "degraded_pipeline_case": _degraded_pipeline_case,
    }
    return builders[scenario_name](sequence)


def _normal_case(sequence: int) -> TelemetryUpdate:
    respiratory_rate = 14 + (sequence % 3)
    return TelemetryUpdate(
        scene_hazards=[],
        substances=[],
        patient_position=PatientPosition.SIDE_RECOVERY,
        cyanosis_flag=CyanosisFlag(detected=False, confidence=0.91),
        resp_rate_estimate=RespRateEstimate(
            value=respiratory_rate,
            method=RespirationMethod.VOICE_CADENCE,
            confidence=0.86,
        ),
        consciousness_level=ConsciousnessLevel.RESPONSIVE,
        transcript_snippet="Caller says the patient is breathing and responding to their name.",
        pipeline_status=PipelineStatus.MOCK,
        critical_alerts=[],
    )


def _overdose_case(sequence: int) -> TelemetryUpdate:
    respiratory_rate = max(5, 8 - (sequence % 4))
    return TelemetryUpdate(
        scene_hazards=[DetectedItem(item="Needle or syringe on floor", confidence=0.88)],
        substances=[DetectedItem(item="Orange prescription pill bottle", confidence=0.81)],
        patient_position=PatientPosition.SUPINE,
        cyanosis_flag=CyanosisFlag(detected=sequence % 2 == 0, confidence=0.73),
        resp_rate_estimate=RespRateEstimate(
            value=respiratory_rate,
            method=RespirationMethod.VOICE_CADENCE,
            confidence=0.79,
        ),
        consciousness_level=ConsciousnessLevel.UNRESPONSIVE,
        transcript_snippet="Bystander says breathe every several seconds; no patient response heard.",
        pipeline_status=PipelineStatus.MOCK,
        critical_alerts=[
            CriticalAlert(
                id="overdose-low-respiration",
                severity=AlertSeverity.CRITICAL,
                title="Low Respiratory Rate",
                message="Estimated breathing cadence is below emergency threshold. Verify immediately.",
                confidence=0.79,
                source="mock",
            )
        ],
        bystander_stress=BystanderStress(score=0.78, label="elevated", confidence=0.72),
        heart_rate_rppg=HeartRateRppgEstimate(value=102, confidence=0.41),
        agonal_breathing=AgonalBreathingSignal(suspected=sequence % 3 == 0, confidence=0.55),
        haptic_cue=(
            HapticCue(active=True, pattern="cpr_metronome", bpm=110)
            if sequence % 5 == 0
            else HapticCue()
        ),
    )


def _scene_hazard_case(sequence: int) -> TelemetryUpdate:
    hazard_label = "Exposed needle near patient" if sequence % 2 == 0 else "Unknown powder on table"
    return TelemetryUpdate(
        scene_hazards=[
            DetectedItem(item=hazard_label, confidence=0.9),
            DetectedItem(item="Open flame or lighter present", confidence=0.76),
        ],
        substances=[DetectedItem(item="White powder visible", confidence=0.71)],
        patient_position=PatientPosition.SLUMPED,
        cyanosis_flag=CyanosisFlag(detected=False, confidence=0.62),
        resp_rate_estimate=RespRateEstimate(
            value=10,
            method=RespirationMethod.VISION,
            confidence=0.68,
        ),
        consciousness_level=ConsciousnessLevel.UNKNOWN,
        transcript_snippet="Caller reports unknown substance and is moving away from visible hazards.",
        pipeline_status=PipelineStatus.MOCK,
        critical_alerts=[
            CriticalAlert(
                id="scene-hazard",
                severity=AlertSeverity.CRITICAL,
                title="Scene Hazard Detected",
                message="Potential responder hazard visible. Verify scene safety before entry.",
                confidence=0.9,
                source="mock",
            )
        ],
    )


def _degraded_pipeline_case(sequence: int) -> TelemetryUpdate:
    return TelemetryUpdate(
        scene_hazards=[],
        substances=[],
        patient_position=PatientPosition.UNKNOWN,
        cyanosis_flag=CyanosisFlag(detected=False, confidence=0.0),
        resp_rate_estimate=RespRateEstimate(
            value=None,
            method=RespirationMethod.UNKNOWN,
            confidence=0.0,
        ),
        consciousness_level=ConsciousnessLevel.UNKNOWN,
        transcript_snippet="Telemetry degraded; waiting for stable audio and video frames.",
        pipeline_status=PipelineStatus.DEGRADED,
        critical_alerts=[
            CriticalAlert(
                id=f"degraded-pipeline-{sequence % 3}",
                severity=AlertSeverity.WARNING,
                title="Pipeline Degraded",
                message="AI telemetry is stale or unavailable. Continue dispatcher-led triage.",
                confidence=1.0,
                source="system",
            )
        ],
    )
