/*
  MeetMind Chrome Extension — popup.js
  
  Wires the popup UI (popup.html) to the background service worker.
  Handles: start/end meeting, display live transcript & action items,
  elapsed timer, connection status, and open dashboard button.
*/

const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

// ── DOM References ────────────────────────────────────────────────────────────

const connectionDot = document.getElementById('connectionDot');
const connectionText = document.getElementById('connectionText');
const idleState = document.getElementById('idleState');
const recordingState = document.getElementById('recordingState');
const startMeetingBtn = document.getElementById('startMeetingBtn');
const endMeetingBtn = document.getElementById('endMeetingBtn');
const elapsedTimer = document.getElementById('elapsedTimer');
const transcriptSection = document.getElementById('transcriptSection');
const transcriptPreview = document.getElementById('transcriptPreview');
const actionsSection = document.getElementById('actionsSection');
const actionsCount = document.getElementById('actionsCount');
const actionList = document.getElementById('actionList');
const openDashboardBtn = document.getElementById('openDashboardBtn');
const copyDebriefBtn = document.getElementById('copyDebriefBtn');

// ── State ─────────────────────────────────────────────────────────────────────

let meetingId = null;
let ws = null;
let timerInterval = null;
let startTime = null;
let actions = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function setConnectionStatus(connected) {
  connectionDot.className = `dot ${connected ? 'dot-connected' : 'dot-disconnected'}`;
  connectionText.textContent = connected ? 'Connected' : 'Disconnected';
}

function showRecording() {
  idleState.classList.add('hidden');
  recordingState.classList.remove('hidden');
  transcriptSection.classList.remove('hidden');
  actionsSection.classList.remove('hidden');
}

function showIdle() {
  idleState.classList.remove('hidden');
  recordingState.classList.add('hidden');
  transcriptSection.classList.add('hidden');
  actionsSection.classList.add('hidden');
  copyDebriefBtn.classList.add('hidden');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    elapsedTimer.textContent = formatTime(elapsed);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function addTranscriptLine(text, speaker) {
  // Remove placeholder if present
  const placeholder = transcriptPreview.querySelector('.transcript-placeholder');
  if (placeholder) placeholder.remove();

  const line = document.createElement('div');
  line.style.marginBottom = '4px';
  if (speaker) {
    line.innerHTML = `<span style="color:#6366f1;font-weight:600">${escapeHtml(speaker)}:</span> ${escapeHtml(text)}`;
  } else {
    line.textContent = text;
  }
  transcriptPreview.appendChild(line);
  transcriptPreview.scrollTop = transcriptPreview.scrollHeight;
}

function addActionItem(task, owner) {
  actions.push({ task, owner });
  actionsCount.textContent = actions.length;

  // Clear "No action items" label
  if (actions.length === 1) {
    actionList.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = 'action-item';
  item.innerHTML = `
    <div class="item-check"></div>
    <div class="item-text">${escapeHtml(task)}</div>
    ${owner ? `<span class="owner-badge">${escapeHtml(owner)}</span>` : ''}
  `;
  actionList.appendChild(item);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWebSocket(id) {
  if (ws) ws.close();

  ws = new WebSocket(`${WS_URL}/ws/${id}`);

  ws.onopen = () => setConnectionStatus(true);
  ws.onclose = () => setConnectionStatus(false);
  ws.onerror = () => setConnectionStatus(false);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'transcript_chunk':
          addTranscriptLine(data.text, data.speaker);
          break;
        case 'action_detected':
          addActionItem(data.task, data.owner);
          break;
        case 'summary_update':
          // Summary is displayed on dashboard
          break;
        case 'conflict_detected':
          addTranscriptLine(`⚠️ Conflict: ${data.message}`, null);
          break;
        case 'debrief_ready':
          copyDebriefBtn.classList.remove('hidden');
          break;
        case 'meeting_ended':
          handleMeetingEnded();
          break;
      }
    } catch {
      // Ignore non-JSON
    }
  };
}

function disconnectWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
  setConnectionStatus(false);
}

// ── API Calls ─────────────────────────────────────────────────────────────────

