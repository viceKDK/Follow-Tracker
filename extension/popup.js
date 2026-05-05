const startBtn = document.getElementById("startBtn");
const cancelBtn = document.getElementById("cancelBtn");
const logEl = document.getElementById("log");
const tabStatusEl = document.getElementById("tabStatus");

let activeTabId = null;

function addLog(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

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

function setBusy(isBusy) {
  startBtn.disabled = isBusy;
  cancelBtn.disabled = !isBusy;
  startBtn.textContent = isBusy ? "Ejecutando..." : "Iniciar analisis";
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.source !== "content") return;
  if (msg.type === "progress") addLog(msg.text);
  if (msg.type === "done") {
    addLog("Listo: archivos descargados.");
    setBusy(false);
    refreshTabStatus();
  }
  if (msg.type === "error") {
    addLog(`Error: ${msg.text}`);
    setBusy(false);
    refreshTabStatus();
  }
});

startBtn.addEventListener("click", async () => {
  try {
    setBusy(true);
    logEl.textContent = "";
    addLog("Iniciando...");
    if (!activeTabId) {
      addLog("No hay pestana de Instagram activa.");
      setBusy(false);
      return;
    }
    const response = await requestThroughBackground("START_FROM_POPUP", activeTabId);
    if (!response || !response.ok) {
      addLog(`Error: ${(response && response.error) || "No se pudo iniciar."}`);
      setBusy(false);
      return;
    }
    addLog("Scraper lanzado. Esperando progreso...");
  } catch (error) {
    addLog(`Error: ${error.message}`);
    setBusy(false);
  }
});

cancelBtn.addEventListener("click", async () => {
  if (!activeTabId) return;
  cancelBtn.disabled = true;
  addLog("Solicitando cancelacion...");
  const response = await requestThroughBackground("CANCEL_FROM_POPUP", activeTabId);
  if (!response || !response.ok) {
    addLog(`No se pudo cancelar: ${(response && response.error) || "error"}`);
  } else {
    addLog("Cancelacion enviada.");
  }
});

refreshTabStatus();
chrome.tabs.onActivated.addListener(refreshTabStatus);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === "complete") refreshTabStatus();
});
