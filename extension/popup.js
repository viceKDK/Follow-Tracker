"use strict";

const Core = globalThis.FollowTrackerCore;
const History = globalThis.FollowTrackerHistory;
const Trust = globalThis.FollowTrackerTrust;
const PopupCore = globalThis.FollowTrackerPopupCore;
const LAST_PROFILE_KEY = "ft_popup_last_profile";

if (!Core || !History || !Trust || !PopupCore) {
  throw new Error("Follow Tracker Popup no pudo cargar sus dependencias.");
}

let activeTab = null;
let activeTabProfile = "";
let selectedProfile = "";
let storedProfiles = [];
let selectedPending = false;
let summaryRequest = 0;

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

async function discoverSavedProfiles() {
  // getKeys() is supported by recent Chromium versions. Read small metadata
  // only; snapshots and timelines can be large when there are many followers.
  if (typeof chrome.storage.local.getKeys === "function") {
    try {
      const keys = await chrome.storage.local.getKeys();
      if (Array.isArray(keys)) {
        const profileMetaKeys = keys.filter((key) => typeof key === "string" && key.startsWith("ft_profile_meta_"));
        const metadata = profileMetaKeys.length ? await getStorage(profileMetaKeys) : {};
        return PopupCore.savedProfilesFromKeys(keys, metadata);
      }
    } catch (_error) {
      // Fall back on older browsers without promise-based getKeys().
    }
  }
  return PopupCore.savedProfiles(await getStorage(null));
}

function showMessage(text) {
  const element = document.querySelector("#message");
  element.textContent = String(text || "");
  element.hidden = !text;
}

function formatDate(value) {
  if (!value) return "sin fecha";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("es-UY") : "sin fecha";
}

function qualityLabel(status) {
  return {
    trusted: "Captura confiable",
    review: "Conviene revisar",
    suspicious: "Guardada como sospechosa",
    rejected: "Captura rechazada",
  }[status] || "Calidad sin verificar";
}

function createProfilePicker() {
  const container = document.querySelector("#saved-profile-picker");
  const select = document.querySelector("#saved-profile-select");
  const options = [...new Set([activeTabProfile, ...storedProfiles].filter(Boolean))];
  container.hidden = storedProfiles.length === 0;
  select.replaceChildren();
  options.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile;
    option.textContent = `@${profile}${profile === activeTabProfile ? " · pestaña actual" : ""}`;
    select.append(option);
  });
  select.value = selectedProfile;
}

function showJourney(reportCount, pending, status) {
  const journey = PopupCore.journey(reportCount, pending, status);
  document.querySelector("#capture-progress").hidden = false;
  document.querySelector("#capture-progress-label").textContent = journey.label;
  document.querySelector("#capture-progress-value").textContent = `${journey.step}/3`;
  document.querySelector("#capture-progress-bar").style.width = `${Math.round(journey.step / 3 * 100)}%`;
}

function setContext(profile, { pending = false, hasSnapshot = false, help = "" } = {}) {
  const inInstagram = Boolean(profile && activeTabProfile === profile && activeTab && activeTab.id);
  document.querySelector("#profile-name").textContent = profile ? `@${profile}` : "Sin perfil seleccionado";
  const state = document.querySelector("#profile-state");
  state.textContent = pending ? "Revisión pendiente" : inInstagram ? "En Instagram" : hasSnapshot ? "Guardado" : "Para empezar";
  state.className = `state-pill ${pending ? "pending" : inInstagram ? "ready" : hasSnapshot ? "saved" : "offline"}`;
  document.querySelector("#profile-help").textContent = help ||
    (profile ? "Seleccioná Analizar para obtener una nueva captura." : "Abrí Instagram y visitá un perfil para comenzar.");

  const button = document.querySelector("#analyze-button");
  button.disabled = false;
  const title = button.querySelector("strong");
  const subtitle = button.querySelector("small");
  if (!profile) {
    title.textContent = "Abrir Instagram para empezar";
    subtitle.textContent = "Visitá el perfil que quieras analizar";
  } else if (!inInstagram) {
    title.textContent = pending ? "Abrir Instagram para revisar" : `Abrir @${profile} para analizar`;
    subtitle.textContent = pending
      ? "Volvé al perfil para guardar o descartar la captura"
      : "La captura se inicia desde la página del perfil";
  } else {
    title.textContent = pending ? "Continuar revisión" : hasSnapshot ? "Actualizar captura" : "Hacer primera captura";
    subtitle.textContent = pending
      ? "Revisá y confirmá antes de guardar"
      : "La captura se revisa antes de modificar el historial";
  }
}

