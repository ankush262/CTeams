const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const clearDebtBtn = document.getElementById("clearDebtBtn");
const saveWsBtn = document.getElementById("saveWsBtn");
const wsInput = document.getElementById("wsInput");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");

bootstrap();

async function bootstrap() {
  const local = await chrome.storage.local.get(["transcribeWsUrl"]);
  wsInput.value = local.transcribeWsUrl || "ws://localhost:8000";

  const session = await chrome.storage.session.get(["transcribing"]);
  if (session.transcribing) {
    setActiveUI();
  }

  await refreshStats();
}

startBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    setStatus("No active tab found.", true);
    return;
  }

  chrome.runtime.sendMessage({ type: "START_TRANSCRIBE", tabId: tab.id }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, true);
      return;
    }

    if (!response || !response.ok) {
      setStatus(response?.error || "Failed to start.", true);
      return;
    }

    setActiveUI();
    setStatus(response.demoMode ? "Demo dialogue started (auto transcript every 5-7s)." : "Live intelligence started.");
  });
});

stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_TRANSCRIBE" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, true);
      return;
    }

    if (!response || !response.ok) {
      setStatus(response?.error || "Failed to stop.", true);
      return;
    }

    setInactiveUI();
    setStatus("Stopped. Debrief generated.");
  });
});

saveWsBtn.addEventListener("click", async () => {
  const value = wsInput.value.trim();
  if (!value.startsWith("ws://") && !value.startsWith("wss://")) {
    setStatus("WebSocket URL must start with ws:// or wss://", true);
    return;
  }

  await chrome.storage.local.set({ transcribeWsUrl: value });
  setStatus("WebSocket base saved (meeting audio path is automatic).");
});

exportBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "EXPORT_LAST_DEBRIEF" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, true);
      return;
    }

    if (!response || !response.ok) {
      setStatus(response?.error || "Export failed.", true);
      return;
    }

    setStatus("Debrief export started.");
  });
});

clearDebtBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_DEBT_LOG" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, true);
      return;
    }

    if (!response || !response.ok) {
      setStatus(response?.error || "Could not clear debt log.", true);
      return;
    }

    setStatus("Cross-meeting debt log cleared.");
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS_UPDATE") {
    setStatus(message.text || "Status updated.");
  }
  refreshStats();
});

function setActiveUI() {
  startBtn.style.display = "none";
  stopBtn.style.display = "block";
}

function setInactiveUI() {
  startBtn.style.display = "block";
  stopBtn.style.display = "none";
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#ffb3b3" : "#b9cdeb";
}

async function refreshStats() {
  chrome.runtime.sendMessage({ type: "GET_MEETING_STATE" }, (state) => {
    if (!state) {
      return;
    }

    statsEl.textContent = `${state.transcriptCount || 0} lines • ${state.openActions || 0} open tasks • ${state.doneActions || 0} done tasks • ${state.screenshotCount || 0} visuals`;
  });
}
