from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# Request schema used when a new transcript chunk is sent to the API for storage.
class TranscriptChunkCreate(BaseModel):
    meeting_id: str
    text: str
    speaker: Optional[str] = None
    start_time_ms: int
    end_time_ms: int
    confidence: Optional[float] = 1.0


# Response schema returned by the API after transcript chunks are created or fetched.
class TranscriptChunkResponse(BaseModel):
    id: str
    meeting_id: str
    text: str
    speaker: Optional[str]
    start_time_ms: int
    confidence: float
    created_at: datetime

    class Config:
        from_attributes = True