async function renderSelectedProfile() {
  const profile = selectedProfile;
  const request = ++summaryRequest;
  showMessage("");
  const stats = document.querySelector("#mini-stats");
  const quality = document.querySelector("#quality-summary");
  const pendingSummary = document.querySelector("#pending-summary");
  const progress = document.querySelector("#capture-progress");
  stats.hidden = true;
  quality.hidden = true;
  pendingSummary.hidden = true;
  progress.hidden = true;
  selectedPending = false;

  if (!profile) {
    setContext("", { help: "Abrí un perfil de Instagram para hacer tu primera captura." });
    showJourney(0, false);
    return;
  }

  setContext(profile, { help: "Buscando capturas guardadas…" });
  const keys = Trust.storageKeys(profile);
  const stored = await getStorage([keys.history, keys.timeline, keys.captureMeta, keys.pending]);
  if (request !== summaryRequest || profile !== selectedProfile) return;

  const snapshot = stored[keys.history];
  const timeline = stored[keys.timeline];
  const pending = Boolean(stored[keys.pending]);
  selectedPending = pending;
  pendingSummary.hidden = !pending;
  const reportCount = timeline && Array.isArray(timeline.reports)
    ? timeline.reports.length
    : snapshot ? 1 : 0;
  const latest = timeline && History.latestReport(timeline);
  const metadata = stored[keys.captureMeta];
  const meta = latest && metadata && metadata.reports && metadata.reports[latest.id];
  showJourney(reportCount, pending, meta && meta.status);

  if (!snapshot) {
    setContext(profile, {
      pending,
      help: pending
        ? "Tenés una captura pendiente. Revisala en Instagram antes de guardarla."
        : "Todavía no hay capturas guardadas de este perfil.",
    });
    return;
  }

  const summary = History.summarizeSnapshot(snapshot);
  document.querySelector("#followers-count").textContent = summary.followers.toLocaleString("es-UY");
  document.querySelector("#following-count").textContent = summary.following.toLocaleString("es-UY");
  document.querySelector("#reports-count").textContent = String(reportCount);
  stats.hidden = false;
  quality.hidden = false;
  document.querySelector("#quality-label").textContent = qualityLabel(meta && meta.status);
  const score = document.querySelector("#quality-score");
  score.textContent = meta && Number.isFinite(meta.score) ? `${meta.score}/100` : "—";
  score.className = `quality-score ${meta && meta.status || "review"}`;
  setContext(profile, {
    pending,
    hasSnapshot: true,
    help: pending
      ? "La captura pendiente no modificó tu historial. Abrí Instagram para revisarla."
      : `Última captura guardada: ${formatDate(summary.updatedAt)}.`,
  });
}

function openDashboard(view) {
  const query = selectedProfile ? `?profile=${encodeURIComponent(selectedProfile)}` : "";
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${query}#${view}`) });
}

async function startOrOpenInstagram() {
  const profile = selectedProfile;
  const inInstagram = Boolean(profile && activeTabProfile === profile && activeTab && activeTab.id);
  if (!inInstagram) {
    const url = profile
      ? `https://www.instagram.com/${encodeURIComponent(profile)}/`
      : "https://www.instagram.com/";
    chrome.tabs.create({ url });
    window.close();
    return;
  }

  const button = document.querySelector("#analyze-button");
  button.disabled = true;
  button.querySelector("strong").textContent = selectedPending ? "Abriendo revisión…" : "Iniciando captura…";
  showMessage("");
  try {
    const ensured = await sendRuntime("ENSURE_OVERLAY", activeTab.id);
    if (!ensured || !ensured.ok) throw new Error(ensured && ensured.error || "Recargá la pestaña de Instagram para activar Follow Tracker.");
    const shown = await sendRuntime("SHOW_OVERLAY_TAB", activeTab.id);
    if (!shown || !shown.ok) throw new Error(shown && shown.error || "No se pudo mostrar la revisión.");
    const keys = Trust.storageKeys(profile);
    const pending = await getStorage([keys.pending]);
    if (!pending[keys.pending]) {
      const response = await sendRuntime("START_FROM_POPUP", activeTab.id);
      if (!response || !response.ok) throw new Error(response && response.error || "No se pudo iniciar el análisis.");
    }
    window.close();
  } catch (error) {
    button.disabled = false;
    showMessage(error && error.message || "No se pudo abrir Follow Tracker. Probá recargar Instagram.");
    await renderSelectedProfile();
    showMessage(error && error.message || "No se pudo iniciar el análisis.");
  }
}

async function initialize() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (_error) {}
  activeTab = tabs[0] || null;
  activeTabProfile = PopupCore.profileFromUrl(activeTab && activeTab.url);
  storedProfiles = await discoverSavedProfiles();
  const last = await getStorage([LAST_PROFILE_KEY]);
  const preferred = PopupCore.cleanProfile(last[LAST_PROFILE_KEY]);
  selectedProfile = activeTabProfile || (storedProfiles.includes(preferred) ? preferred : storedProfiles[0]) || "";
  createProfilePicker();
  await renderSelectedProfile();
}

document.querySelector("#saved-profile-select").addEventListener("change", (event) => {
  selectedProfile = PopupCore.cleanProfile(event.target.value);
  if (selectedProfile) chrome.storage.local.set({ [LAST_PROFILE_KEY]: selectedProfile }, () => {
    if (chrome.runtime.lastError) console.warn("No se pudo recordar el último perfil.");
  });
  renderSelectedProfile().catch((error) => showMessage(error.message || String(error)));
});

document.querySelector("#analyze-button").addEventListener("click", () => {
  startOrOpenInstagram().catch((error) => showMessage(error.message || String(error)));
});
document.querySelector("#dashboard-button").addEventListener("click", () => openDashboard("overview"));
document.querySelector("#recent-button").addEventListener("click", () => openDashboard("recent"));
document.querySelector("#changes-button").addEventListener("click", () => openDashboard("relationships"));
document.querySelector("#activity-button").addEventListener("click", () => openDashboard("activity"));
document.querySelector("#admin-button").addEventListener("click", () => openDashboard("admin"));
document.querySelector("#open-instagram").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.instagram.com/" });
});

initialize().catch((error) => {
  setContext("", { help: "No se pudo iniciar el popup." });
  showMessage(error && error.message || String(error));
});
