/**
 * content.js — Injected into https://meet.google.com/*
 *
 * Creates a floating subtitle overlay and updates it whenever a
 * TRANSCRIPTION message arrives from the background service worker.
 */

(function () {
  // Guard against double-injection
  if (document.getElementById("meet-transcriber-overlay")) return;

  // ── Build overlay element ─────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.id = "meet-transcriber-overlay";

  Object.assign(overlay.style, {
    position: "fixed",
    bottom: "90px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0, 0, 0, 0.72)",
    color: "#ffffff",
    padding: "10px 22px",
    borderRadius: "10px",
    fontSize: "17px",
    fontFamily: "'Google Sans', Roboto, sans-serif",
    lineHeight: "1.5",
    maxWidth: "72%",
    textAlign: "center",
    zIndex: "999999",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.3s ease",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  });

  document.body.appendChild(overlay);

  // ── Auto-hide timer ───────────────────────────────────────────────────────
  let hideTimer = null;

  function showText(text) {
    overlay.textContent = text;
    overlay.style.opacity = "1";

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      overlay.style.opacity = "0";
    }, 6000);
  }

  // ── Listen for messages from background.js ────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TRANSCRIPTION" && message.text?.trim()) {
      showText(message.text.trim());
    }
  });
})();
