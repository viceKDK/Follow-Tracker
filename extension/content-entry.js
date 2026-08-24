(function () {
  "use strict";

  if (globalThis.__followTrackerV3Loaded) return;
  globalThis.__followTrackerV3Loaded = true;

  const Api = globalThis.FollowTrackerInstagramApi;
  const Overlay = globalThis.FollowTrackerAnalysisOverlay;
  const Controller = globalThis.FollowTrackerAnalysisController;
  if (!Api || !Overlay || !Controller) throw new Error("Follow Tracker 3 no pudo iniciar.");

  let controller;
  const overlay = Overlay.create({
    onStart() {
      const profile = Api.profileFromLocation();
      controller.start(profile).catch(() => {});
    },
    onCancel() {
      controller.cancel();
    },
    onDashboard() {
      try {
        chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD", profile: Api.profileFromLocation() });
      } catch (_error) {}
    },
  });
  controller = Controller.create({ overlay });

  function showOverlay() {
    const profile = Api.profileFromLocation();
    if (!profile) return { ok: false, error: "Abrí un perfil de Instagram." };
    overlay.show(profile);
    const status = controller.status();
    overlay.setState(status.running ? "Analizando" : "Listo");
    overlay.setStatus(status.running ? "El análisis continúa en esta pestaña." : "Listo para analizar.");
    if (!status.running) {
      controller.resumePending(profile).catch((error) => {
        console.warn("[FollowTracker] no se pudo recuperar la captura pendiente", error);
      });
    }
    return { ok: true, error: null };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return undefined;
    if (message.type === "PING") {
      sendResponse({ ok: true, ...controller.status(), profile: Api.profileFromLocation() });
      return undefined;
    }
    if (message.type === "SHOW_OVERLAY") {
      sendResponse(showOverlay());
      return undefined;
    }
    if (message.type === "CANCEL_ANALYSIS") {
      const cancelled = controller.cancel();
      sendResponse({ ok: cancelled, error: cancelled ? null : "No hay un análisis en curso." });
      return undefined;
    }
    if (message.type === "START_ANALYSIS") {
      const profile = Api.profileFromLocation();
      controller.start(profile)
        .then((result) => sendResponse(result || { ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));
      return true;
    }
    return undefined;
  });

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    const profile = Api.profileFromLocation();
    const element = document.querySelector("#ft-v3-overlay");
    if (profile && element && element.style.display !== "none" && !controller.status().running) {
      overlay.show(profile);
      overlay.setState("Listo");
      overlay.setStatus("Perfil actualizado. Listo para analizar.");
    }
  }, 1200);
})();
