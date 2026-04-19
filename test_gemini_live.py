"""Quick test of Gemini Live API connection + input_audio_transcription."""
import asyncio
import time
from google import genai
from google.genai import types

API_KEY = "AIzaSyA_lSKHa3Re2Knu5pQydG_KDpcsFeYxaaw"
MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

async def test():
    client = genai.Client(api_key=API_KEY)
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        input_audio_transcription=types.AudioTranscriptionConfig(),
    )
    try:
        async with client.aio.live.connect(model=MODEL, config=config) as session:
            print("Connected to Gemini Live!")
            # Send 1 sec of silence (PCM16 mono 16kHz)
            silence = b"\x00\x00" * 16000
            await session.send_realtime_input(
                audio=types.Blob(data=silence, mime_type="audio/pcm;rate=16000")
            )
            print("Sent silence, waiting for response...")

            start = time.time()
            async for msg in session.receive():
                sc = getattr(msg, "server_content", None)
                if sc:
                    it = getattr(sc, "input_transcription", None)
                    tc = getattr(sc, "turn_complete", None)
                    mt = getattr(sc, "model_turn", None)
                    print(f"  server_content: input_transcription={it}, turn_complete={tc}, model_turn has parts={mt is not None}")
                else:
                    attrs = [a for a in dir(msg) if not a.startswith("_")]
                    print(f"  msg attrs: {attrs}")
                if time.time() - start > 8:
                    print("Timeout - but connection works!")
                    break
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")

asyncio.run(test())
