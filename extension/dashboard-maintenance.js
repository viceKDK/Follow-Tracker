"use strict";

(function () {
  const Maintenance = globalThis.FollowTrackerMaintenance;
  const Product = globalThis.FollowTrackerProductCore;
  if (!Maintenance) throw new Error("Follow Tracker Maintenance no fue cargado.");

  function injectCss() {
    if (document.querySelector('link[href="dashboard-maintenance.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "dashboard-maintenance.css";
    document.head.append(link);
  }

  function recoveryKey(profile) {
    return `ft_recovery_${Core.safeProfile(profile)}`;
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function ensurePanel() {
    const overview = document.querySelector("#overview");
    const danger = overview && overview.querySelector(".danger-zone");
    if (!overview || !danger || document.querySelector("#report-recovery-panel")) return;
    danger.insertAdjacentHTML(
      "beforebegin",
      `<section id="report-recovery-panel" class="panel report-recovery-panel">
        <div class="panel-heading recovery-heading">
          <div>
            <p class="panel-kicker">RECUPERACIÓN</p>
            <h2>Corregir el último análisis</h2>
            <p id="rollback-description">Revisando reportes disponibles…</p>
          </div>
          <span id="rollback-report-count" class="count-chip">0 reportes</span>
        </div>
        <div id="rollback-summary" class="rollback-summary"></div>
        <div id="recovery-point" class="recovery-point" hidden></div>
        <div class="recovery-actions">
          <button id="rollback-latest-report" class="button button-secondary" type="button">Deshacer último reporte</button>
          <button id="restore-rollback" class="button button-primary" type="button" hidden>Restaurar reporte deshecho</button>
          <button id="discard-rollback" class="button button-ghost" type="button" hidden>Descartar recuperación</button>
        </div>
        <p id="rollback-status" class="rollback-status" role="status" aria-live="polite"></p>
      </section>`
    );
  }

  function setStatus(message, tone = "neutral") {
    const target = document.querySelector("#rollback-status");
    if (!target) return;
    target.className = `rollback-status ${tone}`;
    target.textContent = message || "";
  }

  function latestReport(timeline) {
    return timeline && Array.isArray(timeline.reports) && timeline.reports.length
      ? timeline.reports[timeline.reports.length - 1]
      : null;
  }

  function renderPanel() {
    ensurePanel();
    const panel = document.querySelector("#report-recovery-panel");
    if (!panel || !state.profile || !state.timeline) return;

    const preview = Maintenance.rollbackPreview(state.timeline);
    const reports = Array.isArray(state.timeline.reports) ? state.timeline.reports : [];
    const count = document.querySelector("#rollback-report-count");
    count.textContent = `${formatNumber(reports.length)} reporte${reports.length === 1 ? "" : "s"}`;

    const rollbackButton = document.querySelector("#rollback-latest-report");
    const description = document.querySelector("#rollback-description");
    const summary = document.querySelector("#rollback-summary");

    if (!preview) {
      rollbackButton.disabled = true;
      description.textContent = "La línea base es el único reporte guardado y no puede deshacerse.";
      summary.innerHTML = '<div class="recovery-empty">Ejecutá otro análisis completo para habilitar la recuperación del reporte anterior.</div>';
    } else {
      rollbackButton.disabled = false;
      description.textContent = "Volvé exactamente al estado del reporte anterior sin borrar todo el perfil.";
      summary.innerHTML = `<article><span>Se quitará</span><strong>${escapeHtml(preview.current.id)}</strong><small>${escapeHtml(formatDate(preview.current.capturedAt))}</small></article><span class="rollback-arrow" aria-hidden="true">→</span><article><span>Quedará activo</span><strong>${escapeHtml(preview.target.id)}</strong><small>${escapeHtml(formatDate(preview.target.capturedAt))}</small></article>`;
    }

    const key = recoveryKey(state.profile);
    const recovery = state.storage && state.storage[key];
    const recoveryTarget = document.querySelector("#recovery-point");
    const restoreButton = document.querySelector("#restore-rollback");
    const discardButton = document.querySelector("#discard-rollback");

    if (!recovery) {
      recoveryTarget.hidden = true;
      restoreButton.hidden = true;
      discardButton.hidden = true;
      return;
    }

    const restorable = Maintenance.canRestoreRecovery(recovery, state.timeline);
    recoveryTarget.hidden = false;
    restoreButton.hidden = false;
    restoreButton.disabled = !restorable;
    discardButton.hidden = false;
    recoveryTarget.classList.toggle("stale", !restorable);
    recoveryTarget.innerHTML = restorable
      ? `<strong>Podés restaurar ${escapeHtml(recovery.fromReportId)}</strong><span>Se deshizo hacia ${escapeHtml(recovery.toReportId)} el ${escapeHtml(formatDate(recovery.createdAt))}.</span>`
      : `<strong>La recuperación anterior ya no coincide con el historial actual</strong><span>Se guardó ${escapeHtml(recovery.fromReportId || "un reporte")}, pero después se agregaron o cambiaron reportes. Podés descartarla.</span>`;
  }

  async function rollbackLatest() {
    if (!state.profile || !state.snapshot || !state.timeline) return;
    const preview = Maintenance.rollbackPreview(state.timeline);
    const result = Maintenance.rollbackLatest(state.timeline);
    if (!preview || !result) {
      setStatus("No hay un reporte anterior disponible.", "warning");
      return;
    }

    const accepted = confirm(
      `¿Deshacer el reporte ${preview.current.id} y volver a ${preview.target.id}?\n\nSe guardará un punto de recuperación para restaurarlo una vez.`
    );
    if (!accepted) return;

    const recovery = Maintenance.createRecoveryPoint(state.snapshot, state.timeline);
    if (!recovery) {
      setStatus("No se pudo crear el punto de recuperación.", "error");
      return;
    }

    const keys = profileKeys(state.profile);
    setStatus("Guardando el estado anterior…");
    try {
      await storageSet({
        [keys.history]: result.snapshot,
        [keys.timeline]: result.timeline,
        [recoveryKey(state.profile)]: recovery,
      });
      setStatus(`Reporte ${preview.current.id} deshecho.`, "success");
      setTimeout(() => location.reload(), 350);
    } catch (error) {
      setStatus(`No se pudo deshacer: ${error.message}`, "error");
    }
  }

  async function restoreRecovery() {
    if (!state.profile || !state.timeline) return;
    const key = recoveryKey(state.profile);
    const recovery = state.storage && state.storage[key];
    if (!Maintenance.canRestoreRecovery(recovery, state.timeline)) {
      setStatus("Ese punto de recuperación ya no puede aplicarse sobre el historial actual.", "warning");
      return;
    }

    const validation = Product && Product.validateBackupPayload
      ? Product.validateBackupPayload({ snapshot: recovery.snapshot, timeline: recovery.timeline })
      : { ok: true, errors: [] };
    if (!validation.ok) {
      setStatus(`La recuperación no es válida: ${validation.errors[0]}`, "error");
      return;
    }

    if (!confirm(`¿Restaurar el reporte ${recovery.fromReportId}?`)) return;
    const keys = profileKeys(state.profile);
    setStatus("Restaurando el reporte deshecho…");
    try {
      await storageSet({
        [keys.history]: History.normalizeSnapshot(recovery.snapshot),
        [keys.timeline]: History.normalizeTimeline(recovery.timeline, state.profile),
      });
      await storageRemove(key);
      setStatus(`Reporte ${recovery.fromReportId} restaurado.`, "success");
      setTimeout(() => location.reload(), 350);
    } catch (error) {
      setStatus(`No se pudo restaurar: ${error.message}`, "error");
    }
  }

  async function discardRecovery() {
    if (!state.profile) return;
    if (!confirm("¿Descartar el punto de recuperación guardado?")) return;
    const key = recoveryKey(state.profile);
    try {
      await storageRemove(key);
      if (state.storage) delete state.storage[key];
      setStatus("Punto de recuperación descartado.", "success");
      renderPanel();
    } catch (error) {
      setStatus(`No se pudo descartar: ${error.message}`, "error");
    }
  }

  injectCss();
  ensurePanel();

  const originalRenderAll = renderAll;
  renderAll = function maintenanceRenderAll() {
    originalRenderAll();
    renderPanel();
  };

  document.addEventListener("click", (event) => {
    if (event.target.closest("#rollback-latest-report")) rollbackLatest();
    else if (event.target.closest("#restore-rollback")) restoreRecovery();
    else if (event.target.closest("#discard-rollback")) discardRecovery();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !state.profile) return;
    const historyKey = profileKeys(state.profile).history;
    if (changes[historyKey] && !changes[historyKey].newValue) {
      chrome.storage.local.remove(recoveryKey(state.profile));
    }
  });

  setTimeout(renderPanel, 0);
})();
