"use strict";
(function () {
  const Trust = globalThis.FollowTrackerTrust;
  const CaptureStore = globalThis.FollowTrackerCaptureStore;
  const Backup = globalThis.FollowTrackerBackup;
  const AdminCore = globalThis.FollowTrackerAdminCore;
  const Runtime = globalThis.FollowTrackerDashboardRuntime;
  const Storage = globalThis.FollowTrackerStorage;
  if (!Trust || !CaptureStore || !AdminCore || !Runtime || !Storage) throw new Error("Follow Tracker Admin no pudo cargar sus dependencias.");

  let adminProfile = state.profile || "";
  let exportParts = [];
  let adminStorage = {};
  const storageGet = Storage.get;
  const storageSet = Storage.set;
  const storageRemove = Storage.remove;
  const {
    formatBytes,
    profileBytes,
    profilesFromStorage,
    rebuildCombinedTimeline,
    replaceUsername,
    snapshotsForTimeline,
  } = AdminCore;

  function setAdminStatus(message, tone = "") {
    const target = document.querySelector("#admin-status");
    if (!target) return;
    target.className = `admin-status ${tone}`.trim();
    target.textContent = message || "";
  }
  function injectCss() {
    if (document.querySelector('link[href="dashboard-trust.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "dashboard-trust.css";
    document.head.append(link);
  }
  function ensureView() {
    const nav = document.querySelector(".main-nav");
    if (nav && !nav.querySelector('[data-view="admin"]')) {
      nav.insertAdjacentHTML("beforeend", '<button class="nav-item" data-view="admin" type="button" role="tab" aria-selected="false"><span aria-hidden="true">⚙</span> Administrar</button>');
      nav.querySelector('[data-view="admin"]').addEventListener("click", () => {
        activateView("admin");
        renderAdmin().catch((error) => setAdminStatus(error.message, "error"));
      });
    }
    const content = document.querySelector("#dashboard-content");
    if (!content || document.querySelector("#admin")) return;
    content.insertAdjacentHTML("beforeend", `
      <section id="admin" class="view-panel" data-view-panel="admin" role="tabpanel" hidden>
        <div class="section-hero"><div><p class="eyebrow">DATOS LOCALES</p><h1>Administrar</h1><p>Importá datos oficiales, organizá perfiles, corregí reportes y configurá cómo se confirman las bajas.</p></div></div>
        <div class="admin-layout">
          <article class="panel admin-section">
            <div class="admin-heading"><div><p class="panel-kicker">IMPORTACIÓN OFICIAL</p><h2>Crear un reporte desde los archivos de Instagram</h2><p>Seleccioná <code>followers_1.json</code> y <code>following.json</code> de la descarga oficial.</p></div></div>
            <div class="admin-grid">
              <label class="admin-field"><span>Perfil</span><input id="official-import-profile" type="text" placeholder="usuario"></label>
              <label class="admin-field"><span>Fecha de la captura</span><input id="official-import-date" type="date"></label>
              <label class="admin-field"><span>Archivos JSON</span><input id="official-import-files" type="file" accept="application/json,.json" multiple></label>
              <div class="admin-field"><span>Estado</span><div id="official-import-state">Esperando archivos.</div></div>
            </div>
            <div id="official-import-preview" class="admin-preview" hidden></div>
            <div class="admin-actions"><button id="official-import-save" class="button button-primary" type="button" disabled>Guardar como reporte</button></div>
          </article>

          <article class="panel admin-section">
            <div class="admin-heading"><div><p class="panel-kicker">PERFILES</p><h2>Espacio de trabajo</h2><p>Etiquetá, archivá, exportá, fusioná o eliminá historiales completos.</p></div><button id="export-all-profiles" class="button button-secondary" type="button">Exportar todos</button></div>
            <div id="profile-manager-list" class="profile-manager-list"></div>
            <div class="merge-panel">
              <label class="admin-field"><span>Perfil de origen</span><select id="merge-profile-source"></select></label>
              <span>→</span>
              <label class="admin-field"><span>Perfil de destino</span><select id="merge-profile-target"></select></label>
              <button id="merge-profiles" class="button button-secondary" type="button">Fusionar perfiles</button>
            </div>
          </article>

          <article class="panel admin-section">
            <div class="admin-heading"><div><p class="panel-kicker">REPORTES</p><h2>Historial del perfil</h2><p>Podés etiquetar cualquier captura o eliminarla reconstruyendo correctamente los reportes posteriores.</p></div></div>
            <div class="report-manager-toolbar"><label class="admin-field"><span>Perfil</span><select id="report-manager-profile"></select></label></div>
            <div id="report-manager-content"></div>
          </article>

          <article class="panel admin-section">
            <div class="admin-heading"><div><p class="panel-kicker">IDENTIDADES</p><h2>Unir cuentas que cambiaron de username</h2><p>Usalo cuando la misma persona aparece como una baja y un alta con nombres distintos.</p></div></div>
            <div class="merge-panel">
              <label class="admin-field"><span>Username anterior</span><input id="identity-source" type="text" placeholder="nombre_viejo"></label>
              <span>→</span>
              <label class="admin-field"><span>Username actual</span><input id="identity-target" type="text" placeholder="nombre_nuevo"></label>
              <button id="merge-identities" class="button button-secondary" type="button">Unir identidad</button>
            </div>
          </article>

          <article class="panel admin-section">
            <div class="admin-heading"><div><p class="panel-kicker">CONFIABILIDAD</p><h2>Reglas de captura</h2><p>Las bajas se confirman en más de una captura para reducir falsos unfollows.</p></div></div>
            <div class="settings-grid">
              <label class="admin-field"><span>Cobertura confiable</span><input id="setting-trusted-coverage" type="number" min="50" max="100" step="1"></label>
              <label class="admin-field"><span>Cobertura mínima</span><input id="setting-hard-coverage" type="number" min="10" max="100" step="1"></label>
              <label class="admin-field"><span>Caída máxima normal</span><input id="setting-drop-ratio" type="number" min="1" max="100" step="1"></label>
              <label class="admin-field"><span>Capturas para confirmar baja</span><input id="setting-confirm-removals" type="number" min="1" max="5" step="1"></label>
              <label class="settings-check"><input id="setting-auto-accept" type="checkbox"> Guardar automáticamente capturas confiables</label>
            </div>
            <div class="admin-actions"><button id="save-trust-settings" class="button button-primary" type="button">Guardar configuración</button></div>
          </article>

          <article class="panel admin-section admin-danger-section">
            <div class="admin-heading"><div><p class="panel-kicker">SEGURIDAD</p><h2>Acciones sensibles</h2><p>Las eliminaciones se mantienen separadas del trabajo diario y siempre requieren confirmación.</p></div></div>
            <div id="admin-sensitive-action"></div>
            <div class="security-report-block"><h3>Eliminar un reporte del perfil seleccionado</h3><p>La línea temporal se reconstruirá automáticamente.</p><div id="security-report-list" class="security-report-list"></div></div>
          </article>
          <div id="admin-status" class="admin-status" role="status" aria-live="polite"></div>
        </div>
      </section>`);
    const danger = document.querySelector("#overview > .danger-zone");
    const sensitiveTarget = document.querySelector("#admin-sensitive-action");
    if (danger && sensitiveTarget) sensitiveTarget.append(danger);
  }
  Runtime.registerView("admin");
  function optionList(profiles, selected) {
    return profiles.map((profile) => `<option value="${escapeHtml(profile)}"${profile === selected ? " selected" : ""}>@${escapeHtml(profile)}</option>`).join("");
  }
  function renderProfiles(profiles) {
    const target = document.querySelector("#profile-manager-list");
    if (!target) return;
    target.innerHTML = profiles.length
      ? profiles.map((profile) => {
          const keys = Trust.storageKeys(profile);
          const snapshot = adminStorage[keys.history];
          const timeline = adminStorage[keys.timeline];
          const profileMeta = adminStorage[keys.profileMeta] || {};
          const reports = timeline && Array.isArray(timeline.reports) ? timeline.reports.length : 0;
          return `<article class="profile-manager-card${profileMeta.archived ? " archived" : ""}" data-profile="${escapeHtml(profile)}">
            <div class="profile-manager-main"><strong>@${escapeHtml(profile)}</strong><label class="admin-field"><span>Etiqueta local</span><input data-profile-label type="text" value="${escapeHtml(profileMeta.label || "")}" placeholder="Ej. personal"></label></div>
            <div class="profile-stat"><span>Reportes</span><strong>${formatNumber(reports)}</strong></div>
            <div class="profile-stat"><span>Personas actuales</span><strong>${formatNumber(new Set([...(snapshot && snapshot.followers || []), ...(snapshot && snapshot.following || [])]).size)}</strong></div>
            <div class="profile-stat"><span>Espacio</span><strong>${formatBytes(profileBytes(profile, adminStorage))}</strong></div>
            <div class="profile-manager-actions"><button class="mini-button" data-profile-action="open">Abrir</button><button class="mini-button" data-profile-action="save-label">Guardar etiqueta</button><button class="mini-button" data-profile-action="archive">${profileMeta.archived ? "Desarchivar" : "Archivar"}</button><button class="mini-button" data-profile-action="export">Exportar</button></div>
          </article>`;
        }).join("")
      : '<div class="compare-empty">No hay perfiles guardados.</div>';
    document.querySelector("#merge-profile-source").innerHTML = optionList(profiles, profiles[0]);
    document.querySelector("#merge-profile-target").innerHTML = optionList(profiles, profiles[1] || profiles[0]);
    document.querySelector("#report-manager-profile").innerHTML = optionList(profiles, adminProfile || profiles[0]);
  }
  function reportMetadata(profile) {
    const keys = Trust.storageKeys(profile);
    return adminStorage[keys.captureMeta] || { schemaVersion: 1, profile, reports: {} };
  }
  function renderReports(profile) {
    const target = document.querySelector("#report-manager-content");
    if (!target) return;
    const keys = Trust.storageKeys(profile);
    const timeline = adminStorage[keys.timeline];
    const reports = timeline && Array.isArray(timeline.reports) ? [...timeline.reports].reverse() : [];
    const metadata = reportMetadata(profile);
    if (!reports.length) {
      target.innerHTML = '<div class="compare-empty">Este perfil todavía no tiene reportes.</div>';
      renderSecurityReports(profile, []);
      return;
    }
    target.innerHTML = `<div class="report-manager-table-shell"><table class="report-manager-table"><thead><tr><th>Fecha</th><th>ID</th><th>Fuente</th><th>Calidad</th><th>Etiqueta</th><th>Nota</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${reports.map((report) => {
      const meta = metadata.reports && metadata.reports[report.id] || {};
      const status = meta.status || "legacy";
      return `<tr data-report-id="${escapeHtml(report.id)}"><td>${escapeHtml(formatDate(report.capturedAt))}</td><td><code>${escapeHtml(report.id)}</code></td><td><span class="report-source">${escapeHtml(meta.source || "heredado")}</span></td><td>${Number.isFinite(meta.score) ? `${formatNumber(meta.score)}/100` : "—"}</td><td><input data-report-label value="${escapeHtml(meta.label || "")}" placeholder="Etiqueta"></td><td><input data-report-note value="${escapeHtml(meta.note || "")}" placeholder="Nota breve"></td><td><select data-report-status><option value="trusted"${status === "trusted" ? " selected" : ""}>Confiable</option><option value="review"${status === "review" ? " selected" : ""}>Revisar</option><option value="suspicious"${status === "suspicious" ? " selected" : ""}>Sospechoso</option><option value="rejected"${status === "rejected" ? " selected" : ""}>Rechazado</option><option value="legacy"${status === "legacy" ? " selected" : ""}>Heredado</option></select></td><td><button class="mini-button" data-report-action="save">Guardar</button></td></tr>`;
    }).join("")}</tbody></table></div>`;
    renderSecurityReports(profile, reports);
  }
  function renderSecurityReports(profile, reports) {
    const target = document.querySelector("#security-report-list");
    if (!target) return;
    target.dataset.profile = profile || "";
    target.innerHTML = reports.length > 1
      ? reports.map((report) => `<article><span><strong>${escapeHtml(formatDate(report.capturedAt))}</strong><small>${escapeHtml(report.id)}</small></span><button class="mini-button danger" data-security-report-delete="${escapeHtml(report.id)}" type="button">Eliminar reporte</button></article>`).join("")
      : '<div class="compare-empty">Se necesitan al menos dos reportes para eliminar uno sin perder el historial.</div>';
  }
  function renderSettings() {
    const settings = Trust.normalizeSettings(adminStorage.ft_settings);
    document.querySelector("#setting-trusted-coverage").value = Math.round(settings.minTrustedCoverage * 100);
    document.querySelector("#setting-hard-coverage").value = Math.round(settings.minHardCoverage * 100);
    document.querySelector("#setting-drop-ratio").value = Math.round(settings.maxTrustedDropRatio * 100);
    document.querySelector("#setting-confirm-removals").value = settings.confirmRemovalsAfter;
    document.querySelector("#setting-auto-accept").checked = settings.autoAcceptTrusted;
  }
  async function renderAdmin() {
    ensureView();
    const admin = document.querySelector("#admin");
    admin?.classList.add("is-loading");
    admin?.querySelector(".admin-layout")?.setAttribute("aria-busy", "true");
    try {
      adminStorage = await storageGet(null);
      const profiles = profilesFromStorage(adminStorage);
      if (!adminProfile || !profiles.includes(adminProfile)) adminProfile = state.profile && profiles.includes(state.profile) ? state.profile : profiles[0] || "";
      document.querySelector("#official-import-profile").value = state.profile || adminProfile || "";
      if (!document.querySelector("#official-import-date").value) document.querySelector("#official-import-date").value = new Date().toISOString().slice(0, 10);
      renderProfiles(profiles);
      renderReports(adminProfile);
      renderSettings();
    } finally {
      admin?.classList.remove("is-loading");
      admin?.querySelector(".admin-layout")?.removeAttribute("aria-busy");
    }
  }
  async function readOfficialFiles(files) {
    const parts = [];
    const warnings = [];
    for (const file of [...files]) {
      try {
        const payload = JSON.parse(await file.text());
        parts.push(Trust.parseInstagramExportPart(file.name, payload));
      } catch (_error) {
        warnings.push(`${file.name}: JSON inválido.`);
      }
    }
    exportParts = parts;
    const merged = Trust.mergeInstagramExportParts(parts);
    merged.warnings.push(...warnings);
    const preview = document.querySelector("#official-import-preview");
    preview.hidden = false;
    preview.innerHTML = `<div class="admin-preview-stats"><article><span>Seguidores</span><strong>${formatNumber(merged.followers.length)}</strong></article><article><span>Seguidos</span><strong>${formatNumber(merged.following.length)}</strong></article></div>${merged.warnings.length ? `<div class="trust-observations">${merged.warnings.map((warning) => `<div class="trust-observation">${escapeHtml(warning)}</div>`).join("")}</div>` : ""}`;
    document.querySelector("#official-import-state").textContent = merged.complete ? "Archivos reconocidos." : "No se reconocieron listas.";
    document.querySelector("#official-import-save").disabled = !merged.complete;
  }

  async function saveOfficialImport() {
    const profile = Trust.safeProfile(document.querySelector("#official-import-profile").value);
    const dateText = document.querySelector("#official-import-date").value;
    const capturedAt = dateText ? new Date(`${dateText}T12:00:00`).toISOString() : new Date().toISOString();
    setAdminStatus("Preparando el reporte oficial…");
    const stage = await CaptureStore.importOfficialExport(profile, exportParts, { capturedAt });
    await CaptureStore.commitStage(stage, stage.review.status === "rejected" ? "save_suspicious" : "save");
    setAdminStatus(`Reporte oficial guardado para @${profile}.`);
    setTimeout(() => { location.href = `dashboard.html?profile=${encodeURIComponent(profile)}#overview`; }, 450);
  }

  async function updateProfileCard(card, action) {
    const profile = card.dataset.profile;
    const keys = Trust.storageKeys(profile);
    const meta = adminStorage[keys.profileMeta] || { schemaVersion: 1, profile };
    if (action === "open") {
      await loadProfile(profile);
      activateView("overview");
      return;
    }
    if (action === "export") {
      if (!Backup) throw new Error("El módulo de backup no está disponible.");
      await Backup.exportProfile(profile);
      return;
    }
    if (action === "save-label") {
      meta.label = card.querySelector("[data-profile-label]").value.trim();
      meta.updatedAt = new Date().toISOString();
      await storageSet({ [keys.profileMeta]: meta });
      setAdminStatus(`Etiqueta de @${profile} guardada.`);
      await renderAdmin();
      return;
    }
    if (action === "archive") {
      meta.archived = !meta.archived;
      meta.updatedAt = new Date().toISOString();
      await storageSet({ [keys.profileMeta]: meta });
      setAdminStatus(meta.archived ? `@${profile} archivado.` : `@${profile} desarchivado.`);
      await renderAdmin();
      return;
    }
    if (action === "delete") {
      if (!confirm(`¿Eliminar todo el historial local de @${profile}?`)) return;
      await storageRemove(Object.values(keys));
      setAdminStatus(`Historial de @${profile} eliminado.`);
      await renderAdmin();
    }
  }

  async function saveReportRow(row) {
    const profile = document.querySelector("#report-manager-profile").value;
    const reportId = row.dataset.reportId;
    const keys = Trust.storageKeys(profile);
    const metadata = reportMetadata(profile);
    const current = metadata.reports[reportId] || {};
    metadata.reports[reportId] = {
      ...current,
      label: row.querySelector("[data-report-label]").value.trim(),
      note: row.querySelector("[data-report-note]").value.trim(),
      status: row.querySelector("[data-report-status]").value,
      updatedAt: new Date().toISOString(),
    };
    metadata.updatedAt = new Date().toISOString();
    await storageSet({ [keys.captureMeta]: metadata });
    adminStorage[keys.captureMeta] = metadata;
    setAdminStatus(`Reporte ${reportId} actualizado.`);
  }

  async function deleteReportRow(row) {
    const profile = document.querySelector("#report-manager-profile").value;
    const reportId = row.dataset.reportId;
    const keys = Trust.storageKeys(profile);
    const timeline = adminStorage[keys.timeline];
    const rebuilt = Trust.rebuildTimelineWithoutReport(History, timeline, reportId);
    if (!rebuilt) throw new Error("No se puede eliminar ese reporte.");
    if (!confirm(`¿Eliminar el reporte ${reportId} y recalcular todos los posteriores?`)) return;
    const metadata = reportMetadata(profile);
    delete metadata.reports[reportId];
    metadata.updatedAt = new Date().toISOString();
    await storageSet({
      [keys.history]: rebuilt.snapshot,
      [keys.timeline]: rebuilt.timeline,
      [keys.captureMeta]: metadata,
    });
    await storageRemove([keys.recovery, keys.backupStatus]);
    setAdminStatus(`Reporte ${reportId} eliminado y línea temporal reconstruida.`);
    setTimeout(() => location.reload(), 450);
  }

  async function mergeProfiles() {
    const source = document.querySelector("#merge-profile-source").value;
    const target = document.querySelector("#merge-profile-target").value;
    if (!source || !target || source === target) throw new Error("Elegí dos perfiles distintos.");
    if (!confirm(`¿Fusionar @${source} dentro de @${target} y eliminar el origen?`)) return;
    const sourceKeys = Trust.storageKeys(source);
    const targetKeys = Trust.storageKeys(target);
    const entries = [
      ...snapshotsForTimeline(source, adminStorage[sourceKeys.timeline]),
      ...snapshotsForTimeline(target, adminStorage[targetKeys.timeline]),
    ];
    const rebuilt = rebuildCombinedTimeline(target, entries);
    if (!rebuilt.timeline || !rebuilt.snapshot) throw new Error("No se pudieron reconstruir los reportes.");
    const sourceMeta = adminStorage[sourceKeys.captureMeta] || { reports: {} };
    const targetMeta = adminStorage[targetKeys.captureMeta] || { reports: {} };
    const captureMeta = {
      schemaVersion: 1,
      profile: target,
      reports: { ...(sourceMeta.reports || {}), ...(targetMeta.reports || {}) },
      updatedAt: new Date().toISOString(),
    };
    const peopleMeta = AdminCore.mergePeopleMetadata(
      adminStorage[sourceKeys.peopleMeta],
      adminStorage[targetKeys.peopleMeta],
      target
    );
    let identities = Trust.normalizeIdentityRegistry(adminStorage[targetKeys.identities], target);
    const sourceRegistry = Trust.normalizeIdentityRegistry(adminStorage[sourceKeys.identities], source);
    const sourceRecords = Object.values(sourceRegistry.records).map((record) => ({
      instagramUserId: record.instagramUserId,
      username: record.currentUsername,
      fullName: record.fullName,
      aliases: record.previousUsernames,
    }));
    identities = Trust.updateIdentityRegistry(identities, sourceRecords, { profile: target, source: "profile_merge" }).registry;
    await storageSet({
      [targetKeys.history]: { ...rebuilt.snapshot, profile: target },
      [targetKeys.timeline]: History.normalizeTimeline(rebuilt.timeline, target),
      [targetKeys.captureMeta]: captureMeta,
      [targetKeys.peopleMeta]: peopleMeta,
      [targetKeys.identities]: identities,
    });
    await storageRemove(Object.values(sourceKeys));
    setAdminStatus(`@${source} se fusionó dentro de @${target}.`);
    setTimeout(() => { location.href = `dashboard.html?profile=${encodeURIComponent(target)}#admin`; }, 500);
  }

  async function mergeIdentities() {
    const profile = document.querySelector("#report-manager-profile").value || state.profile;
    const from = Trust.normalizeUsername(document.querySelector("#identity-source").value);
    const to = Trust.normalizeUsername(document.querySelector("#identity-target").value);
    if (!from || !to || from === to) throw new Error("Indicá dos usernames distintos.");
    if (!confirm(`¿Unir @${from} con @${to} en todo el historial?`)) return;
    const keys = Trust.storageKeys(profile);
    const timeline = History.normalizeTimeline(adminStorage[keys.timeline], profile);
    const entries = snapshotsForTimeline(profile, timeline).map(({ report, snapshot }) => ({
      report,
      snapshot: {
        ...snapshot,
        followers: replaceUsername(snapshot.followers, from, to),
        following: replaceUsername(snapshot.following, from, to),
      },
    }));
    const rebuilt = rebuildCombinedTimeline(profile, entries);
    const identity = Trust.normalizeIdentityRegistry(adminStorage[keys.identities], profile);
    const sourceKey = identity.aliases[from] || Object.keys(identity.records).find((key) => identity.records[key].canonicalUsername === from);
    const targetKey = identity.aliases[to] || Object.keys(identity.records).find((key) => identity.records[key].canonicalUsername === to) || `username:${to}`;
    const sourceRecord = sourceKey && identity.records[sourceKey];
    const targetRecord = identity.records[targetKey] || {
      key: targetKey,
      canonicalUsername: to,
      currentUsername: to,
      previousUsernames: [to],
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    targetRecord.previousUsernames = [...new Set([...(targetRecord.previousUsernames || []), ...(sourceRecord && sourceRecord.previousUsernames || []), from, to])];
    targetRecord.currentUsername = to;
    targetRecord.canonicalUsername = to;
    identity.records[targetKey] = targetRecord;
    targetRecord.previousUsernames.forEach((alias) => { identity.aliases[alias] = targetKey; });
    if (sourceKey && sourceKey !== targetKey) delete identity.records[sourceKey];
    const peopleMeta = adminStorage[keys.peopleMeta] || { schemaVersion: 1, profile, people: {} };
    peopleMeta.people = peopleMeta.people || {};
    peopleMeta.people[to] = {
      ...(peopleMeta.people[from] || {}),
      ...(peopleMeta.people[to] || {}),
      tags: [...new Set([...(peopleMeta.people[from] && peopleMeta.people[from].tags || []), ...(peopleMeta.people[to] && peopleMeta.people[to].tags || [])])],
      updatedAt: new Date().toISOString(),
    };
    delete peopleMeta.people[from];
    await storageSet({
      [keys.history]: rebuilt.snapshot,
      [keys.timeline]: rebuilt.timeline,
      [keys.identities]: identity,
      [keys.peopleMeta]: peopleMeta,
    });
    setAdminStatus(`@${from} y @${to} ahora comparten una sola identidad.`);
    setTimeout(() => location.reload(), 450);
  }

  async function saveSettings() {
    const settings = Trust.normalizeSettings({
      minTrustedCoverage: Number(document.querySelector("#setting-trusted-coverage").value) / 100,
      minHardCoverage: Number(document.querySelector("#setting-hard-coverage").value) / 100,
      maxTrustedDropRatio: Number(document.querySelector("#setting-drop-ratio").value) / 100,
      confirmRemovalsAfter: Number(document.querySelector("#setting-confirm-removals").value),
      autoAcceptTrusted: document.querySelector("#setting-auto-accept").checked,
    });
    await storageSet({ ft_settings: settings });
    adminStorage.ft_settings = settings;
    setAdminStatus("Configuración de confianza guardada.");
  }

  injectCss();
  ensureView();

  document.addEventListener("change", (event) => {
    if (event.target.id === "official-import-files") {
      readOfficialFiles(event.target.files).catch((error) => setAdminStatus(error.message, "error"));
    } else if (event.target.id === "report-manager-profile") {
      adminProfile = event.target.value;
      renderReports(adminProfile);
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("#official-import-save")) saveOfficialImport().catch((error) => setAdminStatus(error.message, "error"));
    if (event.target.closest("#export-all-profiles")) {
      if (!Backup) setAdminStatus("El módulo de backup no está disponible.", "error");
      else Backup.exportAllProfiles().catch((error) => setAdminStatus(error.message, "error"));
    }
    const profileAction = event.target.closest("[data-profile-action]");
    if (profileAction) updateProfileCard(profileAction.closest("[data-profile]"), profileAction.dataset.profileAction).catch((error) => setAdminStatus(error.message, "error"));
    const reportAction = event.target.closest("[data-report-action]");
    if (reportAction) {
      const row = reportAction.closest("[data-report-id]");
      const action = reportAction.dataset.reportAction;
      (action === "save" ? saveReportRow(row) : deleteReportRow(row)).catch((error) => setAdminStatus(error.message, "error"));
    }
    const securityDelete = event.target.closest("[data-security-report-delete]");
    if (securityDelete) {
      const row = document.querySelector(`[data-report-id="${CSS.escape(securityDelete.dataset.securityReportDelete)}"]`);
      if (row) deleteReportRow(row).catch((error) => setAdminStatus(error.message, "error"));
    }
    if (event.target.closest("#merge-profiles")) mergeProfiles().catch((error) => setAdminStatus(error.message, "error"));
    if (event.target.closest("#merge-identities")) mergeIdentities().catch((error) => setAdminStatus(error.message, "error"));
    if (event.target.closest("#save-trust-settings")) saveSettings().catch((error) => setAdminStatus(error.message, "error"));
  });

  window.addEventListener("hashchange", () => {
    if (location.hash === "#admin") renderAdmin().catch((error) => setAdminStatus(error.message, "error"));
  });

  if (location.hash === "#admin") {
    activateView("admin", false);
    renderAdmin().catch((error) => setAdminStatus(error.message, "error"));
  }

  globalThis.FollowTrackerAdmin = {
    mergeIdentities,
    mergeProfiles,
    profilesFromStorage,
    readOfficialFiles,
    renderAdmin,
  };
})();
