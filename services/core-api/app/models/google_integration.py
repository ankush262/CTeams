from datetime import datetime, timezone
from typing import List, Optional

from beanie import Document
from pydantic import Field


class GoogleIntegration(Document):
    # For now we support one local demo user; this can map to auth user id later.
    user_id: str = "default"

    # OAuth tokens issued by Google for Calendar access.
    access_token: str
    refresh_token: Optional[str] = None
    token_uri: str = "https://oauth2.googleapis.com/token"
    client_id: str = ""
    client_secret: str = ""
    scopes: List[str] = Field(default_factory=list)

    # Access token expiry time in UTC.
    expiry: Optional[datetime] = None

    # Feature controls.
    auto_schedule_enabled: bool = True
    primary_calendar_id: str = "primary"

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "google_integrations"

    @classmethod
    async def get_for_user(cls, user_id: str = "default") -> Optional["GoogleIntegration"]:
        return await cls.find_one(cls.user_id == user_id)
