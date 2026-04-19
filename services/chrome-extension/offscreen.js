/*
  MeetMind — offscreen.js

  Runs inside the offscreen document (offscreen.html) which has full DOM access.
  Streams raw PCM16 mono 16 kHz audio over WebSocket to the Python backend
  which transcribes via Groq Whisper and broadcasts results.

  Flow:
  1. background.js sends START_OFFSCREEN_CAPTURE with streamId + meetingId
  2. We connect WS to ws://localhost:8000/ws/audio/{meetingId}
  3. Capture tab audio → resample to 16 kHz → convert to PCM16 → send binary
  4. Backend buffers ~3s, transcribes with Whisper, broadcasts to dashboard
  5. We relay transcript text back to background.js for popup display
*/

const WS_URL = 'ws://localhost:8000';
const TARGET_SAMPLE_RATE = 16000;
const SILENCE_THRESHOLD = 0.01; // RMS threshold for silence detection (float32 range)

let audioContext = null;
let processor = null;
let mediaStream = null;
let meetingId = null;
let audioWs = null;

// ── Audio Helpers ───────────────────────────────────────────────────────────

function resample(float32Array, fromRate, toRate) {
  if (fromRate === toRate) return float32Array;
  const ratio = fromRate / toRate;
  const newLength = Math.round(float32Array.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, float32Array.length - 1);
    const frac = srcIndex - low;
    result[i] = float32Array[low] * (1 - frac) + float32Array[high] * frac;
  }
  return result;
}

function float32ToInt16(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

// ── WebSocket Connection ────────────────────────────────────────────────────

function connectAudioWs(mId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ws/audio/${mId}`);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[offscreen] Audio WS connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ready') {
          console.log('[offscreen] Backend ready for audio');
          resolve(ws);
        }
        if (msg.type === 'transcript') {
          console.log('[offscreen] Transcript:', msg.text);
          chrome.runtime.sendMessage({
            type: 'TRANSCRIPT_FROM_AUDIO',
            text: msg.text,
            meetingId: mId,
          });
        }
      } catch { /* ignore */ }
    };

    ws.onerror = (err) => {
      console.error('[offscreen] Audio WS error:', err);
      reject(err);
    };

    ws.onclose = () => {
      console.log('[offscreen] Audio WS closed');
      audioWs = null;
    };

    // Timeout if no ready signal in 5s
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
}

// ── Start Capture ───────────────────────────────────────────────────────────

async function startCapture(streamId, mId) {
  meetingId = mId;

  try {
    // 1. Connect WebSocket to backend
    audioWs = await connectAudioWs(mId);

    // 2. Capture tab audio
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    });

    // 3. Create AudioContext and processing pipeline
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(2048, 1, 1);

    processor.onaudioprocess = (event) => {
      if (!audioWs || audioWs.readyState !== WebSocket.OPEN) return;

      const float32 = event.inputBuffer.getChannelData(0);

      // Client-side silence detection — skip quiet frames
      let sumSq = 0;
      for (let i = 0; i < float32.length; i++) {
        sumSq += float32[i] * float32[i];
      }
      const rms = Math.sqrt(sumSq / float32.length);
      if (rms < SILENCE_THRESHOLD) return; // skip silence

      // Resample to 16 kHz
      const resampled = resample(float32, audioContext.sampleRate, TARGET_SAMPLE_RATE);

      // Convert to PCM16 and send as binary
      const int16 = float32ToInt16(resampled);
      audioWs.send(int16.buffer);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    chrome.runtime.sendMessage({ type: 'OFFSCREEN_CAPTURE_STARTED' });
    console.log('[offscreen] Capture started, sample rate:', audioContext.sampleRate);

  } catch (err) {
    console.error('[offscreen] Failed to start capture:', err);
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_CAPTURE_ERROR',
      error: err.message || String(err),
    });
  }
}

// ── Stop Capture ────────────────────────────────────────────────────────────

async function stopCapture() {
  // Tell backend to flush and stop
  if (audioWs && audioWs.readyState === WebSocket.OPEN) {
    audioWs.send('stop');
    // Give backend a moment to process final buffer
    await new Promise((r) => setTimeout(r, 1000));
    audioWs.close();
    audioWs = null;
  }

  if (processor) { processor.disconnect(); processor = null; }
  if (audioContext) { await audioContext.close(); audioContext = null; }
  if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }

  meetingId = null;
  console.log('[offscreen] Capture stopped');
}

// ── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'START_OFFSCREEN_CAPTURE') {
    startCapture(message.streamId, message.meetingId);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'STOP_OFFSCREEN_CAPTURE') {
    stopCapture().then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
