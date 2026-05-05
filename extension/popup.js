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

function send(type, tabId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, tabId }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) { resolve({ ok: false, error: err.message }); return; }
      resolve(response || { ok: false, error: "No response." });
    });
  });
}

(async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.id) {
    document.querySelector(".loading").textContent = "No hay pestana activa.";
    setTimeout(() => window.close(), 1200);
    return;
  }
  let url;
  try { url = new URL(tab.url); } catch (_e) {
    document.querySelector(".loading").textContent = "URL no valida.";
    setTimeout(() => window.close(), 1200);
    return;
  }
  if (!url.hostname.includes("instagram.com")) {
    document.querySelector(".loading").textContent = "Abre instagram.com en la pestana activa.";
    setTimeout(() => window.close(), 1500);
    return;
  }
  if (!isProfilePath(url.pathname)) {
    document.querySelector(".loading").textContent = "Abri un perfil tipo instagram.com/usuario/.";
    setTimeout(() => window.close(), 1800);
    return;
  }
  // Inyecta content.js si hace falta y luego pide mostrar el overlay.
  const ensure = await send("ENSURE_OVERLAY", tab.id);
  if (ensure && ensure.ok) {
    await send("SHOW_OVERLAY_TAB", tab.id);
  }
  setTimeout(() => window.close(), 200);
})();
