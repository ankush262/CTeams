/*
  MeetMind Chrome Extension — content.js

  WHAT A CONTENT SCRIPT IS:
  - A content script is JavaScript injected by the extension into matching web pages.
  - It runs in an isolated extension world, alongside the page, and can read page
    details such as URL and document title.

  WHY IT RUNS IN THE PAGE CONTEXT:
  - We need lightweight page awareness (which meeting platform is open right now).
  - This script can inspect location/title and report context to the extension.

  WHAT IT CANNOT DO:
  - Content scripts cannot use privileged capture APIs like chrome.tabCapture.
  - tabCapture is only available to extension pages/background service worker,
    so audio capture is managed by background.js.
*/

function detectPlatform(url) {
  if (!url) {
    return null;
  }

  if (url.includes('meet.google.com')) {
    return 'Google Meet';
  }

  if (url.includes('zoom.us')) {
    return 'Zoom';
  }

  if (url.includes('teams.microsoft.com')) {
    return 'Teams';
  }

  return null;
}

const pageUrl = window.location.href;
const platform = detectPlatform(pageUrl);

// On load, report detected meeting page context to the background service worker.
if (platform) {
  chrome.runtime.sendMessage({
    type: 'MEETING_PAGE_DETECTED',
    platform,
    url: pageUrl,
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'GET_PAGE_INFO') {
    return false;
  }

  sendResponse({
    platform,
    url: window.location.href,
    title: document.title,
  });

  return false;
});
