# =============================================================================
# MeetMind Audio Bridge — capture.py
# =============================================================================
# This is the core of the audio bridge. It does three things simultaneously:
#   1. Records system audio from VB-Cable using sounddevice
#   2. Streams that audio to AssemblyAI's real-time speech recognition API
#   3. Sends each recognised sentence to the MeetMind core API
#
# WHAT IS VB-CABLE?
# VB-Cable is a free virtual audio device for Windows. It creates a loopback:
# whatever audio plays on "CABLE Input" comes out on "CABLE Output". We set
# Zoom/Teams/Meet to use CABLE Input as the speaker, then record CABLE Output
# here — so we capture the meeting audio without a microphone near the speaker.
#
# WHAT IS SAMPLE RATE?
# Sample rate is how many audio measurements (samples) are taken per second.
# 16 000 Hz (16 kHz) means 16 000 snapshots of the sound wave each second.
# AssemblyAI's real-time API requires exactly 16 kHz, 16-bit mono audio.
# Lower rates (8 kHz) sound like a phone call and miss consonants. Higher rates
# (44.1 kHz) waste bandwidth with no quality gain for speech recognition.
#
# WHAT IS THE DIFFERENCE BETWEEN PARTIAL AND FINAL TRANSCRIPTS?
# AssemblyAI sends two kinds of results while you speak:
#   - Partial: a "best guess so far" that keeps getting updated as more audio
#     arrives. For example: "I think we should" → "I think we should deploy".
#     These arrive very fast (< 500 ms) but are often incomplete or wrong.
#   - Final: sent when AssemblyAI detects a natural speech pause and is
#     confident the sentence is complete. These are accurate and stable.
# We only send Final transcripts to the core API to avoid duplicate chunks
# and to ensure the stored text is clean and complete.
# =============================================================================

import os
import time
from typing import Optional

import assemblyai as aai
import httpx
import sounddevice as sd
import numpy as np  # noqa: F401 — kept for potential future dtype ops

from sender import send_chunk, set_meeting_id

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Sample rate required by AssemblyAI real-time API — do not change this value.
SAMPLE_RATE = 16_000

# Number of audio channels. Mono (1) is sufficient for speech and is required
# by AssemblyAI's real-time endpoint.
CHANNELS = 1

# Audio data type. int16 = 16-bit signed integers, matching AssemblyAI's expectation.
DTYPE = "int16"

# Number of audio frames per sounddevice callback. 100 ms worth of audio.
# 16 000 samples/s × 0.1 s = 1 600 frames per chunk.
BLOCKSIZE = int(SAMPLE_RATE * 0.1)

# Optional VB-Cable device index. Read from environment so it can be configured
# without changing code. Leave unset to use the system default input device.
_device_index_env = os.getenv("AUDIO_DEVICE_INDEX")
DEVICE_INDEX: Optional[int] = int(_device_index_env) if _device_index_env else None


# ---------------------------------------------------------------------------
# Module-level state shared between the sounddevice callback and the
# AssemblyAI transcriber — a simple queue bridges the two.
# ---------------------------------------------------------------------------

# The active meeting ID fetched from the core API at startup.
_meeting_id: Optional[str] = None

# Base URL for the core API (passed in from main.py).
_api_url: Optional[str] = None

# The AssemblyAI transcriber instance, kept alive for the session duration.
_transcriber: Optional[aai.RealtimeTranscriber] = None


# ---------------------------------------------------------------------------
# AssemblyAI callbacks
# ---------------------------------------------------------------------------

def _on_data(transcript: aai.RealtimeTranscript) -> None:
    """Called by AssemblyAI every time new speech is recognised.

    AssemblyAI calls this with both Partial and Final transcripts.
    We ignore Partial results and only act on Final ones to avoid
    sending incomplete or duplicate text to the core API.
    """
    # Ignore empty transcripts (silence between words).
    if not transcript.text:
        return

    # RealtimeFinalTranscript is produced when AssemblyAI detects a speech
    # boundary (pause). It is stable and complete — safe to store.
    if not isinstance(transcript, aai.RealtimeFinalTranscript):
        return  # Partial transcript — skip it.

    text = transcript.text.strip()
    print(f"[transcript] {text}")

    # POST the chunk to the core API. sender.send_chunk() is synchronous so it
    # can be called directly from this callback without an event loop.
    now_ms = int(time.time() * 1000)
    send_chunk(text=text, start_ms=now_ms, end_ms=now_ms)


def _on_error(error: aai.RealtimeError) -> None:
    """Called by AssemblyAI when a streaming error occurs."""
    print(f"[AssemblyAI error] {error}")


# ---------------------------------------------------------------------------
# sounddevice audio callback
# ---------------------------------------------------------------------------

def _audio_callback(
    indata: np.ndarray,
    frames: int,
    time_info,  # noqa: ANN001 — CData type from PortAudio
    status: sd.CallbackFlags,
) -> None:
    """Called by sounddevice every BLOCKSIZE frames with raw PCM audio.

    This runs in a separate high-priority thread managed by PortAudio.
    It must not block — we just forward the bytes to AssemblyAI.

    Args:
        indata: NumPy array of shape (frames, channels) containing PCM samples.
        frames: Number of frames in indata (always BLOCKSIZE).
        time_info: PortAudio timing information (unused).
        status: Flags indicating overflow/underflow (logged as warnings).
    """
    if status:
        print(f"[sounddevice] {status}")

    if _transcriber:
        # Convert to bytes and stream to AssemblyAI.
        # indata is (frames, 1) shaped — flatten to 1-D before converting.
        _transcriber.stream(indata.flatten().tobytes())


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def start_capture(api_key: str, api_url: str) -> None:
    """Start audio capture and real-time transcription.

    Blocks until the user presses Ctrl+C. Called by main.py.

    Args:
        api_key: AssemblyAI API key.
        api_url: MeetMind core API base URL (e.g. http://localhost:8000).
    """
    global _meeting_id, _api_url, _transcriber

    _api_url = api_url

    # ── 1. Fetch the active meeting from the core API ───────────────────────
    with httpx.Client() as client:
        resp = client.get(f"{api_url}/api/meetings/active")
        resp.raise_for_status()
        meeting = resp.json()

    if not meeting:
        print("No active meeting found. Start a meeting in the dashboard first.")
        return

    _meeting_id = meeting["id"]
    set_meeting_id(_meeting_id)
    print(f"Attaching to meeting: {meeting['title']} (id={_meeting_id})")

    # ── 2. Configure AssemblyAI ─────────────────────────────────────────────
    aai.settings.api_key = api_key

    _transcriber = aai.RealtimeTranscriber(
        sample_rate=SAMPLE_RATE,
        on_data=_on_data,
        on_error=_on_error,
    )
    _transcriber.connect()

    # ── 3. Open the sounddevice InputStream ─────────────────────────────────
    # device=DEVICE_INDEX: None uses the system default; set AUDIO_DEVICE_INDEX
    # in .env to the VB-Cable output index discovered via sd.query_devices().
    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype=DTYPE,
        blocksize=BLOCKSIZE,
        device=DEVICE_INDEX,
        callback=_audio_callback,
    ):
        print("Recording — press Ctrl+C to stop.\n")
        # Block the main thread while audio streams in the background thread.
        try:
            while True:
                time.sleep(0.1)
        except KeyboardInterrupt:
            pass  # Propagate to main.py which prints "Bridge stopped."
        finally:
            _transcriber.close()

