"use strict";

(function () {
  const Guidance = globalThis.FollowTrackerProductGuidance;
  const Runtime = globalThis.FollowTrackerDashboardRuntime;
  const Storage = globalThis.FollowTrackerStorage;
  const Trust = globalThis.FollowTrackerTrust;
  if (!Guidance || !Runtime || !Storage || !Trust) {
    throw new Error("Follow Tracker Guidance no pudo cargar sus dependencias.");
  }

  function ensureCss() {
    if (document.querySelector('link[href="dashboard-guidance.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "dashboard-guidance.css";
    document.head.append(link);
  }

  function ensurePanel() {
    const overview = document.querySelector("#overview");
    const kpis = overview && overview.querySelector(".kpi-grid");
    if (!overview || !kpis || document.querySelector("#guidance-panel")) return;
    kpis.insertAdjacentHTML("beforebegin", `
      <section id="guidance-panel" class="guidance-panel" aria-labelledby="guidance-title" aria-live="polite">
        <div class="guidance-progress">
          <div><span id="guidance-progress-label">Preparando próximo paso…</span><strong id="guidance-progress-value">0/3</strong></div>
          <div class="guidance-progress-track" aria-hidden="true"><span id="guidance-progress-bar"></span></div>
        </div>
        <div class="guidance-head">
          <div><p class="panel-kicker">SIGUIENTE MEJOR ACCIÓN</p><h2 id="guidance-title">Qué conviene hacer ahora</h2><p id="guidance-summary"></p></div>
          <button id="guidance-primary" class="button button-primary" type="button"></button>
        </div>
        <details class="guidance-why"><summary>Por qué esta recomendación</summary><p id="guidance-reason"></p></details>
        <div id="guidance-secondary" class="guidance-secondary"></div>
      </section>`);
  }

  function latestCaptureMeta(keys) {
    const latest = state.timeline && History.latestReport(state.timeline);
    const metadata = state.storage && state.storage[keys.captureMeta];
    return latest && metadata && metadata.reports ? metadata.reports[latest.id] || null : null;
  }

  function pendingAbsenceCount(meta, absenceState) {
    const fromMeta = [
      ...(meta && meta.pendingAbsences && meta.pendingAbsences.followers || []),
      ...(meta && meta.pendingAbsences && meta.pendingAbsences.following || []),
    ].length;
    if (fromMeta) return fromMeta;
    return Object.keys(absenceState && absenceState.followers || {}).length
      + Object.keys(absenceState && absenceState.following || {}).length;
  }

  function latestChangesCount() {
    const latest = state.timeline && History.latestReport(state.timeline);
    const changes = latest && latest.changes || {};
    return ["newFollowers", "lostFollowers", "newFollowing", "lostFollowing"]
      .reduce((total, key) => total + (Array.isArray(changes[key]) ? changes[key].length : 0), 0);
  }

  function watchlistCount(peopleMeta) {
    return Object.values(peopleMeta && peopleMeta.people || {})
      .filter((person) => person && person.pinned === true).length;
  }

  function buildContext() {
    if (!state.profile || !state.snapshot || !state.timeline) {
      return { hasProfile: false, reportCount: 0 };
    }
    const keys = Trust.storageKeys(state.profile);
    const latestMeta = latestCaptureMeta(keys);
    const backup = Trust.backupReminder(
      state.storage && state.storage[keys.backupStatus],
      state.timeline,
      new Date(),
      state.storage && state.storage.ft_settings
    );
    const suspiciousFromTimeline = state.timeline.quality && Array.isArray(state.timeline.quality.suspiciousReports)
      ? state.timeline.quality.suspiciousReports.length
      : 0;
    const suspiciousFromMetadata = Object.values(state.storage && state.storage[keys.captureMeta] && state.storage[keys.captureMeta].reports || {})
      .filter((report) => ["review", "suspicious", "rejected"].includes(String(report && report.status))).length;
    return {
      hasProfile: true,
      reportCount: Array.isArray(state.timeline.reports) ? state.timeline.reports.length : 0,
      pendingCapture: Boolean(state.storage && state.storage[keys.pending]),
      pendingAbsenceCount: pendingAbsenceCount(latestMeta, state.storage && state.storage[keys.absences]),
      needsReview: Boolean(state.timeline.quality && state.timeline.quality.needsReview)
        || ["review", "suspicious", "rejected"].includes(String(latestMeta && latestMeta.status)),
      suspiciousReportCount: Math.max(suspiciousFromTimeline, suspiciousFromMetadata),
      latestChangesCount: latestChangesCount(),
      backupDue: backup.due,
      reportsSinceBackup: backup.reportsSince,
      watchlistCount: watchlistCount(state.storage && state.storage[keys.peopleMeta]),
    };
  }

  function actionButton(item, primary) {
    return `<button class="${primary ? "button button-primary" : "guidance-action"}" data-guidance-action="${escapeHtml(item.id)}" type="button"><strong>${escapeHtml(item.title)}</strong>${primary ? "" : `<small>${escapeHtml(item.description)}</small>`}</button>`;
  }

  function renderGuidance() {
    ensurePanel();
    const panel = document.querySelector("#guidance-panel");
    if (!panel) return;
    const model = Guidance.buildGuidance(buildContext());
    const stage = model.stage;
    document.querySelector("#guidance-progress-label").textContent = stage.label;
    document.querySelector("#guidance-progress-value").textContent = `${stage.current}/${stage.total}`;
    document.querySelector("#guidance-progress-bar").style.width = `${Math.round(stage.current / stage.total * 100)}%`;

    if (!model.primary) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    panel.dataset.tone = model.primary.tone;
    document.querySelector("#guidance-summary").textContent = model.primary.description;
    document.querySelector("#guidance-reason").textContent = model.primary.reason;
    const primary = document.querySelector("#guidance-primary");
    primary.dataset.guidanceAction = model.primary.id;
    primary.textContent = model.primary.title;
    document.querySelector("#guidance-secondary").innerHTML = model.secondary
      .map((item) => actionButton(item, false))
      .join("");
  }

  function openInstagram() {
    document.querySelector("#analyze-profile")?.click();
  }

  function applyAction(id) {
    switch (id) {
      case Guidance.ACTIONS.START_CAPTURE:
      case Guidance.ACTIONS.REVIEW_PENDING:
      case Guidance.ACTIONS.CAPTURE_AGAIN:
        openInstagram();
        break;
      case Guidance.ACTIONS.REVIEW_QUALITY:
        activateView("admin");
        setTimeout(() => document.querySelector("#report-manager-content")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
        break;
      case Guidance.ACTIONS.REVIEW_CHANGES:
      case Guidance.ACTIONS.COMPARE:
        activateView("relationships");
        break;
      case Guidance.ACTIONS.BACKUP:
        document.querySelector("#backup-now")?.click();
        break;
      case Guidance.ACTIONS.WATCHLIST:
        activateView("people");
        state.filter = "watchlist";
        document.querySelectorAll("#people-filters .filter").forEach((button) => {
          button.classList.toggle("active", button.dataset.filter === "watchlist");
        });
        renderPeople();
        break;
      case Guidance.ACTIONS.ACTIVITY:
        activateView("activity");
        break;
      default:
        break;
    }
  }

  ensureCss();
  ensurePanel();
  Runtime.on("render:after", renderGuidance, { id: "guidance.render", priority: -20 });
  Runtime.on("profile:loaded", renderGuidance, { id: "guidance.profile" });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-guidance-action]");
    if (button) applyAction(button.dataset.guidanceAction);
  });
  Storage.subscribe((changes) => {
    if (!state.profile) return;
    const keys = Trust.storageKeys(state.profile);
    const relevant = [keys.pending, keys.captureMeta, keys.absences, keys.backupStatus, keys.peopleMeta, keys.timeline, keys.history];
    if (relevant.some((key) => changes[key])) {
      Storage.getAll().then((items) => {
        state.storage = items;
        renderGuidance();
      }).catch(() => {});
    }
  });
  setTimeout(renderGuidance, 0);

  globalThis.FollowTrackerGuidanceUi = { buildContext, renderGuidance };
})();
