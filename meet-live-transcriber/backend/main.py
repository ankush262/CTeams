import asyncio
import logging
import os

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types

# Load .env from backend folder first, then try root .env as fallback
load_dotenv()
# Also try loading from the project root (two levels up) for shared keys
_root_env = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
if os.path.exists(_root_env):
    load_dotenv(_root_env, override=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Gemini Live client ────────────────────────────────────────────────────────
_api_key = os.getenv("GEMINI_API_KEY")
if not _api_key:
    raise RuntimeError("GEMINI_API_KEY not set — add it to backend/.env or root .env")

client = genai.Client(api_key=_api_key)
logger.info("Gemini client ready (key: %s…%s)", _api_key[:8], _api_key[-4:])

app = FastAPI(title="Meet Live Transcriber")

# CORS — allow extension offscreen documents & local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model — use env var with a current default (old model was retired Dec 2025)
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-live-preview")
SAMPLE_RATE = 16_000  # must match what the extension sends

logger.info("Using model: %s", MODEL)

LIVE_CONFIG = types.LiveConnectConfig(
    response_modalities=["TEXT"],
    system_instruction=(
        "You are a real-time English transcription service. "
        "ALWAYS transcribe in English regardless of the language spoken. "
        "If the speaker is speaking Hindi or any other non-English language, "
        "transliterate or translate it into English. "
        "Output complete sentences and phrases — at least 15 words when possible. "
        "Accumulate audio context before responding so each response is a full, "
        "meaningful phrase rather than just 2-3 characters. "
        "Output only the transcribed text — no labels, no commentary, no blank responses."
    ),
)


@app.get("/health")
async def health():
    """Simple health check for debugging."""
    return {
        "status": "ok",
        "model": MODEL,
        "api_key_set": bool(_api_key),
    }


@app.websocket("/transcribe")
async def transcribe_ws(websocket: WebSocket):
    """
    Accepts raw Float32 PCM bytes streamed at 16 kHz mono.
    Each chunk is forwarded directly to the Gemini Live API.
    Transcribed text is streamed back in real-time.
    """
    await websocket.accept()
    logger.info("Extension connected — opening Gemini Live session")

    try:
        async with client.aio.live.connect(model=MODEL, config=LIVE_CONFIG) as session:
            logger.info("Gemini Live session established with model=%s", MODEL)

            # ── Background task: receive transcriptions from Gemini ───────────
            async def _recv_loop():
                try:
                    async for msg in session.receive():
                        text = None
                        # Shortcut property (newer SDK versions)
                        if getattr(msg, "text", None):
                            text = msg.text
                        # Explicit server_content path
                        elif (
                            getattr(msg, "server_content", None)
                            and getattr(msg.server_content, "model_turn", None)
                            and getattr(msg.server_content.model_turn, "parts", None)
                        ):
                            text = "".join(
                                p.text
                                for p in msg.server_content.model_turn.parts
                                if getattr(p, "text", None)
                            )
                        if text and text.strip():
                            logger.info("Transcribed: %s", text.strip())
                            await websocket.send_text(text.strip())
                except asyncio.CancelledError:
                    pass
                except Exception as exc:
                    logger.error("Gemini receive error: %s", exc, exc_info=True)

            recv_task = asyncio.create_task(_recv_loop())

            # ── Main loop: forward audio from extension → Gemini ─────────────
            try:
                while True:
                    data = await websocket.receive_bytes()

                    # Float32 → int16 PCM (required by Gemini Live audio/pcm)
                    f32 = np.frombuffer(data, dtype=np.float32)
                    pcm16 = (np.clip(f32, -1.0, 1.0) * 32767).astype(np.int16)

                    await session.send(
                        input=types.LiveClientRealtimeInput(
                            media_chunks=[
                                types.Blob(
                                    mime_type="audio/pcm",
                                    data=pcm16.tobytes(),
                                )
                            ]
                        )
                    )

            except WebSocketDisconnect:
                logger.info("Extension disconnected")
            finally:
                recv_task.cancel()
                try:
                    await recv_task
                except asyncio.CancelledError:
                    pass

    except Exception as exc:
        logger.error("Gemini Live session error: %s", exc, exc_info=True)
        try:
            await websocket.close(code=1011, reason=str(exc))
        except Exception:
            pass
