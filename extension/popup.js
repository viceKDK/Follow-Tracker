const startBtn = document.getElementById("startBtn");
const logEl = document.getElementById("log");

function addLog(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

async function getActiveInstagramTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url) {
    throw new Error("No se encontro una pestana activa.");
  }
  if (!tab.url.includes("instagram.com")) {
    throw new Error("Abre Instagram antes de iniciar.");
  }
  return tab;
}

function requestStartThroughBackground(tabId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "START_FROM_POPUP", tabId }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      resolve(response || { ok: false, error: "No response." });
    });
  });
}

function setBusy(isBusy) {
  startBtn.disabled = isBusy;
  startBtn.textContent = isBusy ? "Ejecutando..." : "Iniciar analisis";
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.source !== "content") return;
  if (msg.type === "progress") addLog(msg.text);
  if (msg.type === "done") {
    addLog("Listo: archivos descargados.");
    setBusy(false);
  }
  if (msg.type === "error") {
    addLog(`Error: ${msg.text}`);
    setBusy(false);
  }
});

startBtn.addEventListener("click", async () => {
  try {
    setBusy(true);
    logEl.textContent = "";
    addLog("Iniciando...");
    const tab = await getActiveInstagramTab();
    const response = await requestStartThroughBackground(tab.id);

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
