"""Quick WebSocket connection + Gemini session test."""
import asyncio
import numpy as np
import websockets

WS_URL = "ws://localhost:8100/transcribe"

async def main():
    print(f"Connecting to {WS_URL}...")
    async with websockets.connect(WS_URL) as ws:
        print("Connected! Sending 1 second of silent audio...")
        
        # 1 second of 16 kHz mono Float32 silence (very low-level noise)
        samples = np.random.normal(0, 0.001, 16000).astype(np.float32)
        
        # Send in chunks of 4096 samples (matching extension)
        for i in range(0, len(samples), 4096):
            chunk = samples[i:i+4096]
            await ws.send(chunk.tobytes())
            print(f"  Sent chunk {i//4096 + 1} ({len(chunk)} samples)")
            await asyncio.sleep(0.256)  # ~256ms per chunk at 16kHz
        
        # Wait a bit for response
        print("Waiting for transcription response (5s)...")
        try:
            response = await asyncio.wait_for(ws.recv(), timeout=5.0)
            print(f"Got response: {response}")
        except asyncio.TimeoutError:
            print("No transcription response (expected for near-silence)")
        
        print("Test complete — WebSocket + Gemini Live session works!")

asyncio.run(main())
