from datetime import datetime, timezone
from typing import List, Optional

from beanie import Document
from pydantic import Field


class TranscriptChunk(Document):
    # Meeting identifier this transcript chunk belongs to.
    meeting_id: str

    # Raw spoken words recognized by AssemblyAI for this chunk.
    text: str

    # Optional speaker label provided by diarization (for example, "Speaker A").
    speaker: Optional[str] = None

    # Chunk start offset in milliseconds from the beginning of the meeting.
    start_time_ms: int

    # Chunk end offset in milliseconds from the beginning of the meeting.
    end_time_ms: int

    # AssemblyAI confidence score for this chunk in the range 0.0 to 1.0.
    confidence: float

    # Timestamp when this chunk document is stored in MongoDB.
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Marks whether downstream AI processing has already analyzed this chunk.
    processed: bool = False

    class Settings:
        name = "transcript_chunks"

    @classmethod
    async def get_by_meeting(cls, meeting_id: str) -> List["TranscriptChunk"]:
        """Return all chunks for a meeting ordered by start time."""
        return await cls.find(cls.meeting_id == meeting_id).sort("start_time_ms").to_list()

    @classmethod
    async def get_full_text(cls, meeting_id: str) -> str:
        """
        Returns all transcript chunk texts for a meeting
        joined into one string with spaces.

        Used by Groq summarization.
        """
        chunks = await cls.find(
            cls.meeting_id == meeting_id
        ).sort("+start_time_ms").to_list()

        return " ".join([chunk.text for chunk in chunks])


# Backward-compatible alias for modules that import `Transcript`.
Transcript = TranscriptChunk
