/*
  MeetMind Chrome Extension — background.js (Manifest V3 service worker)

  WHAT A SERVICE WORKER IS IN CHROME EXTENSIONS:
  - In Manifest V3, the background script is a service worker.
  - It is event-driven: Chrome wakes it up when events/messages arrive,
    it handles work, then can be suspended when idle.
  - This is the extension's central coordinator for long-lived logic such
    as capture session state and inter-component messaging.

  MV3 AUDIO CAPTURE ARCHITECTURE:
  - Service workers do NOT have DOM access, so AudioContext/MediaStream are
    unavailable here.
  - Instead, we use an offscreen document (offscreen.html + offscreen.js)
    which has full DOM access and handles all audio processing.
  - This service worker orchestrates: gets the tab capture stream ID,
    creates the offscreen document, and passes the stream ID to it.
  - The offscreen document captures audio, buffers PCM frames, creates WAV
    files, and POSTs them to the backend for Groq Whisper transcription.
*/

let activeMeetingId = null;
let activeTabId = null;
let hasOffscreenDocument = false;

// ── Offscreen Document Management ───────────────────────────────────────────

async function ensureOffscreenDocument() {
  if (hasOffscreenDocument) return;

  // Check if an offscreen document already exists (e.g. from a previous session)
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length > 0) {
    hasOffscreenDocument = true;
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Tab audio capture for real-time meeting transcription',
    });
    hasOffscreenDocument = true;
  } catch (err) {
    // Document might already exist from a race condition
    if (err.message && err.message.includes('already exists')) {
      hasOffscreenDocument = true;
    } else {
      throw err;
    }
  }
}

async function closeOffscreenDocument() {
  if (!hasOffscreenDocument) return;
  try {
    await chrome.offscreen.closeDocument();
  } catch {
    // Ignore — document may already be closed
  }
  hasOffscreenDocument = false;
}

// ── Tab Capture ─────────────────────────────────────────────────────────────

async function startCapture({ meetingId, tabId }) {
  try {
    // Stop any existing capture first
    if (activeMeetingId) {
      await stopCapture();
    }

    activeMeetingId = meetingId;
    activeTabId = tabId;

    // 1. Get a stream ID for the target tab's audio.
    //    This is the MV3 way — the service worker gets a stream ID,
    //    then passes it to a context that can use getUserMedia().
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });

    // 2. Create the offscreen document (if not already present).
    await ensureOffscreenDocument();

    // 3. Tell the offscreen document to start capturing with this stream ID.
    chrome.runtime.sendMessage({
      type: 'START_OFFSCREEN_CAPTURE',
      streamId: streamId,
      meetingId: meetingId,
    });

    return { success: true };
  } catch (error) {
    activeMeetingId = null;
    activeTabId = null;
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function stopCapture() {
  try {
    // Tell offscreen document to stop capture and flush remaining audio
    if (hasOffscreenDocument) {
      chrome.runtime.sendMessage({ type: 'STOP_OFFSCREEN_CAPTURE' });
    }

    activeMeetingId = null;
    activeTabId = null;

    // Close offscreen document after a brief delay to let it flush
    setTimeout(() => closeOffscreenDocument(), 2000);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  // From popup: start audio capture
  if (message.type === 'START_CAPTURE') {
    startCapture(message.payload || {}).then(sendResponse);
    return true; // Keep message channel open for async response
  }

  // From popup: stop audio capture
  if (message.type === 'STOP_CAPTURE') {
    stopCapture().then(sendResponse);
    return true;
  }

  // From popup: get current capture status
  if (message.type === 'GET_STATUS') {
    sendResponse({
      isCapturing: Boolean(activeMeetingId),
      meetingId: activeMeetingId,
    });
    return false;
  }

  // From offscreen: capture started confirmation
  if (message.type === 'OFFSCREEN_CAPTURE_STARTED') {
    console.log('[bg] Offscreen capture started for meeting:', activeMeetingId);
    return false;
  }

  // From offscreen: capture error
  if (message.type === 'OFFSCREEN_CAPTURE_ERROR') {
    console.error('[bg] Offscreen capture error:', message.error);
    return false;
  }

  // From offscreen: transcript result from Whisper
  if (message.type === 'TRANSCRIPT_FROM_AUDIO') {
    // This is informational — the actual transcript is already broadcast via
    // WebSocket by the backend. Popup receives it through its WS connection.
    return false;
  }

  return false;
});
