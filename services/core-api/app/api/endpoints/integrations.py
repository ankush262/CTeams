from datetime import datetime, timedelta, timezone
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.config import settings
from app.models.meeting import Meeting
from app.services import google_calendar_service

router = APIRouter()


class AutoScheduleBody(BaseModel):
    enabled: bool


class ManualScheduleBody(BaseModel):
    title: str
    start_iso: str
    end_iso: str
    description: str = ""
    location: Optional[str] = None


@router.get("/google/auth-url")
async def get_google_auth_url(user_id: str = Query(default="default")):
    url = await google_calendar_service.get_google_auth_url(user_id=user_id)
    return {"auth_url": url}


@router.get("/google/callback")
async def google_callback(code: str, state: str):
    await google_calendar_service.handle_google_callback(code=code, state=state)
    return RedirectResponse(url=f"{settings.APP_FRONTEND_URL}/dashboard?google_connected=1")


@router.get("/google/status")
async def google_status(user_id: str = Query(default="default")):
    integration = await google_calendar_service.get_integration(user_id=user_id)
    if not integration:
        return {"connected": False, "auto_schedule_enabled": False}
    return {
        "connected": True,
        "auto_schedule_enabled": integration.auto_schedule_enabled,
        "calendar_id": integration.primary_calendar_id,
        "expiry": integration.expiry,
    }


@router.post("/google/auto-schedule")
async def set_auto_schedule(body: AutoScheduleBody, user_id: str = Query(default="default")):
    integration = await google_calendar_service.set_auto_schedule(user_id=user_id, enabled=body.enabled)
    return {
        "connected": True,
        "auto_schedule_enabled": integration.auto_schedule_enabled,
    }


@router.post("/google/schedule/manual")
async def schedule_manual(body: ManualScheduleBody, user_id: str = Query(default="default")):
    try:
        start_dt = datetime.fromisoformat(body.start_iso)
        end_dt = datetime.fromisoformat(body.end_iso)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ISO datetime format")

    event = await google_calendar_service.create_calendar_event(
        title=body.title,
        start_time=start_dt,
        end_time=end_dt,
        description=body.description,
        location=body.location,
        user_id=user_id,
    )
    return {"scheduled": True, "event": event}


@router.post("/google/schedule/from-meeting/{meeting_id}")
async def schedule_default_followup(meeting_id: str, user_id: str = Query(default="default")):
    try:
        obj_id = PydanticObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting id")

    meeting = await Meeting.get(obj_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    start_dt = datetime.now(timezone.utc) + timedelta(days=1)
    start_dt = start_dt.replace(hour=15, minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(minutes=30)
    description = "Auto-scheduled follow-up from MeetMind meeting intelligence."

    event = await google_calendar_service.create_calendar_event(
        title=f"Follow-up: {meeting.title}",
        start_time=start_dt,
        end_time=end_dt,
        description=description,
        user_id=user_id,
    )
    return {"scheduled": True, "event": event}


@router.get("/google/upcoming")
async def list_upcoming_events(user_id: str = Query(default="default"), max_results: int = Query(default=10, le=50)):
    """List upcoming events from the user's Google Calendar."""
    try:
        events = await google_calendar_service.list_upcoming_events(user_id=user_id, max_results=max_results)
        return {"events": events}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {exc}")
