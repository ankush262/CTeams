# sender.py — POSTs transcript chunks to the MeetMind core API.
#
# Why we never crash on failure:
# The audio bridge is a live capture process. If one HTTP call fails (network
# blip, API restart, timeout), crashing the bridge would silence all future
# transcription for the rest of the meeting. A dropped chunk is a minor gap in
# the transcript; a crashed bridge is a complete loss of all remaining audio.
# We therefore catch all send errors, log them, and continue.

import os
from typing import Optional

import httpx

# Base URL for the core API — read once at module load time.
_API_URL: str = os.getenv("AUDIO_BRIDGE_API_URL", "http://localhost:8000")

# Active meeting ID, set by capture.py after it resolves the current meeting.
_meeting_id: Optional[str] = None


def set_meeting_id(meeting_id: str) -> None:
    """Store the active meeting ID so send_chunk() can reference it."""
    global _meeting_id
    _meeting_id = meeting_id


def send_chunk(
    text: str,
    speaker: Optional[str] = None,
    start_ms: int = 0,
    end_ms: int = 0,
) -> None:
    """POST one transcript chunk to the core API.

    Uses a synchronous httpx call so it can be invoked directly from the
    synchronous AssemblyAI on_data callback without an event loop.

    Args:
        text: Transcribed speech text from AssemblyAI.
        speaker: Optional diarization label (e.g. "Speaker A").
        start_ms: Chunk start offset in milliseconds from meeting start.
        end_ms: Chunk end offset in milliseconds from meeting start.
    """
    if not _meeting_id:
        print("[sender] meeting_id not set — dropping chunk")
        return

    payload = {
        "meeting_id": _meeting_id,
        "text": text,
        "speaker": speaker,
        "start_time_ms": start_ms,
        "end_time_ms": end_ms,
        "confidence": 1.0,
    }

    try:
        response = httpx.post(
            f"{_API_URL}/api/transcript/chunk",
            json=payload,
            timeout=5.0,
        )
        response.raise_for_status()
    except Exception as exc:
        # Log but never re-raise — one missed chunk is acceptable; a dead bridge is not.
        print(f"[sender] failed to send chunk: {exc}")

