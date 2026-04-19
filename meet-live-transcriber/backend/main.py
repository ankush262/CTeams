import asyncio
import logging
import os

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("meet-live-transcriber")

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyA_lSKHa3Re2Knu5pQydG_KDpcsFeYxaaw")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-native-audio-preview-09-2025")
SAMPLE_RATE = 16000

app = FastAPI(title="Meet Live Transcriber Backend")

client = genai.Client(api_key=GEMINI_API_KEY)

LIVE_CONFIG = {
    "response_modalities": ["AUDIO"],
    "input_audio_transcription": {},
}


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "provider": "gemini",
        "api_key_set": bool(GEMINI_API_KEY),
        "sample_rate": SAMPLE_RATE,
    }


@app.websocket("/transcribe")
async def transcribe_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    logger.info("WebSocket connected: /transcribe")

    audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=200)

    async def extension_reader() -> None:
        try:
            while True:
                data = await websocket.receive_bytes()
                try:
                    audio_queue.put_nowait(data)
                except asyncio.QueueFull:
                    # Drop chunks under backpressure to preserve realtime behavior.
                    pass
        except WebSocketDisconnect:
            logger.info("Extension disconnected (reader)")

    reader_task = asyncio.create_task(extension_reader())

    try:
        while not reader_task.done():
            try:
                async with client.aio.live.connect(model=MODEL_NAME, config=LIVE_CONFIG) as session:
                    logger.info("Gemini live session opened")

                    async def recv_loop() -> None:
                        try:
                            async for response in session.receive():
                                content = response.server_content
                                if not content:
                                    continue

                                if content.input_transcription and content.input_transcription.text:
                                    text = content.input_transcription.text.strip()
                                    if text:
                                        await websocket.send_text(text)
                                elif content.model_turn and content.model_turn.parts:
                                    text = "".join(
                                        p.text for p in content.model_turn.parts if getattr(p, "text", None)
                                    ).strip()
                                    if text:
                                        await websocket.send_text(text)
                        except asyncio.CancelledError:
                            raise
                        except Exception:
                            logger.exception("Gemini receive loop failed")

                    recv_task = asyncio.create_task(recv_loop())

                    try:
                        while not reader_task.done() and not recv_task.done():
                            try:
                                data = await asyncio.wait_for(audio_queue.get(), timeout=5.0)
                            except asyncio.TimeoutError:
                                continue

                            f32 = np.frombuffer(data, dtype=np.float32)
                            if f32.size == 0:
                                continue

                            pcm16 = (np.clip(f32, -1.0, 1.0) * 32767).astype(np.int16)

                            await session.send_realtime_input(
                                audio=types.Blob(
                                    data=pcm16.tobytes(),
                                    mime_type="audio/pcm;rate=16000",
                                )
                            )
                    finally:
                        recv_task.cancel()
                        try:
                            await recv_task
                        except asyncio.CancelledError:
                            pass
            except WebSocketDisconnect:
                break
            except Exception:
                logger.exception("Gemini session error, reconnecting")
                await asyncio.sleep(1)
    finally:
        reader_task.cancel()
        try:
            await reader_task
        except asyncio.CancelledError:
            pass
