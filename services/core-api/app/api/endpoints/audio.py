"""
MeetMind — Audio Endpoints

Live transcription via Gemini 2.0 Flash Live streaming API.

The Chrome extension connects to WS /ws/audio/{meeting_id} and sends raw
PCM16 audio frames (binary). Audio is streamed directly to Gemini Live
which returns transcribed text in real-time — no buffering required.

Also provides:
  GET  /api/audio/config — tells extension the STT backend is ready
  POST /api/audio/chunk  — HTTP fallback for WAV upload
"""

import asyncio
import io
import math
import struct
import time

from beanie import PydanticObjectId
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from app.core.config import settings
from app.models.meeting import Meeting
from app.models.transcript import TranscriptChunk
from app.services import groq_service
from app.services.ws_manager import manager

router = APIRouter()

# ── Gemini Live client ────────────────────────────────────────────────────────
_gemini_client = None
if settings.GEMINI_API_KEY:
    _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)

GEMINI_MODEL = settings.GEMINI_MODEL
SAMPLE_RATE = 16000

# Only dedicated Live models support bidiGenerateContent.
# Use input_audio_transcription to get text transcripts of spoken audio.
# TEXT response modality avoids unnecessary audio generation overhead.
LIVE_CONFIG = types.LiveConnectConfig(
    response_modalities=["TEXT"],
    input_audio_transcription=types.AudioTranscriptionConfig(),
    system_instruction=(
        "You are a real-time meeting transcription assistant. "
        "Listen to the audio and provide transcription. "
        "Output the transcribed text exactly as spoken."
    ),
)

# ── Whisper fallback (used by HTTP /chunk endpoint) ──────────────────────────
_whisper = None
try:
    from groq import Groq
    _whisper = Groq(api_key=settings.GROQ_API_KEY)
except Exception:
    pass

# ── Known Whisper hallucinations ──────────────────────────────────────────────
# Whisper generates these phantom phrases when fed silence / near-silence.
_HALLUCINATION_PATTERNS = {
    "thank you", "thanks", "thank you.", "thanks.", "thank you for watching",
    "thank you for watching.", "thanks for watching.", "bye.", "bye",
    "goodbye", "goodbye.", "okay.", "okay", "brilliant.", "brilliant",
    "so", "so.", "please, please, please.", "please, please, please",
    "you", "you.", "the end.", "the end", "subscribe", "subscribe.",
    "subtitles by the amara.org community", "amara.org",
    "thank you so much.", "thank you so much", "thanks so much.",
    "...", "…", "please subscribe", "like and subscribe",
    "see you next time.", "see you next time", "see you later.",
    "music", "applause", "laughter", "silence",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_wav(pcm16_bytes: bytes, sample_rate: int = 16000) -> bytes:
    """Wrap raw PCM16-LE mono samples into a valid WAV container."""
    data_len = len(pcm16_bytes)
    buf = io.BytesIO()
    # RIFF header
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_len))
    buf.write(b"WAVE")
    # fmt sub-chunk
    buf.write(b"fmt ")
    buf.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
    # data sub-chunk
    buf.write(b"data")
    buf.write(struct.pack("<I", data_len))
    buf.write(pcm16_bytes)
    return buf.getvalue()


def _compute_rms(pcm16_bytes: bytes) -> float:
    """Compute RMS energy of PCM16-LE mono audio. Returns value in 0-32768 range."""
    n_samples = len(pcm16_bytes) // 2
    if n_samples == 0:
        return 0.0
    samples = struct.unpack(f"<{n_samples}h", pcm16_bytes)
    sum_sq = sum(s * s for s in samples)
    return math.sqrt(sum_sq / n_samples)


def _float32_to_pcm16(float_bytes: bytes) -> bytes:
    """Convert little-endian Float32 mono audio bytes (-1..1) to PCM16-LE."""
    n_samples = len(float_bytes) // 4
    if n_samples <= 0:
        return b""

    floats = struct.unpack(f"<{n_samples}f", float_bytes)
    out = bytearray(n_samples * 2)
    offset = 0
    for sample in floats:
        s = max(-1.0, min(1.0, sample))
        v = int(s * 32767) if s >= 0 else int(s * 32768)
        struct.pack_into("<h", out, offset, v)
        offset += 2
    return bytes(out)


