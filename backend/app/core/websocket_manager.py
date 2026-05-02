from __future__ import annotations

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.schemas.telemetry import WebSocketEvent


class TelemetryConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    @property
    def connected_clients(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def send_event(self, websocket: WebSocket, event: WebSocketEvent) -> bool:
        try:
            if websocket.client_state != WebSocketState.CONNECTED:
                self.disconnect(websocket)
                return False
            await websocket.send_json(event.model_dump(mode="json"))
            return True
        except Exception as exc:
            print(f"WebSocket send failed: {exc}")
            self.disconnect(websocket)
            return False

    async def broadcast(self, event: WebSocketEvent) -> None:
        stale_connections: list[WebSocket] = []
        for websocket in tuple(self._connections):
            try:
                if websocket.client_state != WebSocketState.CONNECTED:
                    stale_connections.append(websocket)
                    continue
                await websocket.send_json(event.model_dump(mode="json"))
            except Exception as exc:
                print(f"WebSocket broadcast failed: {exc}")
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect(websocket)


telemetry_manager = TelemetryConnectionManager()
