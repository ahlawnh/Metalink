from __future__ import annotations

import asyncio

from app.core.config import Settings
from app.core.mock_telemetry import build_mock_telemetry
from app.services.broadcast import broadcast_telemetry
from app.services.livekit_ingest import LiveKitConfig, run_ingestion_loop
from app.services.telemetry_aggregate import TelemetryState


telemetry_state = TelemetryState()


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

    while True:
        try:
            await run_ingestion_loop(
                state=telemetry_state,
                cfg=build_livekit_config(settings),
                frame_max_width=768,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Ingestion loop failed; retrying in 3 seconds: {exc}")
            await broadcast_telemetry(build_mock_telemetry("degraded_pipeline_case", sequence=0))
            await asyncio.sleep(3)