def _looks_like_float32_audio(raw_bytes: bytes) -> bool:
    """Heuristic: detect Float32 PCM payloads used by the standalone transcriber."""
    if len(raw_bytes) < 16 or (len(raw_bytes) % 4) != 0:
        return False

    n_samples = min(len(raw_bytes) // 4, 64)
    try:
        probe = struct.unpack(f"<{n_samples}f", raw_bytes[: n_samples * 4])
    except Exception:
        return False

    finite = [x for x in probe if math.isfinite(x)]
    if not finite:
        return False

    # Float32 audio from WebAudio channel data is typically normalized [-1, 1].
    # Allow small overshoot from processing artifacts.
    in_range = sum(1 for x in finite if -1.25 <= x <= 1.25)
    return (in_range / len(finite)) >= 0.95


def _is_hallucination(text: str) -> bool:
    """Check if the transcribed text is a known Whisper hallucination."""
    cleaned = text.strip().lower().rstrip(".")
    # Exact match
    if text.strip().lower() in _HALLUCINATION_PATTERNS:
        return True
    if cleaned in _HALLUCINATION_PATTERNS:
        return True
    # Very short single-word outputs are usually noise
    if len(cleaned) <= 3 and " " not in cleaned:
        return True
    return False


# Minimum RMS energy to consider a buffer as containing speech.
# PCM16 range is -32768 to 32767.  Typical speech RMS is 300-3000+.
# Silence / fan noise is usually < 100.
_MIN_RMS_THRESHOLD = 150


async def _persist_and_broadcast(meeting_id: str, text: str, start_ms: int):
    """Persist a transcript chunk, broadcast to dashboard, trigger background AI."""
    meeting = await Meeting.get(PydanticObjectId(meeting_id))
    if not meeting:
        return

    end_ms = start_ms + 1000

    chunk = TranscriptChunk(
        meeting_id=meeting_id,
        text=text,
        speaker="Speaker",
        start_time_ms=start_ms,
        end_time_ms=end_ms,
        confidence=1.0,
    )
    await chunk.insert()

    meeting.transcript_chunks += 1
    await meeting.save()

    await manager.broadcast(
        meeting_id,
        {
            "type": "transcript_chunk",
            "text": text,
            "speaker": "Speaker",
            "timestamp": start_ms,
            "chunk_id": str(chunk.id),
        },
    )

    # Background AI refinement
    asyncio.create_task(_background_refine(meeting_id, text, chunk, start_ms, end_ms, meeting.transcript_chunks))


async def _background_refine(meeting_id: str, text: str, raw_chunk, start_ms: int, end_ms: int, chunk_count: int):
    """Run speaker diarization and AI analysis without blocking transcription."""
    try:
        lines = await groq_service.identify_speakers(meeting_id, text)
        if lines and len(lines) > 0:
            first = lines[0]
            speaker = first.get("speaker", "Speaker 1")
            raw_chunk.speaker = speaker
            await raw_chunk.save()
            await manager.broadcast(
                meeting_id,
                {
                    "type": "speaker_update",
                    "chunk_id": str(raw_chunk.id),
                    "speaker": speaker,
                },
            )
    except Exception as exc:
        print(f"[audio] Speaker diarization error: {exc}")

    asyncio.create_task(groq_service.extract_action_items(meeting_id, text))

    if chunk_count % 5 == 0:
        asyncio.create_task(groq_service.summarize_transcript(meeting_id))

    if chunk_count % 10 == 0:
        asyncio.create_task(groq_service.detect_conflicts(meeting_id))


# ── WebSocket /ws/audio/{meeting_id} — Gemini Live Audio Stream ──────────────

# This function is registered as a WebSocket route in websocket.py
async def live_audio_ws(websocket: WebSocket, meeting_id: str):
    """
    Receives raw PCM16 mono 16 kHz audio from the Chrome extension.
    Streams audio directly to Gemini Live for real-time transcription.
    No buffering delay — text appears as Gemini produces it.
    """
    meeting = await Meeting.get(PydanticObjectId(meeting_id))
    if not meeting or meeting.status != "active":
        await websocket.close(code=4000, reason="Meeting not active")
        return

    if not _gemini_client:
        await websocket.close(code=4001, reason="Gemini API key not configured")
        return

    await websocket.accept()
    await websocket.send_json({"type": "ready", "meeting_id": meeting_id})

    capture_start = time.time()
    print(f"[audio-ws] Gemini Live audio connected for meeting {meeting_id}")

    try:
        async with _gemini_client.aio.live.connect(
            model=GEMINI_MODEL, config=LIVE_CONFIG
        ) as session:
            print(f"[audio-ws] Gemini Live session established for {meeting_id}")

            # ── Background: receive transcriptions from Gemini ───────────────
            async def _recv_loop():
                try:
                    async for msg in session.receive():
                        text = None
                        sc = getattr(msg, "server_content", None)

                        if sc:
                            # 1) input_audio_transcription → transcript of spoken input
                            it = getattr(sc, "input_transcription", None)
                            if it:
                                text = getattr(it, "text", None)

                            # 2) model_turn with text parts (TEXT modality response)
                            if not text:
                                mt = getattr(sc, "model_turn", None)
                                if mt and getattr(mt, "parts", None):
                                    text = "".join(
                                        p.text for p in mt.parts
                                        if getattr(p, "text", None)
                                    )

                        # 3) Shortcut .text property (newer SDK)
                        if not text and getattr(msg, "text", None):
                            text = msg.text

                        if text and text.strip() and len(text.strip()) >= 2:
                            clean = text.strip()
                            if _is_hallucination(clean):
                                continue
                            elapsed_ms = int((time.time() - capture_start) * 1000)
                            print(f"[audio-ws] Transcript: {clean}")

                            # Persist + broadcast in background so recv stays fast
                            asyncio.create_task(
                                _persist_and_broadcast(meeting_id, clean, elapsed_ms)
                            )

                            # Send transcript back to extension for popup display
                            try:
                                await websocket.send_json({"type": "transcript", "text": clean})
                            except Exception:
                                pass
                except asyncio.CancelledError:
                    pass
                except Exception as exc:
                    print(f"[audio-ws] Gemini receive error: {exc}")

            recv_task = asyncio.create_task(_recv_loop())

            # ── Main loop: forward audio from extension → Gemini ─────────────
            try:
                while True:
                    data = await websocket.receive()

                    if "bytes" in data and data["bytes"]:
                        raw_bytes = data["bytes"]
                        # Support both payload types:
                        # - PCM16-LE (current MeetMind extension)
                        # - Float32-LE normalized audio (standalone transcriber extension)
                        pcm_bytes = (
                            _float32_to_pcm16(raw_bytes)
                            if _looks_like_float32_audio(raw_bytes)
                            else raw_bytes
                        )

                        # Send ALL audio to Gemini (including silence) to keep
                        # the session alive and let Gemini handle VAD internally.
                        await session.send_realtime_input(
                            audio=types.Blob(
                                data=pcm_bytes,
                                mime_type="audio/pcm;rate=16000",
                            )
                        )

                    elif "text" in data and data["text"]:
                        msg = data["text"]
                        if msg == "stop":
                            break
                        elif msg == "ping":
                            await websocket.send_json({"type": "pong"})

            except WebSocketDisconnect:
                pass
            finally:
                recv_task.cancel()
                try:
                    await recv_task
                except asyncio.CancelledError:
                    pass

    except Exception as exc:
        print(f"[audio-ws] Gemini session error: {exc}")
    finally:
        print(f"[audio-ws] Disconnected for meeting {meeting_id}")


# ── GET /config ───────────────────────────────────────────────────────────────

@router.get("/config")
async def get_audio_config():
    """Return STT configuration for the extension."""
    if settings.GEMINI_API_KEY:
        return {"stt": "gemini-live", "model": settings.GEMINI_MODEL, "ws_url": "/ws/audio"}
    if settings.GROQ_API_KEY:
        return {"stt": "whisper-ws", "model": settings.STT_MODEL, "ws_url": "/ws/audio"}
    return {"stt": "none", "model": None}


# ── POST /chunk (HTTP fallback — uses Groq Whisper) ──────────────────────────

@router.post("/chunk")
async def receive_audio_chunk(
    meeting_id: str = Form(...),
    audio: UploadFile = File(...),
):
    """HTTP fallback: receive a WAV audio chunk and transcribe via Whisper."""
    if not _whisper:
        raise HTTPException(status_code=503, detail="Whisper fallback not available")

    meeting = await Meeting.get(PydanticObjectId(meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.status != "active":
        raise HTTPException(status_code=400, detail="Meeting is not active")

    audio_bytes = await audio.read()
    if len(audio_bytes) < 3000:
        return {"status": "skipped", "reason": "too_short"}

    start_ms = meeting.transcript_chunks * 2000

    try:
        result = _whisper.audio.transcriptions.create(
            file=("chunk.wav", audio_bytes),
            model=settings.STT_MODEL,
            response_format="json",
            language="en",
        )
        text = (result.text or "").strip()
    except Exception as exc:
        print(f"[audio] Whisper fallback error: {exc}")
        return {"status": "error", "reason": str(exc)}

    if not text or len(text) < 2 or _is_hallucination(text):
        return {"status": "skipped", "reason": "empty"}

    await _persist_and_broadcast(meeting_id, text, start_ms)
    return {"status": "ok", "text": text}
