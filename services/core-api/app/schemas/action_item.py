from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# Response schema returned when action items are read from the API.
class ActionItemResponse(BaseModel):
    id: str
    meeting_id: str
    task: str
    owner: Optional[str]
    deadline: Optional[str]
    priority: str
    status: str
    source_text: str
    created_at: datetime

    class Config:
        from_attributes = True


# Partial update schema used to edit mutable action item fields.
class ActionItemUpdate(BaseModel):
    status: Optional[str] = None
    owner: Optional[str] = None
    deadline: Optional[str] = None
