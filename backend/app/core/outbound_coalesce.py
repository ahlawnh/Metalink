from __future__ import annotations

import asyncio
from typing import Optional

from app.core.config import get_settings
from app.core.websocket_manager import telemetry_manager
from app.schemas.telemetry import EventType, TelemetryUpdate, WebSocketEvent


class TelemetryOutboundCoalescer:
    """
    Debounced latest-wins broadcast for high-frequency telemetry updates.
    Reduces WebSocket overload when vision/audio publishes faster than clients paint.
    """

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._pending: Optional[TelemetryUpdate] = None
        self._flush_task: Optional[asyncio.Task[None]] = None

    def _coalesce_seconds(self) -> float:
        return max(0.0, get_settings().telemetry_coalesce_ms / 1000.0)

    async def submit(self, telemetry: TelemetryUpdate) -> None:
        async with self._lock:
            self._pending = telemetry
            if self._flush_task is not None and not self._flush_task.done():
                self._flush_task.cancel()
            self._flush_task = asyncio.create_task(self._debounced_flush())

    async def _debounced_flush(self) -> None:
        try:
            await asyncio.sleep(self._coalesce_seconds())
        except asyncio.CancelledError:
            return
        async with self._lock:
            to_send = self._pending
            self._pending = None
            self._flush_task = None
        if to_send is None:
            return
        try:
            await telemetry_manager.broadcast(
                WebSocketEvent(
                    event_type=EventType.TELEMETRY_UPDATE,
                    payload=to_send,
                )
            )
            for alert in to_send.critical_alerts:
                await telemetry_manager.broadcast(
                    WebSocketEvent(
                        event_type=EventType.ALERT_CRITICAL,
                        payload=alert,
                    )
                )
        except Exception as exc:
            print(f"Coalesced telemetry emit failed: {exc}")


telemetry_coalescer = TelemetryOutboundCoalescer()
