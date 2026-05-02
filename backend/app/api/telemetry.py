from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.constants import SUPPORTED_MOCK_SCENARIOS
from app.core.mock_telemetry import build_mock_telemetry, normalize_scenario
from app.core.websocket_manager import telemetry_manager
from app.schemas.telemetry import (
    EventType,
    Heartbeat,
    PipelineStatus,
    PipelineStatusUpdate,
    WebSocketEvent,
)


router = APIRouter(tags=["telemetry"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/telemetry/scenarios")
async def list_mock_scenarios() -> dict[str, list[str]]:
    return {"scenarios": sorted(SUPPORTED_MOCK_SCENARIOS)}


@router.get("/telemetry/status")
async def telemetry_status() -> PipelineStatusUpdate:
    settings = get_settings()
    pipeline_status = PipelineStatus.MOCK if settings.mock_ai else PipelineStatus.LIVE
    return PipelineStatusUpdate(
        pipeline_status=pipeline_status,
        message=(
            "Mock telemetry enabled"
            if settings.mock_ai
            else "Live telemetry mode enabled; degraded fallback will be used on service failure"
        ),
        mock_ai=settings.mock_ai,
        connected_clients=telemetry_manager.connected_clients,
    )


@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket, scenario: Optional[str] = None) -> None:
    settings = get_settings()
    active_scenario = normalize_scenario(scenario or settings.mock_telemetry_scenario)
    pipeline_status = PipelineStatus.MOCK if settings.mock_ai else PipelineStatus.LIVE

    await telemetry_manager.connect(websocket)
    connected = await telemetry_manager.send_event(
        websocket,
        WebSocketEvent(
            event_type=EventType.PIPELINE_STATUS,
            payload=PipelineStatusUpdate(
                pipeline_status=pipeline_status,
                message=f"Connected to telemetry stream using {active_scenario}",
                mock_ai=settings.mock_ai,
                connected_clients=telemetry_manager.connected_clients,
            ),
        ),
    )
    if not connected:
        return

    await telemetry_manager.send_event(
        websocket,
        WebSocketEvent(
            event_type=EventType.HEARTBEAT,
            payload=Heartbeat(
                pipeline_status=pipeline_status,
                connected_clients=telemetry_manager.connected_clients,
            ),
        ),
    )
    await telemetry_manager.send_event(
        websocket,
        WebSocketEvent(
            event_type=EventType.TELEMETRY_UPDATE,
            payload=build_mock_telemetry(active_scenario, sequence=0),
        ),
    )

    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=settings.heartbeat_interval_seconds)
            except asyncio.TimeoutError:
                sent = await telemetry_manager.send_event(
                    websocket,
                    WebSocketEvent(
                        event_type=EventType.HEARTBEAT,
                        payload=Heartbeat(
                            pipeline_status=pipeline_status,
                            connected_clients=telemetry_manager.connected_clients,
                        ),
                    ),
                )
                if not sent:
                    return
    except WebSocketDisconnect:
        telemetry_manager.disconnect(websocket)
    except Exception as exc:
        print(f"Telemetry WebSocket loop failed: {exc}")
        telemetry_manager.disconnect(websocket)
