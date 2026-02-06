chrome.runtime.onInstalled.addListener(() => {
  console.log("Follow Tracker Auto extension instalada.");
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

async function startAnalysisInTab(tabId) {
  let response = await sendMessageToTab(tabId, { type: "START_ANALYSIS" });

  if (!response.ok && String(response.error || "").includes("Receiving end does not exist")) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    response = await sendMessageToTab(tabId, { type: "START_ANALYSIS" });
  }

  return response;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "START_FROM_POPUP") return undefined;

  startAnalysisInTab(msg.tabId)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));

  return true;
});
