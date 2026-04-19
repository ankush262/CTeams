from typing import Optional

from app.models.meeting import Meeting
from app.services import groq_service
from app.services.ws_manager import manager


async def generate_and_save_debrief(meeting_id: str) -> Optional[dict]:
    """
    Generates the post-meeting debrief using Groq AI
    and saves it to the Meeting document.

    Called when a meeting ends.

    Returns the debrief dict or None if generation failed.
    """

    # Refresh final summary/conflict signals using full transcript.
    await groq_service.summarize_transcript(meeting_id)
    await groq_service.detect_conflicts(meeting_id)

    # Call Groq to generate the debrief
    debrief = await groq_service.generate_debrief(meeting_id)

    if debrief is None:
        print(f"Failed to generate debrief for meeting {meeting_id}")
        return None

    # Debrief was already saved to meeting.debrief by generate_debrief
    # but we'll broadcast that it's ready
    await manager.broadcast(meeting_id, {
        "type": "debrief_ready",
        "meeting_id": meeting_id
    })

    return debrief


async def generate_debrief(meeting_id: str) -> Optional[dict]:
    """Backward-compatible wrapper for existing endpoint imports."""
    return await generate_and_save_debrief(meeting_id)
