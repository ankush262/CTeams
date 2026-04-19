from datetime import datetime, timezone
from typing import List, Literal, Optional

from beanie import Document
from pydantic import Field


class ActionItem(Document):
    # Meeting identifier this task is associated with.
    meeting_id: str

    # Clear task description extracted by AI from the meeting discussion.
    task: str

    # Optional assignee name mentioned in the transcript (if detected).
    owner: Optional[str] = None

    # Optional spoken deadline phrase captured as-is (not normalized to a date).
    deadline: Optional[str] = None

    # Priority level inferred by AI; high is used for urgent or critical tasks.
    priority: Literal["normal", "high"] = "normal"

    # Workflow state for tracking completion.
    status: Literal["open", "done"] = "open"

    # Exact transcript quote used as evidence for why this action item exists.
    source_text: str

    # Timestamp when the action item is first created in MongoDB.
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "action_items"

    @classmethod
    async def get_by_meeting(cls, meeting_id: str) -> List["ActionItem"]:
        """Return all action items for a meeting ordered by creation time."""
        return await cls.find(cls.meeting_id == meeting_id).sort("created_at").to_list()
