from __future__ import annotations

import asyncio
import os

from app.core.config import Settings
from app.core.mock_telemetry import build_mock_telemetry
from app.schemas.telemetry import AlertSeverity, CriticalAlert, PipelineStatus, TelemetryUpdate
from app.services.broadcast import broadcast_telemetry
from app.services.livekit_ingest import LiveKitConfig, run_ingestion_loop
from app.services.telemetry_aggregate import TelemetryState


telemetry_state = TelemetryState()


def _live_ingest_failure_update(exc: Exception) -> TelemetryUpdate:
    """When MOCK_AI is off, never push a mock scenario snapshot on ingest errors — only a degraded system notice."""
    hint = str(exc).replace("\n", " ").strip()
    if len(hint) > 400:
        hint = hint[:397] + "..."
    return TelemetryUpdate(
        pipeline_status=PipelineStatus.DEGRADED,
        critical_alerts=[
            CriticalAlert(
                id="live-ingest-unavailable",
                severity=AlertSeverity.WARNING,
                title="Live ingestion unavailable",
                message=(
                    "The LiveKit ingest loop exited or could not start. "
                    "Check LIVEKIT_* in .env, install livekit packages, restart the server, "
                    "and ensure a caller is publishing to the room."
                    + (f" Last error: {hint}" if hint else "")
                ),
                confidence=1.0,
                source="system",
            )
        ],
    )


def build_livekit_config(settings: Settings) -> LiveKitConfig:
    return LiveKitConfig(
        url=settings.livekit_url,
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
        room=settings.livekit_room,
        identity=settings.livekit_identity,
        frame_sample_interval_s=settings.frame_sample_interval_seconds,
    )


async def run_safe_ingestion_loop(settings: Settings) -> None:
    if not settings.enable_ingestion_loop:
        return

    print("Aegis-Link: ingestion loop task started (ENABLE_INGESTION_LOOP=true).")
    print(
        "Aegis-Link: mock_ai=%s (MOCK_AI in process env after load_env: %r)"
        % (settings.mock_ai, os.environ.get("MOCK_AI"))
    )

    while True:
        try:
            await run_ingestion_loop(
                state=telemetry_state,
                cfg=build_livekit_config(settings),
                mock_ai=settings.mock_ai,
                frame_max_width=768,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Ingestion loop failed; retrying in 3 seconds: {exc}")
            if settings.mock_ai:
                await broadcast_telemetry(build_mock_telemetry("degraded_pipeline_case", sequence=0))
            else:
                await broadcast_telemetry(_live_ingest_failure_update(exc))
            await asyncio.sleep(3)
