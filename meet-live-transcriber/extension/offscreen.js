/**
 * offscreen.js — Audio processing inside the Offscreen Document
 *
 * Flow:
 *  1. Receive START_CAPTURE message with a tabCapture streamId.
 *  2. Open the captured MediaStream via getUserMedia (chromeMediaSource: "tab").
 *  3. Create an AudioContext resampled to 16 kHz mono.
 *  4. Use a ScriptProcessorNode to extract raw Float32 PCM chunks.
 *  5. Stream those chunks via WebSocket to the FastAPI /transcribe endpoint.
 *  6. Forward transcribed text back to the background service worker.
 */

const WS_URL = "ws://localhost:8100/transcribe";
const TARGET_SAMPLE_RATE = 16_000;

let ws = null;
let audioContext = null;
let scriptProcessor = null;
let mediaStream = null;

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "START_CAPTURE") {
    startCapture(message.streamId).catch((err) =>
      console.error("[MeetTranscriber] Capture error:", err)
    );
  }
  if (message.type === "STOP_CAPTURE") {
    stopCapture();
  }
});

// ── Main capture + processing pipeline ───────────────────────────────────────
async function startCapture(streamId) {
  // Stop any previous session
  stopCapture();

  console.log("[MeetTranscriber] Starting capture with streamId:", streamId);

  // 1. Get the tab MediaStream through getUserMedia with the captured stream ID
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
  } catch (err) {
    console.error("[MeetTranscriber] getUserMedia failed:", err);
    return;
  }

  mediaStream = stream;
  console.log("[MeetTranscriber] Got media stream, tracks:", stream.getAudioTracks().length);

  // 2. Open WebSocket to the backend
  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    console.error("[MeetTranscriber] WebSocket construction failed:", err);
    return;
  }
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    console.log("[MeetTranscriber] WebSocket connected to", WS_URL);
  };

  ws.onerror = (e) => {
    console.error("[MeetTranscriber] WebSocket error:", e);
  };

  ws.onclose = (e) => {
    console.log("[MeetTranscriber] WebSocket closed (code=%d, reason=%s)", e.code, e.reason);
  };

  // 3. Forward transcription text to background → content script
  ws.onmessage = (event) => {
    if (typeof event.data === "string" && event.data.trim()) {
      console.log("[MeetTranscriber] Received transcript:", event.data.trim());
      chrome.runtime.sendMessage({ type: "TRANSCRIPTION", text: event.data });
    }
  };

  // 4. AudioContext at 16 kHz — browser resamples automatically
  audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  const source = audioContext.createMediaStreamSource(stream);

  // 5. ScriptProcessorNode: bufferSize must be a power of 2 ≥ 256
  //    1 input channel (mono), 1 output channel
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  let chunkCount = 0;

  scriptProcessor.onaudioprocess = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const inputPCM = event.inputBuffer.getChannelData(0); // Float32Array

    // Skip silent chunks to save bandwidth
    let maxAbs = 0;
    for (let i = 0; i < inputPCM.length; i++) {
      const abs = Math.abs(inputPCM[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs < 0.001) return; // silence threshold

    // Copy to avoid sending a reference to a reused AudioBuffer
    const copy = new Float32Array(inputPCM);
    ws.send(copy.buffer);
    chunkCount++;

    if (chunkCount % 20 === 0) {
      console.log("[MeetTranscriber] Sent %d audio chunks (peak: %f)", chunkCount, maxAbs);
    }
  };

  // Connect: source → processor → destination (silent output required to keep
  // the AudioContext graph alive)
  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  console.log("[MeetTranscriber] Audio pipeline started @ %d Hz", TARGET_SAMPLE_RATE);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
function stopCapture() {
  if (scriptProcessor) {
    try { scriptProcessor.disconnect(); } catch (e) { /* ignore */ }
    scriptProcessor = null;
  }
  if (audioContext) {
    try { audioContext.close(); } catch (e) { /* ignore */ }
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (ws) {
    try { ws.close(); } catch (e) { /* ignore */ }
    ws = null;
  }
  console.log("[MeetTranscriber] Capture stopped & cleaned up");
}
