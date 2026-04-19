from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.models.meeting import Meeting

router = APIRouter()


@router.get("/{meeting_id}")
async def get_debrief(meeting_id: str):
    """
    Returns the debrief for a meeting.

    If the meeting is ended and debrief exists: return it immediately.
    If the meeting is ended but debrief is None: return 202 with message
      "Debrief is being generated, try again in a few seconds"
    If the meeting is still active: return 400 with message
      "Meeting is still active. End the meeting first."
    """

    # Find meeting
    try:
        obj_id = PydanticObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting id")

    meeting = await Meeting.get(obj_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Check if active
    if meeting.status == "active":
        raise HTTPException(
            status_code=400,
            detail="Meeting is still active. End the meeting first.",
        )

    # Check if debrief exists
    if meeting.debrief is not None:
        return meeting.debrief

    # Debrief not ready yet
    return JSONResponse(
        status_code=202,
        content={
            "status": "generating",
            "message": "Debrief is being generated. Try again in a few seconds.",
        },
    )
