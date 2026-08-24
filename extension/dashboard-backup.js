"use strict";

(function () {
  const Trust = globalThis.FollowTrackerTrust;
  const Product = globalThis.FollowTrackerProductCore;
  if (!Trust || !Product) throw new Error("Follow Tracker Backup no pudo cargar sus dependencias.");

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items || {})));
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

  function toast(message, tone = "success") {
    let target = document.querySelector("#trust-backup-toast");
    if (!target) {
      target = document.createElement("div");
      target.id = "trust-backup-toast";
      target.className = "product-toast";
      target.setAttribute("role", "status");
      document.body.append(target);
    }
    target.className = `product-toast ${tone} visible`;
    target.textContent = message;
    target.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      target.classList.remove("visible");
      setTimeout(() => { target.hidden = true; }, 180);
    }, 4500);
  }

  function downloadJson(filename, value) {
    downloadText(filename, JSON.stringify(value, null, 2), "application/json;charset=utf-8");
  }

  async function profileBackup(profileValue) {
    const profile = Trust.safeProfile(profileValue);
    const keys = Trust.storageKeys(profile);
    const names = Object.values(keys);
    const stored = await storageGet([...names, "ft_settings"]);
    const snapshot = stored[keys.history] || null;
    const timeline = stored[keys.timeline] || null;
    if (!snapshot || !timeline) throw new Error(`No hay historial completo para @${profile}.`);
    return {
      format: "follow-tracker-backup",
      version: 3,
      exportedAt: new Date().toISOString(),
      profile,
      snapshot,
      timeline,
      sidecars: {
        captureMeta: stored[keys.captureMeta] || null,
        identities: stored[keys.identities] || null,
        absences: stored[keys.absences] || null,
        peopleMeta: stored[keys.peopleMeta] || null,
        profileMeta: stored[keys.profileMeta] || null,
        recovery: stored[keys.recovery] || null,
      },
      settings: stored.ft_settings || null,
    };
  }

  async function markBackup(profile, timeline) {
    const keys = Trust.storageKeys(profile);
    const reports = timeline && Array.isArray(timeline.reports) ? timeline.reports : [];
    const latest = reports.length ? reports[reports.length - 1] : null;
    await storageSet({
      [keys.backupStatus]: {
        schemaVersion: 1,
        profile: Trust.safeProfile(profile),
        backedUpAt: new Date().toISOString(),
        reportId: latest && latest.id || "",
        reportCount: reports.length,
      },
    });
  }

  async function exportProfile(profileValue) {
    const backup = await profileBackup(profileValue);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`follow-tracker_backup_${backup.profile}_${stamp}.json`, backup);
    await markBackup(backup.profile, backup.timeline);
    toast(`Backup completo de @${backup.profile} descargado.`);
    return backup;
  }

  async function exportAllProfiles() {
    const stored = await storageGet(null);
    const profiles = detectProfiles(stored);
    const backups = [];
    for (const profile of profiles) {
      try { backups.push(await profileBackup(profile)); } catch (_error) {}
    }
    if (!backups.length) throw new Error("No hay perfiles con historial para exportar.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`follow-tracker_todos_los_perfiles_${stamp}.json`, {
      format: "follow-tracker-workspace-backup",
      version: 3,
      exportedAt: new Date().toISOString(),
      profiles: backups,
      settings: stored.ft_settings || null,
    });
    for (const backup of backups) await markBackup(backup.profile, backup.timeline);
    toast(`${backups.length} perfil(es) exportados en un solo backup.`);
    return backups;
  }

  function ensureReminderPanel() {
    const overview = document.querySelector("#overview");
    const health = document.querySelector("#data-health-panel");
    const danger = overview && overview.querySelector(".danger-zone");
    if (!overview || document.querySelector("#backup-reminder-panel")) return;
    const anchor = health || danger;
    if (!anchor) return;
    anchor.insertAdjacentHTML("beforebegin", `
      <section id="backup-reminder-panel" class="backup-reminder-panel">
        <div class="backup-reminder-copy"><strong id="backup-reminder-title">Backup local</strong><p id="backup-reminder-copy">Revisando la última exportación…</p></div>
        <div class="backup-reminder-actions"><button id="backup-now" class="button button-secondary" type="button">Descargar backup</button><button id="backup-open-admin" class="button button-ghost" type="button">Administrar</button></div>
      </section>`);
  }

  function renderReminder() {
    ensureReminderPanel();
    const panel = document.querySelector("#backup-reminder-panel");
    if (!panel || !state.profile || !state.timeline) return;
    const status = state.storage && state.storage[Trust.storageKeys(state.profile).backupStatus];
    const settings = state.storage && state.storage.ft_settings;
    const reminder = Trust.backupReminder(status, state.timeline, new Date(), settings);
    panel.classList.toggle("due", reminder.due);
    document.querySelector("#backup-reminder-title").textContent = reminder.due
      ? "Conviene guardar un backup"
      : "Backup al día";
    document.querySelector("#backup-reminder-copy").textContent = !reminder.backedUpAt
      ? "Todavía no exportaste este historial. Un backup permite recuperarlo si reinstalás la extensión."
      : reminder.due
        ? `${reminder.reportsSince} reporte(s) nuevos y ${reminder.days} día(s) desde el último backup.`
        : `Último backup: ${formatDate(reminder.backedUpAt)}. No hay una acumulación importante pendiente.`;
  }

  function valuesForImport(profile, payload) {
    const keys = Trust.storageKeys(profile);
    const sidecars = payload.sidecars && typeof payload.sidecars === "object" ? payload.sidecars : {};
    const values = {
      [keys.history]: History.normalizeSnapshot(payload.snapshot),
      [keys.timeline]: History.normalizeTimeline(payload.timeline, profile),
    };
    if (sidecars.captureMeta) values[keys.captureMeta] = sidecars.captureMeta;
    if (sidecars.identities) values[keys.identities] = Trust.normalizeIdentityRegistry(sidecars.identities, profile);
    if (sidecars.absences) values[keys.absences] = Trust.normalizeAbsenceState(sidecars.absences, profile);
    if (sidecars.peopleMeta) values[keys.peopleMeta] = sidecars.peopleMeta;
    if (sidecars.profileMeta) values[keys.profileMeta] = sidecars.profileMeta;
    if (sidecars.recovery) values[keys.recovery] = sidecars.recovery;
    if (payload.settings) values.ft_settings = Trust.normalizeSettings(payload.settings);
    return values;
  }

  async function importOne(payload) {
    const validation = Product.validateBackupPayload(payload);
    if (!validation.ok) throw new Error(validation.errors[0] || "El backup no es válido.");
    const profile = Trust.safeProfile(validation.profile || payload.profile);
    const keys = Trust.storageKeys(profile);
    const existing = await storageGet([keys.history, keys.timeline]);
    if ((existing[keys.history] || existing[keys.timeline]) && !confirm(`Ya existe historial para @${profile}. ¿Reemplazarlo?`)) {
      return false;
    }
    await storageSet(valuesForImport(profile, payload));
    return profile;
  }

  async function importBackupPayload(payload) {
    if (payload && payload.format === "follow-tracker-workspace-backup" && Array.isArray(payload.profiles)) {
      const imported = [];
      for (const profileBackupValue of payload.profiles) {
        const result = await importOne(profileBackupValue);
        if (result) imported.push(result);
      }
      if (payload.settings) await storageSet({ ft_settings: Trust.normalizeSettings(payload.settings) });
      return imported;
    }
    const normalized = payload && payload.format === "follow-tracker-backup"
      ? payload
      : { snapshot: payload && payload.snapshot || payload, timeline: payload && payload.timeline || null, profile: payload && payload.profile };
    const profile = await importOne(normalized);
    return profile ? [profile] : [];
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) throw new Error("El archivo supera 100 MB.");
    let payload;
    try { payload = JSON.parse(await file.text()); }
    catch (_error) { throw new Error("El archivo no contiene JSON válido."); }
    const profiles = await importBackupPayload(payload);
    if (!profiles.length) return;
    toast(`${profiles.length} perfil(es) restaurados.`);
    setTimeout(() => {
      location.href = `dashboard.html?profile=${encodeURIComponent(profiles[0])}#overview`;
    }, 500);
  }

  const originalRenderAll = renderAll;
  renderAll = function backupRenderAll() {
    originalRenderAll();
    renderReminder();
  };

  document.addEventListener("click", (event) => {
    const exportButton = event.target.closest('[data-export="json"]');
    if (exportButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.profile) exportProfile(state.profile).catch((error) => toast(error.message, "error"));
      document.querySelector("#export-menu")?.setAttribute("hidden", "");
      return;
    }
    if (event.target.closest("#backup-now")) {
      exportProfile(state.profile).then(() => {
        if (state.storage) state.storage[Trust.storageKeys(state.profile).backupStatus] = {
          backedUpAt: new Date().toISOString(),
          reportId: History.latestReport(state.timeline)?.id || "",
        };
        renderReminder();
      }).catch((error) => toast(error.message, "error"));
      return;
    }
    if (event.target.closest("#backup-open-admin")) {
      activateView("admin");
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target.id !== "import-backup-input") return;
    event.stopImmediatePropagation();
    const file = event.target.files && event.target.files[0];
    importFile(file)
      .catch((error) => toast(error.message, "error"))
      .finally(() => { event.target.value = ""; });
  }, true);

  setTimeout(renderReminder, 0);

  globalThis.FollowTrackerBackup = {
    exportAllProfiles,
    exportProfile,
    importBackupPayload,
    importFile,
    profileBackup,
    renderReminder,
  };
})();
