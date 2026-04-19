import asyncio

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException

from app.models.meeting import Meeting
from app.models.transcript import TranscriptChunk
from app.schemas.transcript import TranscriptChunkCreate, TranscriptChunkResponse
from app.services import groq_service, ws_manager
from app.services.groq_service import process_transcript_batch
from app.services.ws_manager import manager

router = APIRouter()


# ── POST /transcript/chunk ────────────────────────────────────────────────────
# Called by the audio-bridge every time AssemblyAI returns a transcribed speech
# segment. Persists the chunk, keeps the parent meeting counter in sync, pushes
# the text live to every browser tab, and periodically triggers AI analysis.

@router.post("/transcript/chunk", response_model=list[TranscriptChunkResponse])
async def receive_chunk(body: TranscriptChunkCreate):
    meeting_id = body.meeting_id

    meeting = await Meeting.get(PydanticObjectId(meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Speaker diarization — split text into dialogue lines
    lines = await groq_service.identify_speakers(meeting_id, body.text)

    saved_chunks = []
    for i, line in enumerate(lines):
        speaker = line.get("speaker", "Speaker 1")
        line_text = line.get("text", "").strip()
        if not line_text:
            continue

        line_start = body.start_time_ms + (i * (body.end_time_ms - body.start_time_ms) // max(len(lines), 1))

        chunk = TranscriptChunk(
            meeting_id=meeting_id,
            text=line_text,
            speaker=speaker,
            start_time_ms=line_start,
            end_time_ms=body.end_time_ms,
            confidence=body.confidence if body.confidence is not None else 1.0,
        )
        await chunk.insert()

        meeting.transcript_chunks += 1
        await meeting.save()

        await manager.broadcast(
            meeting_id,
            {
                "type": "transcript_chunk",
                "text": line_text,
                "speaker": speaker,
                "timestamp": line_start,
                "chunk_id": str(chunk.id),
            },
        )

        saved_chunks.append(TranscriptChunkResponse(
            id=str(chunk.id),
            meeting_id=chunk.meeting_id,
            text=chunk.text,
            speaker=chunk.speaker,
            start_time_ms=chunk.start_time_ms,
            confidence=chunk.confidence,
            created_at=chunk.created_at,
        ))

    # Fire-and-forget AI processing on the original full text
    asyncio.create_task(groq_service.extract_action_items(meeting_id, body.text))

    if meeting.transcript_chunks % 5 == 0:
        asyncio.create_task(groq_service.summarize_transcript(meeting_id))

    if meeting.transcript_chunks % 10 == 0:
        asyncio.create_task(groq_service.detect_conflicts(meeting_id))

    return saved_chunks


# ── GET /transcript/{meeting_id} ──────────────────────────────────────────────
# Returns the full ordered transcript for a meeting, used when a browser tab
# (re)loads and needs to hydrate the transcript view with past chunks.

@router.get("/transcript/{meeting_id}", response_model=list[TranscriptChunkResponse])
async def get_transcript(meeting_id: str):
    chunks = await TranscriptChunk.get_by_meeting(meeting_id)
    return [
        TranscriptChunkResponse(
            id=str(c.id),
            meeting_id=c.meeting_id,
            text=c.text,
            speaker=c.speaker,
            start_time_ms=c.start_time_ms,
            confidence=c.confidence,
            created_at=c.created_at,
        )
        for c in chunks
    ]
