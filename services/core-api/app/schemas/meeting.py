from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# Model vs Schema: models define how data is stored in the database, while schemas define
# the API request/response shape so external contracts can evolve safely without changing storage internals.


class MeetingCreate(BaseModel):
    title: Optional[str] = "Untitled Meeting"
    participant_count: Optional[int] = 1


class MeetingResponse(BaseModel):
    id: str
    title: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime]
    transcript_chunks: int
    summary_bullets: List[str]
    key_decisions: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    action_items_count: int
    has_conflict: bool
    conflict_message: Optional[str] = None
    debrief: Optional[dict] = None

    class Config:
        from_attributes = True


class MeetingUpdate(BaseModel):
    status: Optional[str] = None
    summary_bullets: Optional[List[str]] = None
    has_conflict: Optional[bool] = None
