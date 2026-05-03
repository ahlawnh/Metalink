from __future__ import annotations

import asyncio
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.constants import SUPPORTED_MOCK_SCENARIOS
from app.core.mock_telemetry import build_mock_telemetry, normalize_scenario
from app.core.websocket_manager import telemetry_manager
from app.schemas.telemetry import (
    ClientPongPayload,
    EventType,
    Heartbeat,
    HapticCue,
    PipelineStatus,
    PipelineStatusUpdate,
    RollingSummaryPayload,
    TelemetryUpdate,
    WebSocketEvent,
)


router = APIRouter(tags=["telemetry"])

# Last CPR haptic broadcast (for HTTPS/PWA clients where ws:// is mixed-content blocked).
_last_haptic_snapshot: Optional[dict[str, Any]] = None


def _remember_haptic_snapshot(cue: HapticCue) -> None:
    global _last_haptic_snapshot
    _last_haptic_snapshot = cue.model_dump(mode="json")


@router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/telemetry/scenarios")
async def list_mock_scenarios() -> dict[str, list[str]]:
    return {"scenarios": sorted(SUPPORTED_MOCK_SCENARIOS)}


@router.get("/telemetry/haptic-snapshot")
async def telemetry_haptic_snapshot() -> dict[str, Any]:
    """Pollable CPR cue for browsers that cannot use insecure WebSocket from HTTPS pages."""
    return {"haptic_cue": _last_haptic_snapshot}


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
    connect_message = (
        f"Connected to telemetry stream using {active_scenario}"
        if settings.mock_ai
        else "Connected — live mode; first vitals map when incident_feed (or other ingest) publishes"
    )
    connected = await telemetry_manager.send_event(
        websocket,
        WebSocketEvent(
            event_type=EventType.PIPELINE_STATUS,
            payload=PipelineStatusUpdate(
                pipeline_status=pipeline_status,
                message=connect_message,
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
    # In live mode, do not push a mock snapshot (e.g. overdose HR ~102) — wait for real ingest.
    if settings.mock_ai:
        await telemetry_manager.send_event(
            websocket,
            WebSocketEvent(
                event_type=EventType.TELEMETRY_UPDATE,
                payload=build_mock_telemetry(active_scenario, sequence=0),
            ),
        )

    pending_summary_tasks: set[asyncio.Task[None]] = set()

    def _discard_summary_task(task: asyncio.Task[None]) -> None:
        pending_summary_tasks.discard(task)

    async def run_requested_summary() -> None:
        try:
            from app.core.ingestion import telemetry_state
            from app.services.summarizer import generate_rolling_summary

            text = await generate_rolling_summary(telemetry_state.transcript_buffer)
            await telemetry_manager.send_event(
                websocket,
                WebSocketEvent(
                    event_type=EventType.TELEMETRY_SUMMARY_UPDATED,
                    payload=RollingSummaryPayload(rolling_summary=text),
                ),
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"request.summary task failed: {exc}")

    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=settings.heartbeat_interval_seconds,
                )
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
                    break
                continue
            except WebSocketDisconnect:
                raise
            except Exception as exc:
                print(f"Telemetry WebSocket ignored invalid client message: {exc}")
                continue

            if isinstance(data, dict) and data.get("event_type") == "client.ping":
                try:
                    client_ts = int(data.get("client_ts", 0))
                except (TypeError, ValueError):
                    client_ts = 0
                await telemetry_manager.send_event(
                    websocket,
                    WebSocketEvent(
                        event_type=EventType.CLIENT_PONG,
                        payload=ClientPongPayload(client_ts=client_ts),
                    ),
                )
            elif isinstance(data, dict) and data.get("event_type") == "request.summary":
                task = asyncio.create_task(run_requested_summary())
                pending_summary_tasks.add(task)
                task.add_done_callback(_discard_summary_task)
            elif isinstance(data, dict) and data.get("event_type") == "request.caller_location":
                # Replay latest real GPS from incident_feed buffer only — never inject demo SF coordinates.
                from app.api.incident_telemetry import last_incident_caller_snapshot

                snap = last_incident_caller_snapshot()
                if snap is None:
                    continue
                await telemetry_manager.send_event(
                    websocket,
                    WebSocketEvent(
                        event_type=EventType.TELEMETRY_UPDATE,
                        payload=TelemetryUpdate(
                            pipeline_status=PipelineStatus.LIVE,
                            caller_location=snap,
                        ),
                    ),
                )
            elif isinstance(data, dict) and data.get("event_type") == "dispatcher.cpr_guidance":
                # Vitals panel CPR — same BPM bounds as request.dispatch_cpr (60–140).
                active = bool(data.get("active"))
                raw_bpm = data.get("bpm")
                haptic: HapticCue
                if active:
                    try:
                        bpm_int = int(raw_bpm) if raw_bpm is not None else 110
                    except (TypeError, ValueError):
                        bpm_int = 110
                    bpm_int = max(60, min(140, bpm_int))
                    haptic = HapticCue(active=True, pattern="cpr_metronome", bpm=bpm_int)
                else:
                    haptic = HapticCue(active=False, pattern="none", bpm=None)
                _remember_haptic_snapshot(haptic)
                await telemetry_manager.broadcast(
                    WebSocketEvent(
                        event_type=EventType.TELEMETRY_UPDATE,
                        payload=TelemetryUpdate(pipeline_status=pipeline_status, haptic_cue=haptic),
                    ),
                )
            elif isinstance(data, dict) and data.get("event_type") == "request.dispatch_cpr":
                # Metronome panel: fan-out CPR cue (60–140 BPM) to every telemetry client.
                active = bool(data.get("active", True))
                if active:
                    try:
                        bpm = int(data.get("bpm", 110))
                    except (TypeError, ValueError):
                        bpm = 110
                    bpm = max(60, min(140, bpm))
                    cue = HapticCue(active=True, pattern="cpr_metronome", bpm=bpm)
                else:
                    cue = HapticCue(active=False, pattern="none", bpm=None)
                _remember_haptic_snapshot(cue)
                await telemetry_manager.broadcast(
                    WebSocketEvent(
                        event_type=EventType.TELEMETRY_UPDATE,
                        payload=TelemetryUpdate(
                            pipeline_status=PipelineStatus.LIVE,
                            haptic_cue=cue,
                        ),
                    ),
                )
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"Telemetry WebSocket loop failed: {exc}")
    finally:
        for task in pending_summary_tasks:
            task.cancel()
        if pending_summary_tasks:
            await asyncio.gather(*pending_summary_tasks, return_exceptions=True)
        telemetry_manager.disconnect(websocket)
