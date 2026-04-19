/**
 * background.js — Service Worker (Manifest V3)
 *
 * Responsibilities:
 *  1. On START_TRANSCRIBE message from popup, verify the target tab.
 *  2. Create (or reuse) an Offscreen Document for AudioContext processing.
 *  3. Obtain a tabCapture stream ID and forward it to the offscreen document.
 *  4. Relay transcription messages from the offscreen document back to the
 *     active Google Meet content script.
 *  5. Handle STOP_TRANSCRIBE to clean up.
 */

const OFFSCREEN_URL = "offscreen.html";
let offscreenCreated = false;
let activeTabId = null;

// ── 1. Handle messages from popup & offscreen ─────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_TRANSCRIBE") {
    handleStartTranscribe(message.tabId, sendResponse);
    return true; // keep the message channel open for async sendResponse
  }

  if (message.type === "STOP_TRANSCRIBE") {
    chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
    chrome.storage.session.set({ transcribing: false });
    activeTabId = null;
    return;
  }

  if (message.type === "TRANSCRIPTION") {
    relayTranscription(message.text);
    return;
  }
});

// ── 2. Start transcription flow ───────────────────────────────────────────────
async function handleStartTranscribe(tabId, sendResponse) {
  try {
    // Verify tab is a Google Meet page
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url?.startsWith("https://meet.google.com/")) {
      sendResponse({ ok: false, error: "Not a Google Meet tab." });
      return;
    }

    await ensureOffscreenDocument();

    // tabCapture.getMediaStreamId is the MV3-compatible API
    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tabId },
      (streamId) => {
        if (chrome.runtime.lastError) {
          console.error("[MeetTranscriber] tabCapture error:", chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        activeTabId = tabId;
        chrome.storage.session.set({ transcribing: true });

        chrome.runtime.sendMessage({
          type: "START_CAPTURE",
          streamId,
          tabId,
        });

        sendResponse({ ok: true });
      }
    );
  } catch (err) {
    console.error("[MeetTranscriber] Start error:", err);
    sendResponse({ ok: false, error: err.message });
  }
}

// ── 3. Offscreen document helper ─────────────────────────────────────────────
async function ensureOffscreenDocument() {
  if (offscreenCreated) return;

  // Check if one already exists
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });

    if (existingContexts.length > 0) {
      offscreenCreated = true;
      return;
    }
  } catch (e) {
    // getContexts may not be available in older Chrome versions — ignore
    console.warn("[MeetTranscriber] getContexts not available:", e.message);
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification: "Capture and process tab audio for real-time transcription",
    });
    offscreenCreated = true;
  } catch (err) {
    // May already exist (race condition)
    if (!err.message.includes("single offscreen")) {
      throw err;
    }
    offscreenCreated = true;
  }
}

// ── 4. Relay transcription → content script ──────────────────────────────────
function relayTranscription(text) {
  chrome.tabs.query({ url: "https://meet.google.com/*" }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        type: "TRANSCRIPTION",
        text,
      }).catch(() => {
        // Content script may not be loaded yet — safe to ignore
      });
    });
  });
}
