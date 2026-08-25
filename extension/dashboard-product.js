"use strict";

(function () {
  const Product = globalThis.FollowTrackerProductCore;
  const Runtime = globalThis.FollowTrackerDashboardRuntime;
  if (!Product || !Runtime) throw new Error("Follow Tracker Product no pudo cargar sus dependencias.");

  const activity = {
    query: "",
    type: "all",
    reportId: "all",
    from: "",
    to: "",
    page: 1,
    pageSize: 100,
  };

  const activityCache = { timeline: null, signature: "", rows: [] };
  let activitySearchTimer = null;

  function injectCss() {
    if (document.querySelector('link[href="dashboard-product.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "dashboard-product.css";
    document.head.append(link);
  }

  function showToast(message, tone = "success") {
    let target = document.querySelector("#product-toast");
    if (!target) {
      target = document.createElement("div");
      target.id = "product-toast";
      target.className = "product-toast";
      target.setAttribute("role", "status");
      target.setAttribute("aria-live", "polite");
      document.body.append(target);
    }
    target.className = `product-toast ${tone} visible`;
    target.textContent = message;
    target.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      target.classList.remove("visible");
      setTimeout(() => { target.hidden = true; }, 180);
    }, 5200);
  }

  function ensureHealthPanel() {
    const overview = document.querySelector("#overview");
    const danger = overview && overview.querySelector(".danger-zone");
    if (!overview || !danger || document.querySelector("#data-health-panel")) return;
    danger.insertAdjacentHTML(
      "beforebegin",
      `<section id="data-health-panel" class="panel data-health-panel" aria-live="polite">
        <div class="panel-heading health-heading">
          <div><p class="panel-kicker">CONFIABILIDAD</p><h2>Salud del historial</h2></div>
          <span id="health-status" class="health-status">Revisando…</span>
        </div>
        <div id="health-metrics" class="health-metrics"></div>
        <div id="health-issues" class="health-issues"></div>
        <div class="health-actions"><button id="export-health" class="button button-secondary" type="button">Descargar diagnóstico</button><small>El diagnóstico contiene totales y problemas detectados, no contraseñas.</small></div>
      </section>`
    );
  }

  function renderHealth() {
    ensureHealthPanel();
    const target = document.querySelector("#data-health-panel");
    if (!target || !state.snapshot || !state.timeline) return;
    const health = Product.buildDataHealth(state.snapshot, state.timeline);
    target.dataset.status = health.status;
    const status = document.querySelector("#health-status");
    status.className = `health-status ${health.status}`;
    const healthLabel =
      health.status === "healthy"
        ? "Historial consistente"
        : health.status === "warning"
          ? "Requiere revisión"
          : "Hay datos incompletos";
    status.innerHTML = `<strong>${escapeHtml(`${health.score}/100`)}</strong><small>${escapeHtml(healthLabel)}</small>`;

    const metrics = [
      ["Puntaje", `${health.score}/100`],
      ["Reportes", formatNumber(health.metrics.reports)],
      ["Eventos", formatNumber(health.metrics.events)],
      ["Última captura", formatDate(health.metrics.lastCapturedAt, false)],
    ];
    document.querySelector("#health-metrics").innerHTML = metrics
      .map(([label, value]) => `<article class="health-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
      .join("");

    const issues = [...health.errors, ...health.warnings];
    document.querySelector("#health-issues").innerHTML = issues.length
      ? `${health.errors.slice(0, 4).map((issue) => `<div class="health-issue error">${escapeHtml(issue)}</div>`).join("")}${health.warnings.slice(0, Math.max(0, 8 - Math.min(4, health.errors.length))).map((issue) => `<div class="health-issue warning">${escapeHtml(issue)}</div>`).join("")}${issues.length > 8 ? `<small>Hay ${issues.length - 8} observación(es) adicional(es) en el diagnóstico descargable.</small>` : ""}`
      : `<div class="health-issue ok">No se detectaron perfiles mezclados, duplicados ni diferencias entre la captura actual y el último reporte.</div>`;
    target.dataset.health = JSON.stringify(health);
  }

  function activityReportOptions() {
    const reports = state.timeline && Array.isArray(state.timeline.reports)
      ? [...state.timeline.reports].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt))
      : [];
    return `<option value="all">Todos los reportes</option>${reports
      .map((report) => `<option value="${escapeHtml(report.id)}">${escapeHtml(formatDate(report.capturedAt, false))} · ${escapeHtml(report.id)}</option>`)
      .join("")}`;
  }

  function ensureActivityControls() {
    const panel = document.querySelector("#activity .activity-panel");
    const list = document.querySelector("#activity-list");
    if (!panel || !list || document.querySelector("#activity-controls")) return;
    list.insertAdjacentHTML(
      "beforebegin",
      `<div id="activity-controls" class="activity-controls">
        <label class="search-box activity-search"><span aria-hidden="true">⌕</span><input id="activity-search" type="search" placeholder="Buscar usuario o reporte…" autocomplete="off" /></label>
        <label><span>Evento</span><select id="activity-type"><option value="all">Todos</option><option value="followed_you">Te sigue ahora</option><option value="unfollowed_you">Te dejó de seguir</option><option value="you_followed">Lo seguís ahora</option><option value="you_unfollowed">Lo dejaste de seguir</option></select></label>
        <label><span>Reporte</span><select id="activity-report">${activityReportOptions()}</select></label>
        <label><span>Desde</span><input id="activity-from" type="date" /></label>
        <label><span>Hasta</span><input id="activity-to" type="date" /></label>
        <label><span>Filas</span><select id="activity-page-size"><option value="50">50</option><option value="100" selected>100</option><option value="250">250</option><option value="500">500</option></select></label>
        <button id="clear-activity" class="button button-secondary" type="button">Limpiar</button>
        <button id="export-activity-view" class="button button-secondary" type="button">Exportar vista CSV</button>
      </div>
      <div id="activity-filter-summary" class="activity-filter-summary"></div>`
    );
    list.insertAdjacentHTML(
      "afterend",
      `<div id="activity-pagination" class="table-pagination activity-pagination"><button id="activity-previous" class="button button-secondary" type="button">Anterior</button><span id="activity-page-label">Página 1 de 1</span><button id="activity-next" class="button button-secondary" type="button">Siguiente</button></div>`
    );
  }

  function filteredActivity() {
    const events = state.timeline && Array.isArray(state.timeline.events) ? state.timeline.events : [];
    const signature = JSON.stringify([activity.query, activity.type, activity.reportId, activity.from, activity.to]);
    if (activityCache.timeline === state.timeline && activityCache.signature === signature) {
      return activityCache.rows;
    }
    activityCache.timeline = state.timeline;
    activityCache.signature = signature;
    activityCache.rows = Product.filterEvents(events, activity);
    return activityCache.rows;
  }

  function invalidateActivityCache() {
    activityCache.timeline = null;
    activityCache.signature = "";
    activityCache.rows = [];
  }

  function renderActivityEnhanced() {
    ensureActivityControls();
    const target = document.querySelector("#activity-list");
    if (!target) return;

    const reportSelect = document.querySelector("#activity-report");
    if (reportSelect) {
      const current = activity.reportId;
      reportSelect.innerHTML = activityReportOptions();
      activity.reportId = [...reportSelect.options].some((option) => option.value === current) ? current : "all";
      reportSelect.value = activity.reportId;
    }

    const allEvents = state.timeline && Array.isArray(state.timeline.events) ? state.timeline.events : [];
    const rows = filteredActivity();
    const page = Product.paginate(rows, activity.page, activity.pageSize);
    activity.page = page.page;

    document.querySelector("#event-total").textContent =
      `${formatNumber(rows.length)} de ${formatNumber(allEvents.length)} evento${allEvents.length === 1 ? "" : "s"}`;
    const summary = document.querySelector("#activity-filter-summary");
    if (summary) {
      summary.innerHTML = rows.length
        ? `<strong>${formatNumber(page.start)}–${formatNumber(page.end)}</strong> de <strong>${formatNumber(page.total)}</strong> coincidencias`
        : "Sin coincidencias con los filtros actuales";
    }

    const previous = document.querySelector("#activity-previous");
    const next = document.querySelector("#activity-next");
    const label = document.querySelector("#activity-page-label");
    if (previous) previous.disabled = !page.hasPrevious;
    if (next) next.disabled = !page.hasNext;
    if (label) label.textContent = `Página ${page.page} de ${page.pages}`;
    const exportButton = document.querySelector("#export-activity-view");
    if (exportButton) exportButton.disabled = !rows.length;

    if (!rows.length) {
      target.innerHTML = allEvents.length
        ? '<div class="activity-empty">No hay eventos que coincidan con estos filtros.</div>'
        : '<div class="activity-empty">Todavía no hay cambios: ejecutá un segundo análisis completo para comparar.</div>';
      return;
    }

    target.innerHTML = `<div class="activity-table-shell"><table class="activity-table"><thead><tr><th>Usuario</th><th>Evento</th><th>Fecha detectada</th><th>Reporte</th><th>Perfil</th></tr></thead><tbody>${page.items
      .map((event) => {
        const meta = eventMeta[event.type] || { symbol: "·", tone: "neutral", title: "cambio detectado" };
        return `<tr><th data-label="Usuario"><span class="activity-symbol ${escapeHtml(meta.tone)}">${escapeHtml(meta.symbol)}</span><strong>@${escapeHtml(event.username)}</strong></th><td data-label="Evento">${escapeHtml(meta.title)}</td><td data-label="Fecha detectada">${escapeHtml(formatDate(event.occurredAt))}</td><td data-label="Reporte"><code>${escapeHtml(event.reportId || "sin id")}</code></td><td data-label="Perfil"><a class="profile-link" href="https://www.instagram.com/${encodeURIComponent(event.username)}/" target="_blank" rel="noreferrer">Abrir</a></td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  }

  function exportActivityView() {
    const rows = filteredActivity();
    if (!rows.length || !state.profile) return;
    const values = [
      ["Usuario", "Evento", "Fecha detectada", "Reporte", "Run ID"],
      ...rows.map((event) => [
        event.username,
        eventMeta[event.type]?.title || event.type,
        event.occurredAt,
        event.reportId,
        event.runId,
      ]),
    ];
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadText(
      `follow-tracker_actividad_filtrada_${state.profile}_${stamp}.csv`,
      `\uFEFF${values.map((row) => row.map(Product.csvCell).join(",")).join("\n")}`,
      "text/csv;charset=utf-8"
    );
  }

  function resetActivityFilters() {
    Object.assign(activity, {
      query: "",
      type: "all",
      reportId: "all",
      from: "",
      to: "",
      page: 1,
    });
    const values = {
      "activity-search": "",
      "activity-type": "all",
      "activity-report": "all",
      "activity-from": "",
      "activity-to": "",
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.querySelector(`#${id}`);
      if (element) element.value = value;
    });
    invalidateActivityCache();
    renderActivityEnhanced();
  }

  function exportHealth() {
    const panel = document.querySelector("#data-health-panel");
    if (!panel || !panel.dataset.health || !state.profile) return;
    const health = JSON.parse(panel.dataset.health);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadText(
      `follow-tracker_diagnostico_${state.profile}_${stamp}.json`,
      JSON.stringify(health, null, 2),
      "application/json;charset=utf-8"
    );
  }

  injectCss();
  ensureHealthPanel();
  ensureActivityControls();

  Runtime.registerRenderer("activity", renderActivityEnhanced, { id: "product.activity", priority: 100 });
  Runtime.on("render:after", renderHealth, { id: "product.health" });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target.closest("#clear-activity")) {
      resetActivityFilters();
      return;
    }
    if (target.closest("#export-activity-view")) {
      exportActivityView();
      return;
    }
    if (target.closest("#activity-previous")) {
      activity.page -= 1;
      renderActivityEnhanced();
      return;
    }
    if (target.closest("#activity-next")) {
      activity.page += 1;
      renderActivityEnhanced();
      return;
    }
    if (target.closest("#export-health")) exportHealth();
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "activity-type") activity.type = event.target.value;
    else if (event.target.id === "activity-report") activity.reportId = event.target.value;
    else if (event.target.id === "activity-from") activity.from = event.target.value;
    else if (event.target.id === "activity-to") activity.to = event.target.value;
    else if (event.target.id === "activity-page-size") activity.pageSize = Number(event.target.value) || 100;
    else if (event.target.id === "profile-select") {
      resetActivityFilters();
      return;
    } else return;
    activity.page = 1;
    invalidateActivityCache();
    renderActivityEnhanced();
  });

  document.addEventListener("input", (event) => {
    if (event.target.id !== "activity-search") return;
    activity.query = event.target.value;
    activity.page = 1;
    invalidateActivityCache();
    clearTimeout(activitySearchTimer);
    activitySearchTimer = setTimeout(renderActivityEnhanced, 120);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = String(event.target && event.target.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;
    const target = state.view === "activity"
      ? document.querySelector("#activity-search")
      : state.view === "people"
        ? document.querySelector("#people-search")
        : document.querySelector("#relationship-search");
    if (target) {
      event.preventDefault();
      target.focus();
    }
  });

  setTimeout(() => {
    ensureHealthPanel();
    ensureActivityControls();
    if (state.snapshot && state.timeline) {
      renderHealth();
      renderActivityEnhanced();
    }
  }, 0);
})();
