importScripts("core.js", "history.js", "history-guard.js", "history-quality.js");

const HISTORY_PREFIX = "ft_history_";
const TIMELINE_PREFIX = "ft_timeline_";
const CONTENT_FILES = [
  "core.js",
  "trust-core.js",
  "platform-storage.js",
  "capture-store.js",
  "instagram-api.js",
  "instagram-ui.js",
  "analysis-overlay.js",
  "analysis-controller.js",
  "content-entry.js",
];

function timelineKeyForHistoryKey(historyKey) {
  return `${TIMELINE_PREFIX}${historyKey.slice(HISTORY_PREFIX.length)}`;
}

function migrateLegacyStorage() {
  chrome.storage.local.get(null, (items) => {
    if (chrome.runtime.lastError || !items) return;

    const legacyKeys = Object.keys(items).filter((key) => key.startsWith("ft_cache_"));
    const updates = {};

    Object.keys(items)
      .filter((key) => key.startsWith(HISTORY_PREFIX))
      .forEach((historyKey) => {
        const timelineKey = timelineKeyForHistoryKey(historyKey);
        if (!items[timelineKey] && items[historyKey]) {
          updates[timelineKey] = FollowTrackerHistory.appendSnapshot(null, null, items[historyKey]);
        }
      });

    if (!items.ft_settings) {
      updates.ft_settings = {
        minTrustedCoverage: 0.95,
        minHardCoverage: 0.8,
        maxTrustedDropRatio: 0.15,
        confirmRemovalsAfter: 2,
        autoAcceptTrusted: false,
        backupReminderDays: 30,
        backupReminderReports: 5,
      };
    }

    if (Object.keys(updates).length > 0) chrome.storage.local.set(updates);
    if (legacyKeys.length > 0) chrome.storage.local.remove(legacyKeys);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#7557ff" });
  migrateLegacyStorage();
});

chrome.runtime.onStartup.addListener(migrateLegacyStorage);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  Object.entries(changes).forEach(([key, change]) => {
    if (!key.startsWith(HISTORY_PREFIX)) return;
    const timelineKey = timelineKeyForHistoryKey(key);

    if (!change.newValue) {
      chrome.storage.local.remove(timelineKey);
      return;
    }

    chrome.storage.local.get([timelineKey], (result) => {
      if (chrome.runtime.lastError) return;
      const currentTimeline = result ? result[timelineKey] : null;
      const nextTimeline = FollowTrackerHistory.appendSnapshot(
        currentTimeline,
        change.oldValue || null,
        change.newValue
      );
      if (JSON.stringify(currentTimeline || null) !== JSON.stringify(nextTimeline)) {
        chrome.storage.local.set({ [timelineKey]: nextTimeline });
      }
    });
  });
});

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      resolve(response || { ok: false, error: "Sin respuesta." });
    });
  });
}

async function ensureContentLoaded(tabId) {
  const ping = await sendMessageToTab(tabId, { type: "PING" });
  if (ping.ok) return ping;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES,
    });
  } catch (error) {
    return { ok: false, error: `No se pudo cargar la extensión: ${error.message || error}` };
  }
  return sendMessageToTab(tabId, { type: "PING" });
}

async function startAnalysisInTab(tabId) {
  const loaded = await ensureContentLoaded(tabId);
  if (!loaded.ok) return loaded;
  const shown = await sendMessageToTab(tabId, { type: "SHOW_OVERLAY" });
  if (!shown.ok) return shown;

  sendMessageToTab(tabId, { type: "START_ANALYSIS" }).catch(() => {});
  return { ok: true, started: true };
}

function cancelAnalysisInTab(tabId) {
  return sendMessageToTab(tabId, { type: "CANCEL_ANALYSIS" });
}

function setBadgeFor(tabId, text, color) {
  try {
    chrome.action.setBadgeText({ text: String(text || ""), tabId });
    if (color) chrome.action.setBadgeBackgroundColor({ color, tabId });
  } catch (_error) {}
}

function clearBadgeAfter(tabId, ms) {
  setTimeout(() => {
    try { chrome.action.setBadgeText({ text: "", tabId }); } catch (_error) {}
  }, ms);
}

const dashboardOpenTimes = new Map();

function profileFromTabUrl(tabUrl) {
  try {
    const url = new URL(tabUrl || "");
    if (!FollowTrackerCore.isInstagramHostname(url.hostname)) return "";
    const first = url.pathname.split("/").filter(Boolean)[0] || "";
    return /^[a-zA-Z0-9._]+$/.test(first) ? FollowTrackerCore.safeProfile(first) : "";
  } catch (_error) {
    return "";
  }
}

function openDashboardTab(profile, hash) {
  const safe = FollowTrackerCore.safeProfile(profile || "");
  const now = Date.now();
  if (dashboardOpenTimes.has(safe) && now - dashboardOpenTimes.get(safe) < 1500) return;
  dashboardOpenTimes.set(safe, now);
  const query = profile ? `?profile=${encodeURIComponent(safe)}` : "";
  const targetHash = hash ? `#${String(hash).replace(/^#/, "")}` : "";
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${query}${targetHash}`) });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return undefined;

  if (message.type === "START_FROM_POPUP") {
    startAnalysisInTab(message.tabId)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }

  if (message.type === "CANCEL_FROM_POPUP") {
    cancelAnalysisInTab(message.tabId)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }

  if (message.type === "ENSURE_OVERLAY") {
    ensureContentLoaded(message.tabId)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }

  if (message.type === "SHOW_OVERLAY_TAB") {
    sendMessageToTab(message.tabId, { type: "SHOW_OVERLAY" })
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }

  if (message.type === "OPEN_DASHBOARD") {
    openDashboardTab(message.profile || "", message.hash || "");
    sendResponse({ ok: true });
    return undefined;
  }

  if (message.source === "content") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (message.type === "capture-saved") {
      const targetProfile = message.profile || profileFromTabUrl(sender && sender.tab && sender.tab.url);
      setTimeout(() => openDashboardTab(targetProfile, "overview"), 350);
    }
    if (message.type === "legacy-report-suppressed") {
      const targetProfile = message.profile || profileFromTabUrl(sender && sender.tab && sender.tab.url);
      openDashboardTab(targetProfile, "overview");
    }
    if (message.type === "badge" && tabId) {
      setBadgeFor(tabId, message.text, message.color);
      if (["OK", "ERR", "CXL"].includes(message.text)) clearBadgeAfter(tabId, 8000);
    }
  }

  return undefined;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  try { chrome.action.setBadgeText({ text: "", tabId }); } catch (_error) {}
});
