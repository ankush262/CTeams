# =============================================================================
# MeetMind Audio Bridge — main.py
# =============================================================================
# This script runs locally on the Windows laptop during a meeting.
# It captures system audio (the meeting call audio playing through the speakers)
# via VB-Cable, streams it to AssemblyAI for real-time speech recognition, and
# forwards each transcript chunk to the MeetMind core API over HTTP.
#
# How it fits into the system:
#   Browser/Zoom → VB-Cable virtual device → this script → AssemblyAI
#                                                         → core-api /transcript/chunk
#                                                         → WebSocket → dashboard
#
# -----------------------------------------------------------------------------
# FINDING THE RIGHT AUDIO DEVICE INDEX ON WINDOWS
# -----------------------------------------------------------------------------
# Run this in a Python shell to list all audio devices:
#
#   import sounddevice as sd
#   print(sd.query_devices())
#
# Look for "CABLE Output (VB-Audio Virtual Cable)" in the list.
# Note its index number and set AUDIO_DEVICE_INDEX in your .env to that value.
# If VB-Cable is not installed, download it free from https://vb-audio.com/Cable/
# and set your meeting app to output audio to "CABLE Input".
# =============================================================================

import os
import sys
from pathlib import Path

# Load environment variables from the root .env file (two levels up from this script).
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
AUDIO_BRIDGE_API_URL = os.getenv("AUDIO_BRIDGE_API_URL")

if not ASSEMBLYAI_API_KEY:
    print("ERROR: ASSEMBLYAI_API_KEY is not set in .env")
    sys.exit(1)

if not AUDIO_BRIDGE_API_URL:
    print("ERROR: AUDIO_BRIDGE_API_URL is not set in .env")
    sys.exit(1)

# capture.py handles the actual sounddevice recording + AssemblyAI streaming loop.
from capture import start_capture


def main() -> None:
    print("MeetMind Audio Bridge starting...")
    print("Listening on VB-Cable output device")
    print("Streaming to AssemblyAI...")
    print(f"Sending transcripts to: {AUDIO_BRIDGE_API_URL}")

    try:
        # Blocking call — runs until the user presses Ctrl+C.
        start_capture(
            api_key=ASSEMBLYAI_API_KEY,
            api_url=AUDIO_BRIDGE_API_URL,
        )
    except KeyboardInterrupt:
        print("\nBridge stopped.")


if __name__ == "__main__":
    main()
