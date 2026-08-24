(function (root, factory) {
  const api = factory(
    root && root.FollowTrackerCore,
    root && root.FollowTrackerInstagramApi,
    root && root.FollowTrackerInstagramUi,
    root && root.FollowTrackerCaptureStore
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerAnalysisController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, InstagramApi, InstagramUi, CaptureStore) {
  "use strict";

  if (!Core || !InstagramApi || !InstagramUi || !CaptureStore) {
    throw new Error("Follow Tracker Analysis Controller no pudo cargar sus dependencias.");
  }

  function create(options) {
    const settings = options && typeof options === "object" ? options : {};
    const overlay = settings.overlay;
    let running = false;
    let profile = "";
    let abortController = null;
    let pendingStage = null;

    function sendBadge(text, color) {
      try {
        chrome.runtime.sendMessage({
          source: "content",
          type: "badge",
          text: String(text || "").slice(0, 4),
          color: color || "#2f6df6",
        });
      } catch (_error) {}
    }

    function currentProfile() {
      return InstagramApi.profileFromLocation();
    }

    function progress(info) {
      if (!info) return;
      overlay.setProgress(info.phase, info.count, info.expected);
      const label = info.phase === "followers" ? "Seguidores" : "Seguidos";
      overlay.setStatus(`Recolectando ${label.toLowerCase()}…`);
      if (info.count === 0 || info.count % 300 === 0) {
        overlay.log(`${label}: ${Number(info.count || 0).toLocaleString("es-UY")}${Number.isFinite(info.expected) ? ` de ${Number(info.expected).toLocaleString("es-UY")}` : ""}.`);
      }
      sendBadge(info.count > 999 ? `${Math.floor(info.count / 1000)}k` : String(info.count || ""));
    }

    function retry(info) {
      const label = info && info.phase === "following" ? "seguidos" : "seguidores";
      overlay.log(`Instagram pidió reintentar ${label}. Intento ${Number(info && info.attempt || 0) + 1}.`);
    }

    async function collect(targetProfile) {
      try {
        overlay.log("Conectando con Instagram mediante el modo API.");
        const result = await InstagramApi.collectProfile(targetProfile, {
          signal: abortController.signal,
          onProgress: progress,
          onRetry: retry,
          onProfile(info) {
            overlay.log(`Perfil detectado: ${info.followersCount ?? "?"} seguidores y ${info.followingCount ?? "?"} seguidos.`);
          },
        });
        overlay.log("La captura API terminó. Preparando la revisión.");
        return result;
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        overlay.log(`El modo API no terminó: ${error.message || error}.`);
        overlay.log("Cambiando al recorrido visual de las listas.");
        return InstagramUi.collectProfile(targetProfile, {
          signal: abortController.signal,
          onProgress: progress,
        });
      }
    }

    async function reviewAndCommit(stage) {
      pendingStage = stage;
      let decision = stage.settings && stage.settings.autoAcceptTrusted && stage.review.status === "trusted"
        ? "save"
        : await overlay.requestReview(stage);
      if (abortController && abortController.signal.aborted) decision = "discard";
      if (decision === "discard") {
        await CaptureStore.discardStage(stage);
        overlay.complete("Captura descartada. El historial anterior no cambió.", "warning");
        sendBadge("CXL", "#b7791f");
        return { ok: true, discarded: true };
      }
      overlay.setStatus("Guardando el reporte localmente…");
      const committed = await CaptureStore.commitStage(stage, decision);
      overlay.complete(
        decision === "save_suspicious"
          ? "Reporte guardado como sospechoso para que puedas revisarlo en el dashboard."
          : "Reporte guardado. Ya podés compararlo con capturas anteriores."
      );
      sendBadge("OK", "#15966d");
      try {
        chrome.runtime.sendMessage({
          source: "content",
          type: "capture-saved",
          profile: stage.profile,
          reportId: stage.runId,
          captureMeta: committed.captureMeta,
        });
      } catch (_error) {}
      return { ok: true, committed };
    }

    async function start(profileValue) {
      if (running) throw new Error("Ya hay un análisis en curso.");
      profile = Core.safeProfile(profileValue || currentProfile());
      if (!profile || profile === "perfil" || currentProfile() !== profile) {
        throw new Error("Abrí el perfil de Instagram que querés analizar.");
      }
      running = true;
      abortController = new AbortController();
      pendingStage = null;
      overlay.show(profile);
      overlay.resetCounts();
      overlay.setBusy(true);
      overlay.setState("Analizando");
      overlay.setStatus("Iniciando captura…");
      overlay.log(`Analizando @${profile}.`);
      sendBadge("RUN", "#2f6df6");

      try {
        const collected = await collect(profile);
        if (currentProfile() !== profile) throw new Error("El perfil cambió durante el análisis.");
        overlay.setStatus("Calculando cobertura, identidades y cambios…");
        const stage = await CaptureStore.stageCapture({
          ...collected,
          profile,
          runId: Core.makeRunId(),
          capturedAt: new Date().toISOString(),
        });
        overlay.log(`Calidad calculada: ${stage.review.score}/100 (${stage.review.status}).`);
        return await reviewAndCommit(stage);
      } catch (error) {
        if (error && error.name === "AbortError") {
          if (pendingStage) await CaptureStore.discardStage(pendingStage).catch(() => {});
          overlay.complete("Análisis cancelado. No se guardaron cambios.", "warning");
          sendBadge("CXL", "#b7791f");
          return { ok: true, cancelled: true };
        }
        overlay.fail(error.message || "No se pudo completar el análisis.");
        overlay.log(`Error: ${error.message || error}`);
        sendBadge("ERR", "#d4475b");
        throw error;
      } finally {
        running = false;
        abortController = null;
      }
    }

    async function resumePending(profileValue) {
      const targetProfile = Core.safeProfile(profileValue || currentProfile());
      const stage = await CaptureStore.loadPending(targetProfile);
      if (!stage) return { ok: false, pending: false };
      profile = targetProfile;
      abortController = new AbortController();
      overlay.show(profile);
      overlay.log("Se encontró una captura pendiente de decisión.");
      try {
        return await reviewAndCommit(stage);
      } finally {
        abortController = null;
        pendingStage = null;
      }
    }

    function cancel() {
      if (!running && !pendingStage) return false;
      if (abortController) abortController.abort();
      return true;
    }

    function status() {
      return { running, profile, pending: Boolean(pendingStage) };
    }

    return { cancel, currentProfile, resumePending, start, status };
  }

  return { create };
});
