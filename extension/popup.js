const startBtn = document.getElementById("startBtn");
const cancelBtn = document.getElementById("cancelBtn");
const tabStatusEl = document.getElementById("tabStatus");

let activeTabId = null;

function setTabStatus(text, kind) {
  tabStatusEl.textContent = text;
  tabStatusEl.className = `tabStatus ${kind || "ok"}`;
}

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

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function refreshTabStatus() {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    setTabStatus("No hay pestana activa.", "warn");
    startBtn.disabled = true;
    activeTabId = null;
    return;
  }
  activeTabId = tab.id;
  let url;
  try { url = new URL(tab.url); } catch (_e) {
    setTabStatus("URL no valida.", "warn");
    startBtn.disabled = true;
    return;
  }
  if (!url.hostname.includes("instagram.com")) {
    setTabStatus("Abre Instagram en la pestana activa.", "warn");
    startBtn.disabled = true;
    return;
  }
  if (!isProfilePath(url.pathname)) {
    setTabStatus(`Estas en ${url.pathname}. Abre un perfil tipo instagram.com/usuario/.`, "warn");
    startBtn.disabled = true;
    return;
  }
  const profile = url.pathname.split("/").filter(Boolean)[0];
  setTabStatus(`Perfil objetivo: @${profile}`, "ok");
  startBtn.disabled = false;
  cancelBtn.disabled = false;
}

function requestThroughBackground(type, tabId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, tabId }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) { resolve({ ok: false, error: err.message }); return; }
      resolve(response || { ok: false, error: "No response." });
    });
  });
}

startBtn.addEventListener("click", async () => {
  if (!activeTabId) return;
  startBtn.disabled = true;
  startBtn.textContent = "Lanzando...";
  const response = await requestThroughBackground("START_FROM_POPUP", activeTabId);
  if (!response || !response.ok) {
    setTabStatus(`Error: ${(response && response.error) || "No se pudo iniciar."}`, "warn");
    startBtn.disabled = false;
    startBtn.textContent = "Iniciar (atajo)";
    return;
  }
  // Cierra el popup; el control sigue en el overlay de la pagina IG.
  window.close();
});

cancelBtn.addEventListener("click", async () => {
  if (!activeTabId) return;
  await requestThroughBackground("CANCEL_FROM_POPUP", activeTabId);
  window.close();
});

refreshTabStatus();
chrome.tabs.onActivated.addListener(refreshTabStatus);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === "complete") refreshTabStatus();
});
