from typing import Dict, List

from fastapi import WebSocket

# WebSocket vs HTTP: regular HTTP is request/response — the client asks, the server answers, connection closes.
# WebSocket is a persistent two-way channel: once opened, either side can push data at any time without
# the client having to poll. This is how the dashboard receives live transcript and AI updates instantly.

# Why a manager: multiple browser tabs (or devices) can be watching the same meeting simultaneously.
# The manager tracks every open WebSocket per meeting so the backend can push one update and reach all of them.

# broadcast() is called internally whenever the meeting state changes — for example when a new transcript
# chunk arrives, when AI produces fresh summary bullets, or when a conflict is detected.


class WebSocketManager:
    def __init__(self) -> None:
        # Dict mapping each meeting_id to the list of currently connected WebSocket clients.
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: str) -> None:
        """Accept a new WebSocket and register it under the given meeting."""
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
        self.active_connections[meeting_id].append(websocket)

    def disconnect(self, websocket: WebSocket, meeting_id: str) -> None:
        """Remove a WebSocket from a meeting's connection list, pruning the key if empty."""
        connections = self.active_connections.get(meeting_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self.active_connections.pop(meeting_id, None)

    async def broadcast(self, meeting_id: str, message: dict) -> None:
        """Push a JSON message to every connected client watching a meeting.

        Silently drops any WebSocket that has disconnected without cleanup so
        stale connections do not block or crash live updates for other clients.
        """
        connections = list(self.active_connections.get(meeting_id, []))
        stale: List[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(websocket, meeting_id)

    async def send_personal(self, websocket: WebSocket, message: dict) -> None:
        """Send a JSON message to one specific WebSocket only."""
        await websocket.send_json(message)


# Shared module-level instance used across the entire application so all
# endpoints and background tasks operate on the same connection registry.
manager = WebSocketManager()
