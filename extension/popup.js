"use strict";

const Core = globalThis.FollowTrackerCore;
const History = globalThis.FollowTrackerHistory;
let activeTab = null;
let activeProfile = null;

function isProfilePath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  if (parts.length === 0) return false;
  const blocked = new Set([
    "explore", "accounts", "reels", "direct", "stories", "challenge",
    "about", "developers", "legal", "api", "p", "tv",
  ]);
  return !blocked.has(parts[0].toLowerCase()) && /^[a-zA-Z0-9._]+$/.test(parts[0]);
}

function sendRuntime(type, tabId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, tabId }, (response) => {
      const error = chrome.runtime.lastError;
      resolve(error ? { ok: false, error: error.message } : (response || { ok: false }));
    });
  });
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function showMessage(text) {
  const element = document.querySelector("#message");
  element.textContent = text;
  element.hidden = !text;
}

function setContext(profile, ready, help) {
  const profileName = document.querySelector("#profile-name");
  const state = document.querySelector("#profile-state");
  const analyze = document.querySelector("#analyze-button");
  profileName.textContent = profile ? `@${profile}` : "Sin perfil abierto";
  state.textContent = ready ? "Listo" : "No disponible";
  state.className = `state-pill ${ready ? "ready" : "offline"}`;
  document.querySelector("#profile-help").textContent = help;
  analyze.disabled = !ready;
}

async function renderStoredSummary(profile) {
  const safe = Core.safeProfile(profile);
  const historyKey = `ft_history_${safe}`;
  const timelineKey = `ft_timeline_${safe}`;
  const stored = await getStorage([historyKey, timelineKey]);
  const snapshot = stored[historyKey];
  const timeline = stored[timelineKey];
  const stats = document.querySelector("#mini-stats");
  if (!snapshot) {
    stats.hidden = true;
    return;
  }
  const summary = History.summarizeSnapshot(snapshot);
  document.querySelector("#followers-count").textContent = summary.followers.toLocaleString("es-UY");
  document.querySelector("#following-count").textContent = summary.following.toLocaleString("es-UY");
  document.querySelector("#reports-count").textContent = String((timeline && timeline.reports && timeline.reports.length) || 1);
  stats.hidden = false;
  const date = summary.updatedAt ? new Date(summary.updatedAt).toLocaleString("es-UY") : "sin fecha";
  document.querySelector("#profile-help").textContent = `Ultimo analisis guardado: ${date}.`;
}

async function initialize() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tabs[0] || null;
  if (!activeTab || !activeTab.url || !activeTab.id) {
    setContext(null, false, "No se pudo leer la pestaña activa.");
    return;
  }

  let url;
  try { url = new URL(activeTab.url); } catch (_error) {
    setContext(null, false, "La pestaña activa no tiene una URL valida.");
    return;
  }

  if (!Core.isInstagramHostname(url.hostname) || !isProfilePath(url.pathname)) {
    setContext(null, false, "Abre instagram.com/usuario/ para hacer un nuevo analisis.");
    return;
  }

  activeProfile = url.pathname.split("/").filter(Boolean)[0].toLowerCase();
  setContext(activeProfile, true, "Listo para guardar una nueva captura.");
  await renderStoredSummary(activeProfile);
}

document.querySelector("#analyze-button").addEventListener("click", async () => {
  if (!activeTab || !activeTab.id || !activeProfile) return;
  const button = document.querySelector("#analyze-button");
  button.disabled = true;
  button.querySelector("strong").textContent = "Iniciando analisis...";
  showMessage("");
  const response = await sendRuntime("START_FROM_POPUP", activeTab.id);
  if (response && response.ok) {
    window.close();
    return;
  }
  button.disabled = false;
  button.querySelector("strong").textContent = "Analizar perfil actual";
  showMessage((response && response.error) || "No se pudo iniciar el analisis.");
});

document.querySelector("#dashboard-button").addEventListener("click", () => {
  const query = activeProfile ? `?profile=${encodeURIComponent(activeProfile)}` : "";
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${query}`) });
});

document.querySelector("#open-instagram").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.instagram.com/" });
});

initialize().catch((error) => {
  setContext(null, false, "No se pudo inicializar la extension.");
  showMessage(error.message || String(error));
});
