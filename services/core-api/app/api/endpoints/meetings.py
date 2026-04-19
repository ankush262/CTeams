import asyncio
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.models.meeting import Meeting
from app.schemas.meeting import MeetingCreate, MeetingResponse
from app.services import debrief_service, ws_manager
from app.services.ws_manager import manager

router = APIRouter()


def _to_response(meeting: Meeting) -> MeetingResponse:
    """Convert a Beanie Meeting document to the MeetingResponse schema."""
    return MeetingResponse(
        id=str(meeting.id),
        title=meeting.title,
        status=meeting.status,
        started_at=meeting.started_at,
        ended_at=meeting.ended_at,
        transcript_chunks=meeting.transcript_chunks,
        summary_bullets=meeting.summary_bullets,
        key_decisions=getattr(meeting, "key_decisions", []),
        open_questions=getattr(meeting, "open_questions", []),
        action_items_count=meeting.action_items_count,
        has_conflict=meeting.has_conflict,
        conflict_message=getattr(meeting, "conflict_message", None),
        debrief=meeting.debrief,
    )


# ── GET /meetings ──────────────────────────────────────────────────────────────
# Returns ALL meetings sorted by started_at descending.
# The dashboard uses this to show full meeting history.

@router.get("/meetings", response_model=list[MeetingResponse])
async def list_meetings():
    all_meetings = await Meeting.find_all().sort([("started_at", -1)]).to_list()
    return [_to_response(m) for m in all_meetings]


# ── POST /meetings/start ──────────────────────────────────────────────────────
# Creates a new meeting document and notifies all connected WebSocket clients
# that a meeting has started so the dashboard can update live.

@router.post("/meetings/start", response_model=MeetingResponse)
async def start_meeting(body: MeetingCreate):
    meeting = Meeting(
        title=body.title,
        participant_count=body.participant_count,
    )
    await meeting.insert()

    meeting_id = str(meeting.id)
    await manager.broadcast(meeting_id, {"type": "meeting_started", "meeting_id": meeting_id})
    return _to_response(meeting)


# ── GET /meetings/active ──────────────────────────────────────────────────────
# Must be registered BEFORE /{meeting_id} or FastAPI will match "active"
# as a meeting_id path parameter and never reach this route.
# Returns the most recently started active meeting, or None if none exists.

@router.get("/meetings/active", response_model=MeetingResponse | None)
async def get_active_meeting():
    meeting = await Meeting.get_active()
    if meeting is None:
        return None
    return _to_response(meeting)


# ── GET /meetings/{meeting_id} ────────────────────────────────────────────────
# Fetches a single meeting by its MongoDB ObjectId and returns all current data.
# Used by the dashboard on initial page load to hydrate the UI.

@router.get("/meetings/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(meeting_id: str):
    meeting = await Meeting.get(PydanticObjectId(meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return _to_response(meeting)


# ── POST /meetings/{meeting_id}/end ──────────────────────────────────────────
# Ends an active meeting: sets status and timestamp, runs the debrief
# generation pipeline, persists the result, then broadcasts to all open tabs.

@router.post("/meetings/{meeting_id}/end", response_model=MeetingResponse)
async def end_meeting(meeting_id: str):
    meeting = await Meeting.get(PydanticObjectId(meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    meeting.status = "ended"
    meeting.ended_at = datetime.now(timezone.utc)
    await meeting.save()

    # Clean up speaker tracking context
    from app.services.groq_service import clear_speaker_context
    clear_speaker_context(meeting_id)

    asyncio.create_task(
        debrief_service.generate_and_save_debrief(meeting_id)
    )

    await manager.broadcast(meeting_id, {"type": "meeting_ended", "meeting_id": meeting_id})
    return _to_response(meeting)


# ── WebSocket /ws/{meeting_id} ────────────────────────────────────────────────
# Persistent two-way connection between a browser tab and the server.
# The browser sends no messages here — this channel is primarily used for the
# server to push live updates (transcripts, summary bullets, action items) to all
# connected tabs without the client needing to poll repeatedly.

@router.websocket("/ws/{meeting_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: str):
    await manager.connect(websocket, meeting_id)
    try:
        while True:
            # Keep the connection alive; discard any client-sent messages.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, meeting_id)
