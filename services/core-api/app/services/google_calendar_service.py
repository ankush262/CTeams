import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.core.config import settings
from app.models.google_integration import GoogleIntegration


_oauth_state_store: dict[str, dict] = {}


def _ensure_configured() -> None:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )


def _create_oauth_flow(state: Optional[str] = None) -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=settings.GOOGLE_OAUTH_SCOPES,
        state=state,
    )


async def get_google_auth_url(user_id: str = "default") -> str:
    _ensure_configured()
    state = secrets.token_urlsafe(24)
    _oauth_state_store[state] = {
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
    }

    flow = _create_oauth_flow(state=state)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return url


async def handle_google_callback(code: str, state: str) -> GoogleIntegration:
    _ensure_configured()
    state_data = _oauth_state_store.get(state)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    # Drop stale state entries after use.
    _oauth_state_store.pop(state, None)

    flow = _create_oauth_flow(state=state)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    flow.fetch_token(code=code)
    creds = flow.credentials

    existing = await GoogleIntegration.get_for_user(state_data["user_id"])
    now = datetime.now(timezone.utc)
    if existing:
        existing.access_token = creds.token
        existing.refresh_token = creds.refresh_token or existing.refresh_token
        existing.token_uri = creds.token_uri or existing.token_uri
        existing.client_id = creds.client_id or settings.GOOGLE_CLIENT_ID
        existing.client_secret = settings.GOOGLE_CLIENT_SECRET
        existing.scopes = list(creds.scopes or settings.GOOGLE_OAUTH_SCOPES)
        existing.expiry = creds.expiry
        existing.updated_at = now
        await existing.save()
        return existing

    integration = GoogleIntegration(
        user_id=state_data["user_id"],
        access_token=creds.token,
        refresh_token=creds.refresh_token,
        token_uri=creds.token_uri or "https://oauth2.googleapis.com/token",
        client_id=creds.client_id or settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=list(creds.scopes or settings.GOOGLE_OAUTH_SCOPES),
        expiry=creds.expiry,
        created_at=now,
        updated_at=now,
    )
    await integration.insert()
    return integration


async def get_integration(user_id: str = "default") -> Optional[GoogleIntegration]:
    return await GoogleIntegration.get_for_user(user_id)


async def set_auto_schedule(user_id: str, enabled: bool) -> GoogleIntegration:
    integration = await GoogleIntegration.get_for_user(user_id)
    if not integration:
        raise HTTPException(status_code=404, detail="Google integration not found")
    integration.auto_schedule_enabled = enabled
    integration.updated_at = datetime.now(timezone.utc)
    await integration.save()
    return integration


async def _get_credentials_for_user(user_id: str = "default") -> Credentials:
    integration = await GoogleIntegration.get_for_user(user_id)
    if not integration:
        raise HTTPException(status_code=404, detail="Google integration not found")

    creds = Credentials(
        token=integration.access_token,
        refresh_token=integration.refresh_token,
        token_uri=integration.token_uri,
        client_id=integration.client_id,
        client_secret=integration.client_secret,
        scopes=integration.scopes or settings.GOOGLE_OAUTH_SCOPES,
    )

    # Refresh before expiry to reduce latency and avoid failed inserts.
    if not integration.expiry or integration.expiry <= datetime.now(timezone.utc) + timedelta(seconds=30):
        if not creds.refresh_token:
            raise HTTPException(status_code=401, detail="Google refresh token missing. Reconnect integration.")
        creds.refresh(Request())
        integration.access_token = creds.token
        integration.expiry = creds.expiry
        integration.updated_at = datetime.now(timezone.utc)
        await integration.save()

    return creds


async def create_calendar_event(
    title: str,
    start_time: datetime,
    end_time: datetime,
    description: str,
    location: Optional[str] = None,
    user_id: str = "default",
) -> dict:
    creds = await _get_credentials_for_user(user_id)
    integration = await GoogleIntegration.get_for_user(user_id)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    body = {
        "summary": title,
        "description": description,
        "start": {
            "dateTime": start_time.isoformat(),
            "timeZone": "UTC",
        },
        "end": {
            "dateTime": end_time.isoformat(),
            "timeZone": "UTC",
        },
    }
    if location:
        body["location"] = location

    created = (
        service.events()
        .insert(calendarId=integration.primary_calendar_id if integration else "primary", body=body)
        .execute()
    )
    return created


async def list_upcoming_events(
    user_id: str = "default",
    max_results: int = 10,
) -> list[dict]:
    """Fetch upcoming calendar events from Google Calendar."""
    creds = await _get_credentials_for_user(user_id)
    integration = await GoogleIntegration.get_for_user(user_id)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    now = datetime.now(timezone.utc).isoformat()
    result = (
        service.events()
        .list(
            calendarId=integration.primary_calendar_id if integration else "primary",
            timeMin=now,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    events = result.get("items", [])
    return [
        {
            "id": e.get("id"),
            "title": e.get("summary", ""),
            "start": e.get("start", {}).get("dateTime") or e.get("start", {}).get("date"),
            "end": e.get("end", {}).get("dateTime") or e.get("end", {}).get("date"),
            "location": e.get("location"),
            "description": e.get("description", ""),
            "html_link": e.get("htmlLink"),
        }
        for e in events
    ]