async function apiStartMeeting(title) {
  const res = await fetch(`${API_URL}/api/meetings/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title || 'Chrome Extension Meeting', participant_count: 2 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiEndMeeting(id) {
  const res = await fetch(`${API_URL}/api/meetings/${id}/end`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiGetActive() {
  const res = await fetch(`${API_URL}/api/meetings/active`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data; // null if no active meeting
}

// ── Event Handlers ────────────────────────────────────────────────────────────

async function handleStart() {
  startMeetingBtn.disabled = true;
  startMeetingBtn.textContent = 'Starting...';

  try {
    // Get the active tab to capture its audio and use its title
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Derive meeting title from tab title (clean up platform suffixes)
    let meetingTitle = tab.title || 'Meeting';
    meetingTitle = meetingTitle
      .replace(/\s*[-|]\s*Google Meet\s*$/i, '')
      .replace(/\s*[-|]\s*Zoom\s*$/i, '')
      .replace(/\s*[-|]\s*Microsoft Teams\s*$/i, '')
      .trim() || 'Meeting';

    // Check for existing active meeting first, or create a new one
    const active = await apiGetActive();
    const meeting = active || await apiStartMeeting(meetingTitle);

    meetingId = meeting.id;
    chrome.storage.local.set({ meetingId });

    // Start tab audio capture via background -> offscreen pipeline
    chrome.runtime.sendMessage(
      { type: 'START_CAPTURE', payload: { meetingId, tabId: tab.id } },
      (response) => {
        if (response && response.success) {
          showRecording();
          startTimer();
          connectWebSocket(meetingId);
        } else {
          // Capture failed, but meeting is created — still show recording for WS updates
          showRecording();
          startTimer();
          connectWebSocket(meetingId);
          console.warn('Tab capture failed:', response?.error);
        }
      }
    );
  } catch (err) {
    console.error('Start failed:', err);
    startMeetingBtn.disabled = false;
    startMeetingBtn.textContent = 'Start Meeting';
  }
}

async function handleEnd() {
  endMeetingBtn.disabled = true;
  endMeetingBtn.textContent = 'Ending...';

  try {
    if (meetingId) {
      await apiEndMeeting(meetingId);
    }
    handleMeetingEnded();
  } catch (err) {
    console.error('End failed:', err);
    endMeetingBtn.disabled = false;
    endMeetingBtn.textContent = 'End Meeting';
  }
}

function handleMeetingEnded() {
  // Stop capture
  chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });

  stopTimer();
  disconnectWebSocket();

  // Show copy debrief button
  copyDebriefBtn.classList.remove('hidden');

  // Reset to idle after brief delay
  setTimeout(() => {
    meetingId = null;
    chrome.storage.local.remove('meetingId');
    showIdle();
    actions = [];
    actionsCount.textContent = '0';
    actionList.innerHTML = '<span class="empty-label">No action items yet</span>';
    transcriptPreview.innerHTML = '<span class="transcript-placeholder">Waiting for speech...</span>';
    elapsedTimer.textContent = '00:00';
    endMeetingBtn.disabled = false;
    endMeetingBtn.textContent = 'End Meeting';
    startMeetingBtn.disabled = false;
    startMeetingBtn.textContent = 'Start Meeting';
  }, 5000);
}

function handleOpenDashboard() {
  const url = meetingId
    ? `http://localhost:3000/meeting/${meetingId}`
    : 'http://localhost:3000/dashboard';
  chrome.tabs.create({ url });
}

async function handleCopyDebrief() {
  if (!meetingId) return;
  try {
    const res = await fetch(`${API_URL}/api/debrief/${meetingId}`);
    if (res.ok) {
      const debrief = await res.json();
      const text = [
        '# Meeting Debrief',
        '',
        '## Summary',
        debrief.summary || 'N/A',
        '',
        '## Decisions',
        ...(debrief.decisions || []).map(d => `- ${d}`),
        '',
        '## Action Items',
        ...(debrief.action_items || []).map(a => `- ${a.task}${a.owner ? ` (@${a.owner})` : ''}`),
        '',
        '## Open Questions',
        ...(debrief.open_questions || []).map(q => `- ${q}`),
      ].join('\n');
      await navigator.clipboard.writeText(text);
      copyDebriefBtn.textContent = 'Copied!';
      setTimeout(() => { copyDebriefBtn.textContent = 'Copy Debrief'; }, 2000);
    } else {
      copyDebriefBtn.textContent = 'Debrief not ready';
      setTimeout(() => { copyDebriefBtn.textContent = 'Copy Debrief'; }, 2000);
    }
  } catch {
    copyDebriefBtn.textContent = 'Failed';
    setTimeout(() => { copyDebriefBtn.textContent = 'Copy Debrief'; }, 2000);
  }
}

// ── Initialize ────────────────────────────────────────────────────────────────

startMeetingBtn.addEventListener('click', handleStart);
endMeetingBtn.addEventListener('click', handleEnd);
openDashboardBtn.addEventListener('click', handleOpenDashboard);
copyDebriefBtn.addEventListener('click', handleCopyDebrief);

// Restore state if there's an active session
chrome.storage.local.get('meetingId', async (result) => {
  if (result.meetingId) {
    // Verify meeting is still active
    try {
      const active = await apiGetActive();
      if (active && active.id === result.meetingId) {
        meetingId = active.id;
        showRecording();
        startTime = new Date(active.started_at).getTime();
        timerInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          elapsedTimer.textContent = formatTime(elapsed);
        }, 1000);
        connectWebSocket(meetingId);
      } else {
        chrome.storage.local.remove('meetingId');
      }
    } catch {
      chrome.storage.local.remove('meetingId');
    }
  }
});

// Check backend connectivity
fetch(`${API_URL}/health`)
  .then((r) => r.ok && setConnectionStatus(true))
  .catch(() => setConnectionStatus(false));
