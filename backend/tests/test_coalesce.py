from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, patch

from app.core.config import get_settings
from app.core.outbound_coalesce import TelemetryOutboundCoalescer
from app.schemas.telemetry import EventType, PipelineStatus, TelemetryUpdate


def test_coalescer_emits_latest_only() -> None:
    async def run() -> None:
        get_settings.cache_clear()
        os.environ["MOCK_AI"] = "true"
        prev_coalesce = os.environ.get("TELEMETRY_COALESCE_MS")
        os.environ["TELEMETRY_COALESCE_MS"] = "80"
        get_settings.cache_clear()

        try:
            gate = TelemetryOutboundCoalescer()
            with patch(
                "app.core.outbound_coalesce.telemetry_manager.broadcast",
                new_callable=AsyncMock,
            ) as mock_broadcast:
                await gate.submit(
                    TelemetryUpdate(
                        pipeline_status=PipelineStatus.MOCK,
                        transcript_snippet="first",
                    )
                )
                await gate.submit(
                    TelemetryUpdate(
                        pipeline_status=PipelineStatus.MOCK,
                        transcript_snippet="second",
                    )
                )
                await asyncio.sleep(0.25)

            telemetry_events = [
                call.args[0]
                for call in mock_broadcast.call_args_list
                if call.args[0].event_type == EventType.TELEMETRY_UPDATE
            ]
            assert len(telemetry_events) == 1
            assert telemetry_events[0].payload.transcript_snippet == "second"
        finally:
            if prev_coalesce is None:
                os.environ.pop("TELEMETRY_COALESCE_MS", None)
            else:
                os.environ["TELEMETRY_COALESCE_MS"] = prev_coalesce
            get_settings.cache_clear()

    asyncio.run(run())
