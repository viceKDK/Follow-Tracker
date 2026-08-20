// El popup solo asegura que el overlay este montado en la pestana activa
// y se cierra solo. Todo el control vive en el overlay flotante de IG.

function isProfilePath(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean);
  if (parts.length === 0) return false;
  const blocked = new Set([
    "explore", "accounts", "reels", "direct", "stories",
    "challenge", "about", "developers", "legal", "api", "p", "tv",
  ]);
  if (blocked.has(parts[0])) return false;
  return /^[a-zA-Z0-9._]+$/.test(parts[0]);
}

function isInstagramHostname(hostname) {
  const core = globalThis.FollowTrackerCore;
  if (core && typeof core.isInstagramHostname === "function") return core.isInstagramHostname(hostname);
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return host === "instagram.com" || host === "www.instagram.com";
}

function send(type, tabId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, tabId }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) { resolve({ ok: false, error: err.message }); return; }
      resolve(response || { ok: false, error: "No response." });
    });
  });
}

function showError(message) {
  const loading = document.querySelector(".loading");
  loading.textContent = message;
  let button = document.querySelector("#ft-popup-retry");
  if (!button) {
    button = document.createElement("button");
    button.id = "ft-popup-retry";
    button.textContent = "Reintentar";
    button.type = "button";
    loading.insertAdjacentElement("afterend", button);
  }
  button.disabled = false;
  button.onclick = attemptOpen;
}

async function openOverlay() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.id) {
    throw new Error("No hay pestana activa.");
  }
  let url;
  try { url = new URL(tab.url); } catch (_e) {
    throw new Error("URL no valida.");
  }
  if (!isInstagramHostname(url.hostname)) {
    throw new Error("Abre instagram.com en la pestana activa.");
  }
  if (!isProfilePath(url.pathname)) {
    throw new Error("Abri un perfil tipo instagram.com/usuario/.");
  }
  // Inyecta content.js si hace falta y luego pide mostrar el overlay.
  const ensure = await send("ENSURE_OVERLAY", tab.id);
  if (!ensure || !ensure.ok) throw new Error((ensure && ensure.error) || "No se pudo cargar el panel.");
  const shown = await send("SHOW_OVERLAY_TAB", tab.id);
  if (!shown || !shown.ok) throw new Error((shown && shown.error) || "No se pudo mostrar el panel.");
}

async function attemptOpen() {
  const retry = document.querySelector("#ft-popup-retry");
  if (retry) retry.disabled = true;
  document.querySelector(".loading").textContent = "Abriendo panel en Instagram...";
  try {
    await openOverlay();
    window.close();
  } catch (error) {
    showError(`Error: ${error.message || error}`);
  }
}

attemptOpen();
