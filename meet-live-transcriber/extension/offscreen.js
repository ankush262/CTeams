const TARGET_SAMPLE_RATE = 16000;
const CHUNK_SIZE = 2048;

let ws = null;
let wsUrl = "ws://localhost:8000/transcribe";
let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let processorNode = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_CAPTURE") {
    wsUrl = message.wsUrl || wsUrl;
    startCapture(message.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "STOP_CAPTURE") {
    stopCapture();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

async function startCapture(streamId) {
  stopCapture();
  sendStatus("Initializing tab audio capture...");

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => sendStatus(`Connected to ${wsUrl}`);
  ws.onclose = () => sendStatus("Transcription socket closed.");
  ws.onerror = () => sendStatus("Socket error. Check backend availability.");

  ws.onmessage = (event) => {
    if (typeof event.data === "string" && event.data.trim()) {
      chrome.runtime.sendMessage({
        type: "TRANSCRIPTION",
        text: event.data.trim(),
      }).catch(() => {});
    }
  };

  audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(CHUNK_SIZE, 1, 1);

  processorNode.onaudioprocess = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const mono = event.inputBuffer.getChannelData(0);
    const packet = new Float32Array(mono.length);
    packet.set(mono);
    ws.send(packet.buffer);
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioContext.destination);

  sendStatus("Streaming live audio at 16kHz mono.");
}

function stopCapture() {
  if (processorNode) {
    try {
      processorNode.disconnect();
    } catch (_err) {}
    processorNode = null;
  }

  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch (_err) {}
    sourceNode = null;
  }

  if (audioContext) {
    try {
      audioContext.close();
    } catch (_err) {}
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (ws) {
    try {
      ws.close();
    } catch (_err) {}
    ws = null;
  }

  sendStatus("Capture stopped.");
}

function sendStatus(text) {
  chrome.runtime.sendMessage({ type: "STATUS_UPDATE", text }).catch(() => {});
}
