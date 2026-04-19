(function () {
  if (document.getElementById("meeting-intelligence-sidebar")) {
    return;
  }

  const root = document.createElement("div");
  root.id = "meeting-intelligence-sidebar";

  const style = document.createElement("style");
  style.textContent = `
    #meeting-intelligence-sidebar {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 350px;
      max-height: calc(100vh - 32px);
      z-index: 2147483646;
      background: linear-gradient(160deg, #0f2027 0%, #203a43 45%, #2c5364 100%);
      color: #f2f7ff;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      box-shadow: 0 18px 38px rgba(0, 0, 0, 0.35);
      font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      overflow: hidden;
      backdrop-filter: blur(6px);
    }
    #meeting-intelligence-sidebar * { box-sizing: border-box; }
    .mi-head {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.16);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .mi-title { font-size: 14px; font-weight: 700; letter-spacing: 0.2px; }
    .mi-status { font-size: 11px; color: #c5d9ff; }
    .mi-body {
      padding: 12px 14px;
      display: grid;
      gap: 12px;
      max-height: calc(100vh - 100px);
      overflow-y: auto;
    }
    .mi-card {
      background: rgba(255, 255, 255, 0.09);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 10px;
    }
    .mi-card h4 {
      margin: 0 0 8px;
      font-size: 12px;
      color: #9cd6ff;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .mi-latest {
      font-size: 13px;
      line-height: 1.4;
      color: #ffffff;
      min-height: 38px;
    }
    .mi-summary {
      font-size: 12px;
      line-height: 1.5;
      color: #e5efff;
      white-space: pre-wrap;
    }
    .mi-actions { display: grid; gap: 8px; }
    .mi-action {
      padding: 8px;
      border-radius: 8px;
      background: rgba(3, 18, 29, 0.45);
      border: 1px solid rgba(140, 208, 255, 0.24);
    }
    .mi-action.done {
      opacity: 0.75;
      border-color: rgba(98, 255, 170, 0.34);
      text-decoration: line-through;
    }
    .mi-action-title { font-size: 12px; font-weight: 600; color: #ecf6ff; }
    .mi-action-meta { margin-top: 4px; font-size: 11px; color: #b4c8e6; }
    .mi-gallery {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .mi-shot {
      width: 100%;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      cursor: pointer;
      display: block;
    }
    .mi-foot { font-size: 11px; color: #b7cae4; }
    @media (max-width: 900px) {
      #meeting-intelligence-sidebar { width: min(96vw, 350px); right: 2vw; top: 2vh; }
    }
  `;

  root.innerHTML = `
    <div class="mi-head">
      <div>
        <div class="mi-title">Live Meeting Intelligence</div>
        <div class="mi-status" id="mi-status">Waiting for transcript...</div>
      </div>
      <div class="mi-foot" id="mi-counts">0 lines • 0 tasks</div>
    </div>
    <div class="mi-body">
      <section class="mi-card">
        <h4>Latest Transcript</h4>
        <div class="mi-latest" id="mi-latest">No transcript yet.</div>
      </section>
      <section class="mi-card">
        <h4>Rolling Summary</h4>
        <div class="mi-summary" id="mi-summary">Summary appears as the call progresses.</div>
      </section>
      <section class="mi-card">
        <h4>Live Action Items</h4>
        <div class="mi-actions" id="mi-actions"></div>
      </section>
      <section class="mi-card">
        <h4>Significant Visuals</h4>
        <div class="mi-gallery" id="mi-gallery"></div>
      </section>
    </div>
  `;

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(root);

  const latestEl = document.getElementById("mi-latest");
  const summaryEl = document.getElementById("mi-summary");
  const actionsEl = document.getElementById("mi-actions");
  const galleryEl = document.getElementById("mi-gallery");
  const statusEl = document.getElementById("mi-status");
  const countsEl = document.getElementById("mi-counts");

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "LIVE_UPDATE") {
      renderLive(message.payload);
      return;
    }

    if (message.type === "MEETING_DEBRIEF") {
      statusEl.textContent = "Meeting ended. Debrief generated.";
      return;
    }
  });

  function renderLive(payload) {
    if (!payload) {
      return;
    }

    latestEl.textContent = payload.latestLine || "Listening...";
    summaryEl.textContent = payload.rollingSummary || "Collecting context for summary...";

    const openCount = (payload.actions || []).filter((a) => a.status !== "done").length;
    const doneCount = (payload.actions || []).filter((a) => a.status === "done").length;

    countsEl.textContent = `${payload.transcriptCount || 0} lines • ${openCount} open • ${doneCount} done`;
    statusEl.textContent = payload.active ? "Live capture active" : "Stopped";

    renderActions(payload.actions || []);
    renderScreens(payload.screenshots || []);
  }

  function renderActions(actions) {
    actionsEl.innerHTML = "";
    if (actions.length === 0) {
      actionsEl.innerHTML = "<div class='mi-action-meta'>No action items detected yet.</div>";
      return;
    }

    actions.slice(0, 8).forEach((action) => {
      const row = document.createElement("div");
      row.className = `mi-action ${action.status === "done" ? "done" : ""}`;
      row.innerHTML = `
        <div class="mi-action-title">${escapeHtml(action.title)}</div>
        <div class="mi-action-meta">
          ${escapeHtml(action.assignee || "Unassigned")}
          ${action.due ? ` • due ${escapeHtml(action.due)}` : ""}
          • ${action.status}
        </div>
      `;
      actionsEl.appendChild(row);
    });
  }

  function renderScreens(shots) {
    galleryEl.innerHTML = "";
    if (shots.length === 0) {
      galleryEl.innerHTML = "<div class='mi-action-meta'>No key visuals yet.</div>";
      return;
    }

    shots.slice(-6).forEach((shot) => {
      const img = document.createElement("img");
      img.className = "mi-shot";
      img.src = shot.dataUrl;
      img.title = new Date(shot.timestamp).toLocaleTimeString();
      img.addEventListener("click", () => window.open(shot.dataUrl, "_blank"));
      galleryEl.appendChild(img);
    });
  }

  function escapeHtml(input) {
    return String(input || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
