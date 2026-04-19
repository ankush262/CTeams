from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import manager
from app.api.endpoints.audio import live_audio_ws as _live_audio_ws

router = APIRouter()


@router.websocket("/ws/audio/{meeting_id}")
async def audio_ws(websocket: WebSocket, meeting_id: str):
    """Proxy to the live audio transcription handler."""
    await _live_audio_ws(websocket, meeting_id)


@router.websocket("/ws/{meeting_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: str):
    """
    WebSocket endpoint for real-time meeting updates.

    Frontend connects here and receives live events:
    - transcript_chunk: new speech detected
    - summary_update: AI generated new summary bullets
    - action_detected: AI found an action item
    - conflict_detected: AI found a contradiction
    - meeting_ended: meeting has ended
    - debrief_ready: debrief has been generated
    """

    # Accept and register this connection
    await manager.connect(websocket, meeting_id)

    try:
        # Send immediate confirmation
        await websocket.send_json({
            "type": "connected",
            "meeting_id": meeting_id,
        })

        # Keep connection alive by listening for messages
        while True:
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, meeting_id)
