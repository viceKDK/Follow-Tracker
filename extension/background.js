chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#1fa37d" });
});

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      resolve(response || { ok: false, error: "No response." });
    });
  });
}

async function ensureContentLoaded(tabId) {
  const ping = await sendMessageToTab(tabId, { type: "PING" });
  if (ping.ok) return ping;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (e) {
    return { ok: false, error: `No se pudo inyectar content.js: ${e.message || e}` };
  }
  return await sendMessageToTab(tabId, { type: "PING" });
}

async function startAnalysisInTab(tabId) {
  const loaded = await ensureContentLoaded(tabId);
  if (!loaded.ok) return loaded;
  return await sendMessageToTab(tabId, { type: "START_ANALYSIS" });
}

async function cancelAnalysisInTab(tabId) {
  return await sendMessageToTab(tabId, { type: "CANCEL_ANALYSIS" });
}

function setBadgeFor(tabId, text, color) {
  try {
    chrome.action.setBadgeText({ text: String(text || ""), tabId });
    if (color) chrome.action.setBadgeBackgroundColor({ color, tabId });
  } catch (_e) {}
}

function clearBadgeAfter(tabId, ms) {
  setTimeout(() => {
    try { chrome.action.setBadgeText({ text: "", tabId }); } catch (_e) {}
  }, ms);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return undefined;

  if (msg.type === "START_FROM_POPUP") {
    startAnalysisInTab(msg.tabId)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }

  if (msg.type === "CANCEL_FROM_POPUP") {
    cancelAnalysisInTab(msg.tabId)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }

  if (msg.type === "ENSURE_OVERLAY") {
    ensureContentLoaded(msg.tabId)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }

  if (msg.source === "content") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (msg.type === "badge" && tabId) {
      setBadgeFor(tabId, msg.text, msg.color);
      if (msg.text === "OK" || msg.text === "ERR" || msg.text === "CXL") {
        clearBadgeAfter(tabId, 8000);
      }
    }
  }

  return undefined;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  try { chrome.action.setBadgeText({ text: "", tabId }); } catch (_e) {}
});
