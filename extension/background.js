importScripts(
  "follower-identity.js", "follower-imports.js", "follower-relations.js", "core-facade.js",
  "follower-history-model.js", "follower-history-engine.js", "follower-projections.js", "history-facade.js",
  "history-guard.js", "history-quality.js", "storage-migrations.js"
);

const HISTORY_PREFIX = "ft_history_";
const TIMELINE_PREFIX = "ft_timeline_";

function timelineKeyForHistoryKey(historyKey) {
  return `${TIMELINE_PREFIX}${historyKey.slice(HISTORY_PREFIX.length)}`;
}

function storageAdapter() {
  return {
    getAll() {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (items) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || String(error)));
          else resolve(items || {});
        });
      });
    },
    set(values) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(values || {}, () => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || String(error)));
          else resolve();
        });
      });
    },
    remove(keys) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.remove(Array.isArray(keys) ? keys : [keys], () => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || String(error)));
          else resolve();
        });
      });
    },
  };
}

function migrateStorage() {
  return FollowTrackerStorageMigrations.migrateStorage(storageAdapter(), {
    appVersion: chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "unknown",
    buildTimeline(snapshot) {
      return FollowTrackerHistory.appendSnapshot(null, null, snapshot);
    },
  });
}

function reportMigrationError(error) {
  try { console.error("Follow Tracker no pudo migrar el almacenamiento:", error); } catch (_error) {}
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#7557ff" });
  return migrateStorage().catch(reportMigrationError);
});

chrome.runtime.onStartup.addListener(() => migrateStorage().catch(reportMigrationError));

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
      const nextTimeline = FollowTrackerHistory.appendSnapshot(currentTimeline, change.oldValue || null, change.newValue);
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
      if (error) { resolve({ ok: false, error: error.message }); return; }
      resolve(response || { ok: false, error: "Sin respuesta." });
    });
  });
}

async function ensureContentLoaded(tabId) {
  const ping = await sendMessageToTab(tabId, { type: "PING" });
  if (ping.ok) return ping;
  return {
    ok: false,
    code: "reload_required",
    error: "Recargá la pestaña de Instagram para activar la versión actual de Follow Tracker.",
  };
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
  } catch (_error) { return ""; }
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
    startAnalysisInTab(message.tabId).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }
  if (message.type === "CANCEL_FROM_POPUP") {
    cancelAnalysisInTab(message.tabId).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }
  if (message.type === "ENSURE_OVERLAY") {
    ensureContentLoaded(message.tabId).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
    return true;
  }
  if (message.type === "SHOW_OVERLAY_TAB") {
    sendMessageToTab(message.tabId, { type: "SHOW_OVERLAY" }).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
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
