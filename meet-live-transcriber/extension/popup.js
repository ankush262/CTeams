/**
 * popup.js — Popup UI logic
 *
 * Sends START_TRANSCRIBE / STOP_TRANSCRIBE messages to the background
 * service worker, which then handles tabCapture + offscreen orchestration.
 */

const startBtn   = document.getElementById("startBtn");
const stopBtn    = document.getElementById("stopBtn");
const statusEl   = document.getElementById("status");
const indicator  = document.getElementById("indicator");

// Restore UI state from storage
chrome.storage.session.get("transcribing", (result) => {
  if (result.transcribing) setActiveUI();
});

startBtn.addEventListener("click", async () => {
  // Ensure we're on a Google Meet tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("https://meet.google.com/")) {
    statusEl.textContent = "⚠ Open a Google Meet tab first.";
    statusEl.style.color = "#f28b82";
    return;
  }

  startBtn.disabled = true;
  statusEl.textContent = "Starting capture…";
  statusEl.style.color = "#9aa0a6";

  chrome.runtime.sendMessage(
    { type: "START_TRANSCRIBE", tabId: tab.id },
    (response) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
        statusEl.style.color = "#f28b82";
        startBtn.disabled = false;
        return;
      }
      if (response?.ok) {
        setActiveUI();
      } else {
        statusEl.textContent = "Error: " + (response?.error || "unknown");
        statusEl.style.color = "#f28b82";
        startBtn.disabled = false;
      }
    }
  );
});

stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_TRANSCRIBE" });
  setInactiveUI();
});

function setActiveUI() {
  startBtn.style.display = "none";
  stopBtn.style.display = "block";
  indicator.classList.add("active");
  statusEl.textContent = "Transcribing…";
  statusEl.style.color = "#34a853";
}

function setInactiveUI() {
  startBtn.style.display = "block";
  startBtn.disabled = false;
  stopBtn.style.display = "none";
  indicator.classList.remove("active");
  statusEl.textContent = "Stopped.";
  statusEl.style.color = "#9aa0a6";
}
