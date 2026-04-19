const OFFSCREEN_URL = "offscreen.html";
const DEFAULT_WS_URL = "ws://localhost:8000/transcribe";
const SCREENSHOT_INTERVAL_MS = 15000;
const SIGNIFICANT_VISUAL_DIFF = 0.14;

const CALL_URL_PATTERNS = [
  /^https:\/\/meet\.google\.com\//i,
  /^https:\/\/([a-z0-9-]+\.)?zoom\.us\//i,
  /^https:\/\/([a-z0-9-]+\.)?teams\.microsoft\.com\//i,
];

const state = {
  active: false,
  tabId: null,
  windowId: null,
  startedAt: null,
  wsUrl: DEFAULT_WS_URL,
  transcript: [],
  rollingSummary: "",
  actions: [],
  screenshots: [],
  debtLog: {},
  screenshotTimer: null,
  lastVisualHash: null,
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_TRANSCRIBE") {
    startMeetingIntelligence(message.tabId, sendResponse);
    return true;
  }

  if (message.type === "STOP_TRANSCRIBE") {
    stopMeetingIntelligence()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "TRANSCRIPTION") {
    processTranscriptLine(message.text);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_MEETING_STATE") {
    sendResponse(getPublicMeetingState());
    return true;
  }

  if (message.type === "EXPORT_LAST_DEBRIEF") {
    exportLastDebrief().then(sendResponse);
    return true;
  }

  if (message.type === "CLEAR_DEBT_LOG") {
    chrome.storage.local.set({ debtLog: {} }).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

async function startMeetingIntelligence(tabId, sendResponse) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isCallTab(tab.url)) {
      sendResponse({ ok: false, error: "Open a Meet, Zoom, or Teams tab first." });
      return;
    }

    if (state.active) {
      await stopMeetingIntelligence();
    }

    resetStateForNewMeeting(tabId, tab.windowId || chrome.windows.WINDOW_ID_CURRENT);
    await ensureOffscreenDocument();

    const settings = await chrome.storage.local.get(["transcribeWsUrl"]);
    state.wsUrl = settings.transcribeWsUrl || DEFAULT_WS_URL;

    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, async (streamId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      try {
        await sendToRuntime({
          type: "START_CAPTURE",
          streamId,
          wsUrl: state.wsUrl,
        });

        state.active = true;
        await chrome.storage.session.set({ transcribing: true });
        startScreenshotMonitor();
        broadcastLiveUpdate();
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function stopMeetingIntelligence() {
  if (!state.active && !state.startedAt) {
    return;
  }

  try {
    await sendToRuntime({ type: "STOP_CAPTURE" });
  } catch (_err) {
    // Offscreen can already be closed.
  }

  clearScreenshotMonitor();
  await chrome.storage.session.set({ transcribing: false });

  const debrief = await createDebrief();
  await persistDebrief(debrief);
  await mergeDebtLogIntoStorage();

  sendToTab(state.tabId, { type: "MEETING_DEBRIEF", debrief });
  resetStateAfterStop();
}

function processTranscriptLine(text) {
  const clean = (text || "").trim();
  if (!clean) {
    return;
  }

  const ts = new Date().toISOString();
  state.transcript.push({ text: clean, timestamp: ts });

  updateRollingSummary();
  upsertActionItems(clean, ts);
  updateDebtLog(clean);

  broadcastLiveUpdate(clean);
}

function updateRollingSummary() {
  const recent = state.transcript.slice(-8).map((t) => t.text);
  if (recent.length === 0) {
    state.rollingSummary = "";
    return;
  }

  const stitched = recent.join(" ");
  const parts = stitched
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(-3);

  state.rollingSummary = parts.join(" ");
}

function upsertActionItems(line, timestamp) {
  const normalized = line.toLowerCase();

  const createTrigger =
    /\b(action item|todo|follow up|next step|please|need to|should|will)\b/i.test(line);

  if (createTrigger) {
    const assignee = extractAssignee(line);
    const due = extractDuePhrase(line);
    const title = cleanActionTitle(line);

    const existing = state.actions.find(
      (item) => item.status !== "done" && similarity(item.title, title) > 0.75
    );

    if (!existing) {
      state.actions.unshift({
        id: crypto.randomUUID(),
        title,
        assignee,
        due,
        status: "open",
        createdAt: timestamp,
        completedAt: null,
      });
    }
  }

  const doneTrigger = /\b(done|completed|resolved|finished|closed)\b/i.test(normalized);
  if (!doneTrigger) {
    return;
  }

  for (const action of state.actions) {
    if (action.status === "done") {
      continue;
    }

    const score = similarity(action.title, line);
    const nameMatch = action.assignee && normalized.includes(action.assignee.toLowerCase());
    if (score > 0.45 || nameMatch) {
      action.status = "done";
      action.completedAt = timestamp;
      break;
    }
  }
}

function extractAssignee(line) {
  const byName = line.match(/(?:for|to|by|assign(?:ed)? to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (byName) {
    return byName[1];
  }

  const atMention = line.match(/@([A-Za-z][A-Za-z0-9_-]+)/);
  if (atMention) {
    return atMention[1];
  }

  return "Unassigned";
}

function extractDuePhrase(line) {
  const dueMatch = line.match(/\b(?:by|before|on)\s+([A-Za-z0-9,\-\s]{3,30})/i);
  return dueMatch ? dueMatch[1].trim() : "";
}

function cleanActionTitle(line) {
  return line
    .replace(/^(action item|todo|follow up|next step)\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function updateDebtLog(line) {
  const blockerMatch = line.match(/\b(blocker|open question|pending|stuck|unresolved)\b[:\-\s]*(.+)?/i);
  if (!blockerMatch) {
    return;
  }

  const topic = (blockerMatch[2] || line).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (!topic) {
    return;
  }

  const key = topic.split(/\s+/).slice(0, 8).join(" ");
  if (!state.debtLog[key]) {
    state.debtLog[key] = { count: 0, lastSeen: null, resolved: false };
  }

  state.debtLog[key].count += 1;
  state.debtLog[key].lastSeen = new Date().toISOString();
}

function broadcastLiveUpdate(latestLine) {
  sendToTab(state.tabId, {
    type: "LIVE_UPDATE",
    payload: {
      active: state.active,
      latestLine: latestLine || "",
      rollingSummary: state.rollingSummary,
      actions: state.actions.slice(0, 20),
      screenshots: state.screenshots.slice(-8),
      transcriptCount: state.transcript.length,
    },
  });
}

function sendToTab(tabId, message) {
  if (!tabId) {
    return;
  }
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function startScreenshotMonitor() {
  clearScreenshotMonitor();
  state.screenshotTimer = setInterval(captureSignificantVisual, SCREENSHOT_INTERVAL_MS);
}

function clearScreenshotMonitor() {
  if (state.screenshotTimer) {
    clearInterval(state.screenshotTimer);
    state.screenshotTimer = null;
  }
}

async function captureSignificantVisual() {
  if (!state.active) {
    return;
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(state.windowId, { format: "jpeg", quality: 55 });
    const hash = await hashImageData(dataUrl);

    if (state.lastVisualHash !== null) {
      const diff = Math.abs(hash - state.lastVisualHash) / 255;
      if (diff < SIGNIFICANT_VISUAL_DIFF) {
        return;
      }
    }

    state.lastVisualHash = hash;

    state.screenshots.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      dataUrl,
    });

    if (state.screenshots.length > 30) {
      state.screenshots.shift();
    }

    broadcastLiveUpdate();
  } catch (_err) {
    // Ignore occasional screenshot failures on navigation switches.
  }
}

function hashImageData(dataUrl) {
  return fetch(dataUrl)
    .then((res) => res.blob())
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      const canvas = new OffscreenCanvas(16, 16);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("2D context unavailable");
      }

      ctx.drawImage(bitmap, 0, 0, 16, 16);
      bitmap.close();

      const pixels = ctx.getImageData(0, 0, 16, 16).data;
      let sum = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        sum += Math.round((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3);
      }

      return Math.round(sum / 256);
    });
}

async function createDebrief() {
  const endedAt = new Date().toISOString();
  const decisions = extractDecisionLines();
  const openQuestions = extractOpenQuestions();

  return {
    id: crypto.randomUUID(),
    startedAt: state.startedAt,
    endedAt,
    rollingSummary: state.rollingSummary,
    decisions,
    openQuestions,
    actionItems: state.actions,
    screenshotGallery: state.screenshots,
    transcript: state.transcript,
    personalizedDigest: buildPersonalDigest(state.actions),
    followups: extractFollowupMentions(),
  };
}

function extractDecisionLines() {
  return state.transcript
    .filter((t) => /\b(decided|decision|agreed|finalized|approved)\b/i.test(t.text))
    .slice(-12);
}

function extractOpenQuestions() {
  return state.transcript
    .filter((t) => /\?|\b(open question|unclear|not sure|pending)\b/i.test(t.text))
    .slice(-15);
}

function extractFollowupMentions() {
  return state.transcript
    .filter((t) => /\b(schedule|follow-up meeting|next meeting|sync again|calendar invite)\b/i.test(t.text))
    .slice(-10);
}

function buildPersonalDigest(actions) {
  const digest = {};
  for (const action of actions) {
    const owner = action.assignee || "Unassigned";
    if (!digest[owner]) {
      digest[owner] = [];
    }
    digest[owner].push(action);
  }
  return digest;
}

async function persistDebrief(debrief) {
  const existing = await chrome.storage.local.get(["meetingHistory"]);
  const history = existing.meetingHistory || [];
  history.unshift(debrief);

  const trimmed = history.slice(0, 25);
  await chrome.storage.local.set({
    meetingHistory: trimmed,
    lastDebrief: debrief,
  });
}

async function mergeDebtLogIntoStorage() {
  const existing = await chrome.storage.local.get(["debtLog"]);
  const persisted = existing.debtLog || {};

  for (const [topic, meta] of Object.entries(state.debtLog)) {
    if (!persisted[topic]) {
      persisted[topic] = { count: 0, lastSeen: null, resolved: false };
    }

    persisted[topic].count += meta.count;
    persisted[topic].lastSeen = meta.lastSeen;
  }

  await chrome.storage.local.set({ debtLog: persisted });
}

async function exportLastDebrief() {
  const { lastDebrief } = await chrome.storage.local.get(["lastDebrief"]);
  if (!lastDebrief) {
    return { ok: false, error: "No debrief available yet." };
  }

  const blob = new Blob([JSON.stringify(lastDebrief, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename: `meeting-debrief-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    saveAs: true,
  });

  URL.revokeObjectURL(url);
  return { ok: true };
}

function getPublicMeetingState() {
  return {
    active: state.active,
    startedAt: state.startedAt,
    transcriptCount: state.transcript.length,
    openActions: state.actions.filter((a) => a.status !== "done").length,
    doneActions: state.actions.filter((a) => a.status === "done").length,
    screenshotCount: state.screenshots.length,
  };
}

function resetStateForNewMeeting(tabId, windowId) {
  state.active = false;
  state.tabId = tabId;
  state.windowId = windowId;
  state.startedAt = new Date().toISOString();
  state.transcript = [];
  state.rollingSummary = "";
  state.actions = [];
  state.screenshots = [];
  state.debtLog = {};
  state.lastVisualHash = null;
}

function resetStateAfterStop() {
  state.active = false;
  state.tabId = null;
  state.windowId = null;
  state.startedAt = null;
  state.transcript = [];
  state.rollingSummary = "";
  state.actions = [];
  state.screenshots = [];
  state.debtLog = {};
  state.lastVisualHash = null;
}

function isCallTab(url) {
  if (!url) {
    return false;
  }
  return CALL_URL_PATTERNS.some((re) => re.test(url));
}

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  if (contexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA"],
    justification: "Capture and stream call audio for live intelligence",
  });
}

function sendToRuntime(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function similarity(a, b) {
  const left = normalizeForSimilarity(a);
  const right = normalizeForSimilarity(b);
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftWords = new Set(left.split(" "));
  const rightWords = new Set(right.split(" "));

  let common = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      common += 1;
    }
  }

  return common / Math.max(leftWords.size, rightWords.size);
}

function normalizeForSimilarity(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
