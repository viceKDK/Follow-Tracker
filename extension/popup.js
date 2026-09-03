"use strict";

const Core = globalThis.FollowTrackerCore;
const History = globalThis.FollowTrackerHistory;
const Trust = globalThis.FollowTrackerTrust;
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

function setContext(profile, ready, help, pending = false) {
  const profileName = document.querySelector("#profile-name");
  const state = document.querySelector("#profile-state");
  const analyze = document.querySelector("#analyze-button");
  profileName.textContent = profile ? `@${profile}` : "Sin perfil abierto";
  state.textContent = pending ? "Revisión pendiente" : ready ? "Listo" : "No disponible";
  state.className = `state-pill ${pending ? "pending" : ready ? "ready" : "offline"}`;
  document.querySelector("#profile-help").textContent = help;
  analyze.disabled = !ready;
  analyze.querySelector("strong").textContent = pending ? "Continuar revisión" : "Analizar perfil actual";
  analyze.querySelector("small").textContent = pending
    ? "Volvé a la pestaña para guardar o descartar la captura"
    : "Recolecta los datos y te deja revisarlos antes de guardar";
}

function qualityLabel(status) {
  return {
    trusted: "Captura confiable",
    review: "Conviene revisar",
    suspicious: "Guardada como sospechosa",
    rejected: "Captura rechazada",
  }[status] || "Reporte heredado";
}

async function renderStoredSummary(profile) {
  const safe = Core.safeProfile(profile);
  const keys = Trust.storageKeys(safe);
  const stored = await getStorage([
    keys.history,
    keys.timeline,
    keys.captureMeta,
    keys.pending,
  ]);
  const snapshot = stored[keys.history];
  const timeline = stored[keys.timeline];
  const pending = stored[keys.pending];
  const stats = document.querySelector("#mini-stats");
  const quality = document.querySelector("#quality-summary");
  const pendingSummary = document.querySelector("#pending-summary");

  pendingSummary.hidden = !pending;
  if (pending) {
    setContext(profile, true, "La captura todavía no modificó tu historial.", true);
  }

  if (!snapshot) {
    stats.hidden = true;
    quality.hidden = true;
    return;
  }

  const summary = History.summarizeSnapshot(snapshot);
  document.querySelector("#followers-count").textContent = summary.followers.toLocaleString("es-UY");
  document.querySelector("#following-count").textContent = summary.following.toLocaleString("es-UY");
  document.querySelector("#reports-count").textContent = String((timeline && timeline.reports && timeline.reports.length) || 1);
  stats.hidden = false;

  if (!pending) {
    const date = summary.updatedAt ? new Date(summary.updatedAt).toLocaleString("es-UY") : "sin fecha";
    document.querySelector("#profile-help").textContent = `Último análisis guardado: ${date}.`;
  }

  const latest = timeline && History.latestReport(timeline);
  const metadata = stored[keys.captureMeta];
  const meta = latest && metadata && metadata.reports && metadata.reports[latest.id];
  quality.hidden = false;
  document.querySelector("#quality-label").textContent = qualityLabel(meta && meta.status);
  const score = document.querySelector("#quality-score");
  score.textContent = meta && Number.isFinite(meta.score) ? `${meta.score}/100` : "—";
  score.className = `quality-score ${meta && meta.status || "review"}`;
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
    setContext(null, false, "La pestaña activa no tiene una URL válida.");
    return;
  }

  if (!Core.isInstagramHostname(url.hostname) || !isProfilePath(url.pathname)) {
    setContext(null, false, "Abrí instagram.com/usuario/ para hacer un nuevo análisis.");
    return;
  }

  activeProfile = url.pathname.split("/").filter(Boolean)[0].toLowerCase();
  setContext(activeProfile, true, "Listo para preparar una nueva captura.");
  await renderStoredSummary(activeProfile);
}

document.querySelector("#analyze-button").addEventListener("click", async () => {
  if (!activeTab || !activeTab.id || !activeProfile) return;
  const button = document.querySelector("#analyze-button");
  button.disabled = true;
  button.querySelector("strong").textContent = "Abriendo revisión...";
  showMessage("");
  const ensured = await sendRuntime("ENSURE_OVERLAY", activeTab.id);
  if (ensured && ensured.ok) {
    const shown = await sendRuntime("SHOW_OVERLAY_TAB", activeTab.id);
    if (shown && shown.ok) {
      const pending = await getStorage([Trust.storageKeys(activeProfile).pending]);
      if (!pending[Trust.storageKeys(activeProfile).pending]) {
        const response = await sendRuntime("START_FROM_POPUP", activeTab.id);
        if (!response || !response.ok) {
          button.disabled = false;
          button.querySelector("strong").textContent = "Analizar perfil actual";
          showMessage((response && response.error) || "No se pudo iniciar el análisis.");
          return;
        }
      }
      window.close();
      return;
    }
  }
  button.disabled = false;
  button.querySelector("strong").textContent = "Analizar perfil actual";
  showMessage((ensured && ensured.error) || "No se pudo abrir Follow Tracker en esta pestaña.");
});

document.querySelector("#dashboard-button").addEventListener("click", () => {
  const query = activeProfile ? `?profile=${encodeURIComponent(activeProfile)}` : "";
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${query}#relationships`) });
});

document.querySelector("#admin-button").addEventListener("click", () => {
  const query = activeProfile ? `?profile=${encodeURIComponent(activeProfile)}` : "";
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${query}#admin`) });
});

document.querySelector("#open-instagram").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.instagram.com/" });
});

initialize().catch((error) => {
  setContext(null, false, "No se pudo inicializar la extensión.");
  showMessage(error.message || String(error));
});
