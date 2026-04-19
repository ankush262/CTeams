from typing import Dict, List
import json

from fastapi import WebSocket


class WebSocketManager:
	"""
	Manages all active WebSocket connections.

	Key: meeting_id (str)
	Value: List of WebSocket connections

	When something happens (new transcript chunk, action detected, etc.)
	the backend calls manager.broadcast(meeting_id, message) and ALL
	connected browsers for that meeting receive it instantly.
	"""

	def __init__(self):
		# Dictionary storing active connections per meeting
		self.active_connections: Dict[str, List[WebSocket]] = {}

	async def connect(self, websocket: WebSocket, meeting_id: str):
		"""Accept a new WebSocket connection and add to tracking."""
		await websocket.accept()
		if meeting_id not in self.active_connections:
			self.active_connections[meeting_id] = []
		self.active_connections[meeting_id].append(websocket)
		print(
			f"WebSocket connected for meeting {meeting_id}. "
			f"Total: {len(self.active_connections[meeting_id])}"
		)

	def disconnect(self, websocket: WebSocket, meeting_id: str):
		"""Remove a WebSocket from tracking when it disconnects."""
		if meeting_id in self.active_connections:
			try:
				self.active_connections[meeting_id].remove(websocket)
				print(f"WebSocket disconnected from meeting {meeting_id}")
				# Clean up empty lists
				if len(self.active_connections[meeting_id]) == 0:
					del self.active_connections[meeting_id]
			except ValueError:
				pass  # Already removed

	async def broadcast(self, meeting_id: str, message: dict):
		"""
		Send a message to ALL connected browsers for a specific meeting.

		If a connection fails (browser closed without cleanup), remove it silently.
		"""
		if meeting_id not in self.active_connections:
			return  # No one connected for this meeting

		dead_connections = []
		for websocket in self.active_connections[meeting_id]:
			try:
				await websocket.send_json(message)
			except Exception:
				# Connection dead, mark for removal
				dead_connections.append(websocket)

		# Remove dead connections
		for ws in dead_connections:
			self.disconnect(ws, meeting_id)


# Create single shared instance
manager = WebSocketManager()
