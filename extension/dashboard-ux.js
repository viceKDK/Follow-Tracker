"use strict";

(function () {
  const Product = globalThis.FollowTrackerProductCore;
  const Runtime = globalThis.FollowTrackerDashboardRuntime;
  if (!Product || !Runtime) throw new Error("Follow Tracker UX no pudo cargar sus dependencias.");
  const ux = {
    relSort: ["priority", "asc"],
    relState: "all",
    relChange: "all",
    relDensity: "compact",
    relPage: 1,
    relPageSize: 250,
    peopleSort: ["lastEvent", "desc"],
    peopleDensity: "compact",
    peoplePage: 1,
    peoplePageSize: 250,
  };

  const stringValue = (value) => String(value == null ? "" : value);
  const compareValues = (a, b) =>
    typeof a === "number" && typeof b === "number"
      ? a - b
      : stringValue(a).localeCompare(stringValue(b), "es", {
          sensitivity: "base",
          numeric: true,
        });
  const resultTone = (value) =>
    ["positive", "negative", "info", "warning"].includes(value)
      ? value
      : "neutral";

  function pageOf(rows, page, pageSize) {
    if (Product) return Product.paginate(rows, page, pageSize);
    const size = Math.min(Math.max(Number(pageSize) || 250, 10), 500);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const current = Math.min(Math.max(Number(page) || 1, 1), pages);
    const offset = (current - 1) * size;
    const items = rows.slice(offset, offset + size);
    return {
      items,
      total: rows.length,
      page: current,
      pages,
      pageSize: size,
      start: rows.length ? offset + 1 : 0,
      end: rows.length ? offset + items.length : 0,
      hasPrevious: current > 1,
      hasNext: current < pages,
    };
  }

  function booleanBadge(value, past = false) {
    const title = value
      ? past
        ? "Sí, estaba en la lista"
        : "Sí, está en la lista"
      : past
        ? "No, no estaba en la lista"
        : "No, no está en la lista";
    return `<span class="list-boolean ${value ? "yes" : "no"}" title="${title}">${value ? "Sí" : "No"}</span>`;
  }

  function sortButton(label, key, config) {
    const active = config[0] === key;
    const arrow = active ? (config[1] === "asc" ? "↑" : "↓") : "↕";
    return `<button class="table-sort${active ? " active" : ""}" data-sort-key="${key}" type="button">${label} <span>${arrow}</span></button>`;
  }

  function toggleSort(config, key) {
    if (config[0] === key) {
      config[1] = config[1] === "asc" ? "desc" : "asc";
      return;
    }
    config[0] = key;
    config[1] = key === "lastEvent" ? "desc" : "asc";
  }

  function changeTypes(item) {
    const types = [];
    if (item.fromFollowsYou && !item.toFollowsYou) types.push("unfollowed-you");
    if (!item.fromFollowsYou && item.toFollowsYou) types.push("followed-you");
    if (item.fromYouFollow && !item.toYouFollow) types.push("you-unfollowed");
    if (!item.fromYouFollow && item.toYouFollow) types.push("you-followed");
    if (!types.length) types.push(item.changed ? "changed" : "unchanged");
    return types;
  }

  function relationshipValue(item, key) {
    return {
      username: item.normalized,
      fromFollowsYou: Number(item.fromFollowsYou),
      fromYouFollow: Number(item.fromYouFollow),
      toFollowsYou: Number(item.toFollowsYou),
      toYouFollow: Number(item.toYouFollow),
      headline: item.headline.toLowerCase(),
      priority: transitionPriority(item),
    }[key] ?? item.normalized;
  }

  function relationshipRows() {
    const query = state.relationshipQuery.trim().toLowerCase().replace(/^@/, "");
    const direction = ux.relSort[1] === "desc" ? -1 : 1;
    return state.relationshipTransitions
      .filter((item) => {
        if (!relationshipMatchesFilter(item) || (query && !item.normalized.includes(query))) return false;
        if (ux.relState !== "all" && item.toState !== ux.relState) return false;
        if (ux.relChange === "changed" && !item.changed) return false;
        if (!["all", "changed"].includes(ux.relChange) && !changeTypes(item).includes(ux.relChange)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          compareValues(relationshipValue(a, ux.relSort[0]), relationshipValue(b, ux.relSort[0])) * direction ||
          a.normalized.localeCompare(b.normalized)
      );
  }

  function peopleValue(person, key) {
    return {
      username: person.username.toLowerCase(),
      followsYou: Number(person.followsYou),
      youFollow: Number(person.youFollow),
      relationship: relationshipLabel(person).toLowerCase(),
      changes: person.events.length,
      lastEvent: person.lastEvent ? new Date(person.lastEvent.occurredAt).getTime() : 0,
    }[key] ?? person.username.toLowerCase();
  }

  function peopleRows() {
    const query = state.query.trim().toLowerCase().replace(/^@/, "");
    const direction = ux.peopleSort[1] === "desc" ? -1 : 1;
    return state.people
      .filter(
        (person) =>
          matchesFilter(person) &&
          (!query || person.username.toLowerCase().includes(query))
      )
      .sort(
        (a, b) =>
          compareValues(peopleValue(a, ux.peopleSort[0]), peopleValue(b, ux.peopleSort[0])) * direction ||
          a.username.localeCompare(b.username)
      );
  }

  function injectCss() {
    if (document.querySelector('link[href="dashboard-ux.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "dashboard-ux.css";
    document.head.append(link);
  }

  function paginator(scope, page) {
    return `<div class="table-pagination" data-pagination-scope="${scope}">
      <button class="button button-secondary" data-page-action="previous" data-page-scope="${scope}" type="button"${page.hasPrevious ? "" : " disabled"}>Anterior</button>
      <span>Página <strong>${page.page}</strong> de <strong>${page.pages}</strong></span>
      <button class="button button-secondary" data-page-action="next" data-page-scope="${scope}" type="button"${page.hasNext ? "" : " disabled"}>Siguiente</button>
    </div>`;
  }

  function ensureControls() {
    const tools = document.querySelector(".relationship-tools");
    if (tools && !document.querySelector("#relationship-advanced")) {
      tools.insertAdjacentHTML(
        "beforeend",
        `<div id="relationship-advanced" class="advanced-filter-bar">
          <label><span>Estado actual</span><select id="relationship-state-filter"><option value="all">Todos</option><option value="mutual">Se siguen</option><option value="follows_you">Te sigue; no lo seguís</option><option value="you_follow">Lo seguís; no te sigue</option><option value="none">No se siguen</option></select></label>
          <label><span>Cambio</span><select id="relationship-change-filter"><option value="all">Todos</option><option value="changed">Solo cambiaron</option><option value="followed-you">Te sigue ahora</option><option value="unfollowed-you">Te dejó de seguir</option><option value="you-followed">Lo seguís ahora</option><option value="you-unfollowed">Lo dejaste de seguir</option></select></label>
          <label><span>Filas por página</span><select id="relationship-page-size"><option value="100">100</option><option value="250" selected>250</option><option value="500">500</option></select></label>
          <label><span>Densidad</span><select id="relationship-density"><option value="compact">Compacta</option><option value="normal">Normal</option></select></label>
          <button id="clear-relationship-filters" class="button button-secondary" type="button">Limpiar filtros</button>
        </div>
        <div id="relationship-active-filters" class="active-filter-chips"></div>
        <div class="relationship-list-actions">
          <div><strong id="relationship-visible-count">0 filas</strong><small>Tocá una fila para ver el detalle.</small></div>
          <button id="export-comparison-list" class="button button-secondary" type="button">Descargar lista CSV</button>
        </div>`
      );
      const toolbar = document.querySelector(".comparison-toolbar");
      if (toolbar) {
        toolbar.insertAdjacentHTML(
          "afterend",
          `<div class="comparison-presets"><span>Comparación rápida</span><button data-preset="previous">Último vs anterior</button><button data-preset="week">Hace 7 días vs ahora</button><button data-preset="first">Primer reporte vs ahora</button></div>`
        );
      }
    }

    const peopleTools = document.querySelector("#people .people-tools");
    if (peopleTools && !document.querySelector("#people-table-options")) {
      peopleTools.insertAdjacentHTML(
        "afterend",
        `<div id="people-table-options" class="people-table-options">
          <label><span>Filas por página</span><select id="people-page-size"><option value="100">100</option><option value="250" selected>250</option><option value="500">500</option></select></label>
          <label><span>Densidad</span><select id="people-density"><option value="compact">Compacta</option><option value="normal">Normal</option></select></label>
          <button id="clear-people-filters" class="button button-secondary" type="button">Limpiar filtros</button>
        </div>
        <div id="people-active-filters" class="active-filter-chips"></div>`
      );
    }
  }

  function renderFilterChips() {
    const relationshipTarget = document.querySelector("#relationship-active-filters");
    if (relationshipTarget) {
      const filters = [];
      if (state.relationshipQuery.trim()) filters.push(`Búsqueda: ${state.relationshipQuery.trim()}`);
      if (state.relationshipFilter !== "all") {
        const button = document.querySelector(`[data-relationship-filter="${state.relationshipFilter}"]`);
        if (button) filters.push(`Filtro: ${button.childNodes[0].textContent.trim()}`);
      }
      if (ux.relState !== "all") {
        filters.push(`Estado: ${document.querySelector("#relationship-state-filter").selectedOptions[0].text}`);
      }
      if (ux.relChange !== "all") {
        filters.push(`Cambio: ${document.querySelector("#relationship-change-filter").selectedOptions[0].text}`);
      }
      relationshipTarget.innerHTML = filters.length
        ? filters.map((value) => `<span>${escapeHtml(value)}</span>`).join("")
        : '<span class="filter-chip-empty">Sin filtros adicionales</span>';
    }

    const peopleTarget = document.querySelector("#people-active-filters");
    if (peopleTarget) {
      const filters = [];
      if (state.query.trim()) filters.push(`Búsqueda: ${state.query.trim()}`);
      if (state.filter !== "all") {
        const button = document.querySelector(`#people-filters [data-filter="${state.filter}"]`);
        if (button) filters.push(`Filtro: ${button.textContent.trim()}`);
      }
      peopleTarget.innerHTML = filters.length
        ? filters.map((value) => `<span>${escapeHtml(value)}</span>`).join("")
        : '<span class="filter-chip-empty">Sin filtros adicionales</span>';
    }
  }

  function renderRelationshipTable() {
    ensureControls();
    renderFilterChips();
    document.querySelector("#relationships")?.classList.toggle("density-compact", ux.relDensity === "compact");
    const target = document.querySelector("#relationship-list");
    if (!target) return;

    const allRows = relationshipRows();
    const page = pageOf(allRows, ux.relPage, ux.relPageSize);
    ux.relPage = page.page;
    const count = document.querySelector("#relationship-visible-count");
    if (count) {
      count.textContent = page.total
        ? `${formatNumber(page.start)}–${formatNumber(page.end)} de ${formatNumber(page.total)} filas`
        : "0 filas";
    }
    const exportButton = document.querySelector("#export-comparison-list");
    if (exportButton) exportButton.disabled = !allRows.length;

    if (!allRows.length) {
      target.innerHTML = '<div class="relationship-empty">No hay personas que coincidan con los filtros.</div>';
      return;
    }

    target.innerHTML = `<div class="relationship-table-shell"><table class="relationship-table"><thead><tr>
      <th>${sortButton("Usuario", "username", ux.relSort)}</th>
      <th>${sortButton("Antes · te seguía", "fromFollowsYou", ux.relSort)}</th>
      <th>${sortButton("Antes · lo seguías", "fromYouFollow", ux.relSort)}</th>
      <th>${sortButton("Ahora · te sigue", "toFollowsYou", ux.relSort)}</th>
      <th>${sortButton("Ahora · lo seguís", "toYouFollow", ux.relSort)}</th>
      <th>${sortButton("Qué cambió", "headline", ux.relSort)}</th>
      <th>Perfil</th>
    </tr></thead><tbody>${page.items
      .map(
        (item) => `<tr class="table-tone-${resultTone(item.tone)} clickable-table-row" data-user="${escapeHtml(item.normalized)}" data-source="comparison" tabindex="0">
          <th class="table-user-cell" data-label="Usuario"><div class="table-user-content"><span class="relationship-avatar">${escapeHtml(item.normalized.slice(0, 2))}</span><span><strong>@${escapeHtml(item.username)}</strong><small>${escapeHtml(relationshipStateLabels.current[item.toState])}</small></span></div></th>
          <td data-label="Antes · te seguía">${booleanBadge(item.fromFollowsYou, true)}</td>
          <td data-label="Antes · lo seguías">${booleanBadge(item.fromYouFollow, true)}</td>
          <td data-label="Ahora · te sigue">${booleanBadge(item.toFollowsYou)}</td>
          <td data-label="Ahora · lo seguís">${booleanBadge(item.toYouFollow)}</td>
          <td data-label="Qué cambió"><span class="table-result result-${resultTone(item.tone)}">${escapeHtml(item.headline)}</span></td>
          <td data-label="Perfil"><a class="profile-link" href="https://www.instagram.com/${encodeURIComponent(item.normalized)}/" target="_blank" rel="noreferrer">Abrir</a></td>
        </tr>`
      )
      .join("")}</tbody></table></div>${paginator("relationships", page)}`;
  }

  function renderPeopleTable() {
    ensureControls();
    renderFilterChips();
    document.querySelector("#people")?.classList.toggle("density-compact", ux.peopleDensity === "compact");
    const target = document.querySelector("#people-list");
    if (!target) return;

    const allRows = peopleRows();
    const page = pageOf(allRows, ux.peoplePage, ux.peoplePageSize);
    ux.peoplePage = page.page;
    document.querySelector("#people-count").textContent = page.total
      ? `${formatNumber(page.start)}–${formatNumber(page.end)} de ${formatNumber(page.total)} personas`
      : "0 personas";

    if (!allRows.length) {
      target.innerHTML = '<div class="people-empty">No hay usuarios que coincidan con este filtro.</div>';
      return;
    }

    target.innerHTML = `<div class="current-table-shell"><table class="current-table"><thead><tr>
      <th>${sortButton("Usuario", "username", ux.peopleSort)}</th>
      <th>${sortButton("Te sigue", "followsYou", ux.peopleSort)}</th>
      <th>${sortButton("Lo seguís", "youFollow", ux.peopleSort)}</th>
      <th>${sortButton("Relación actual", "relationship", ux.peopleSort)}</th>
      <th>${sortButton("Cambios", "changes", ux.peopleSort)}</th>
      <th>${sortButton("Último cambio", "lastEvent", ux.peopleSort)}</th>
      <th>Perfil</th>
    </tr></thead><tbody>${page.items
      .map((person) => {
        const last = person.lastEvent;
        const meta = last ? eventMeta[last.type] || { title: "cambio detectado" } : null;
        return `<tr class="clickable-table-row" data-user="${escapeHtml(person.username)}" data-source="current" tabindex="0">
          <th class="table-user-cell" data-label="Usuario"><div class="table-user-content"><span class="relationship-avatar">${escapeHtml(person.username.slice(0, 2))}</span><span><strong>@${escapeHtml(person.username)}</strong><small>${person.events.length} cambio${person.events.length === 1 ? "" : "s"}</small></span></div></th>
          <td data-label="Te sigue">${booleanBadge(person.followsYou)}</td>
          <td data-label="Lo seguís">${booleanBadge(person.youFollow)}</td>
          <td data-label="Relación actual"><span class="relationship-badge ${escapeHtml(person.relationship)}">${escapeHtml(relationshipLabel(person))}</span></td>
          <td data-label="Cambios">${formatNumber(person.events.length)}</td>
          <td data-label="Último cambio"><span class="last-event">${last ? escapeHtml(meta.title) : "Sin cambios detectados"}${last ? `<small>${escapeHtml(formatDate(last.occurredAt))}</small>` : ""}</span></td>
          <td data-label="Perfil"><a class="profile-link" href="https://www.instagram.com/${encodeURIComponent(person.username)}/" target="_blank" rel="noreferrer">Abrir</a></td>
        </tr>`;
      })
      .join("")}</tbody></table></div>${paginator("people", page)}`;
  }

  function exportCell(value) {
    if (Product) return Product.csvCell(value);
    let text = stringValue(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportRelationshipRows() {
    const rows = relationshipRows();
    if (!rows.length || !state.profile) return;
    const data = [
      ["Usuario", "Antes: te seguía", "Antes: lo seguías", "Ahora: te sigue", "Ahora: lo seguís", "Estado anterior", "Estado actual", "Qué cambió"],
      ...rows.map((item) => [
        item.username,
        item.fromFollowsYou ? "Sí" : "No",
        item.fromYouFollow ? "Sí" : "No",
        item.toFollowsYou ? "Sí" : "No",
        item.toYouFollow ? "Sí" : "No",
        relationshipStateLabels.previous[item.fromState],
        relationshipStateLabels.current[item.toState],
        item.headline,
      ]),
    ];
    downloadText(
      `follow-tracker_lista_${state.profile}_${state.compareFrom}_a_${state.compareTo}.csv`,
      `\uFEFF${data.map((row) => row.map(exportCell).join(",")).join("\n")}`,
      "text/csv;charset=utf-8"
    );
  }

  function applyComparisonPreset(kind) {
    const reports = state.timeline
      ? [...state.timeline.reports].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
      : [];
    if (reports.length < 2) return;
    const last = reports.at(-1);
    let from = reports.at(-2);
    if (kind === "first") from = reports[0];
    if (kind === "week") {
      const target = new Date(last.capturedAt).getTime() - 7 * 24 * 60 * 60 * 1000;
      from = reports
        .slice(0, -1)
        .reduce(
          (best, report) =>
            Math.abs(new Date(report.capturedAt).getTime() - target) <
            Math.abs(new Date(best.capturedAt).getTime() - target)
              ? report
              : best,
          reports[0]
        );
    }
    ux.relPage = 1;
    state.compareFrom = from.id;
    state.compareTo = last.id;
    renderReportComparison();
  }

  function ensureDrawer() {
    if (document.querySelector("#rel-drawer-overlay")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="rel-drawer-overlay" class="relationship-drawer-overlay" hidden><aside class="relationship-detail-drawer" role="dialog" aria-modal="true"><button id="drawer-close" class="drawer-close" type="button" aria-label="Cerrar">×</button><p class="eyebrow">DETALLE DE RELACIÓN</p><h2 id="drawer-user"></h2><div id="drawer-status"></div><div id="drawer-history" class="drawer-history"></div><a id="drawer-link" class="button button-primary" target="_blank" rel="noreferrer">Ver perfil en Instagram</a></aside></div>`
    );
  }

  function closeDrawer() {
    const overlay = document.querySelector("#rel-drawer-overlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("drawer-open");
  }

  function openDrawer(user, source) {
    ensureDrawer();
    const normalized = stringValue(user).toLowerCase();
    const comparison = state.relationshipTransitions.find((item) => item.normalized === normalized);
    const person = state.people.find((item) => item.username.toLowerCase() === normalized);
    const overlay = document.querySelector("#rel-drawer-overlay");
    document.querySelector("#drawer-user").textContent = `@${comparison ? comparison.username : person ? person.username : normalized}`;
    document.querySelector("#drawer-link").href = `https://www.instagram.com/${encodeURIComponent(normalized)}/`;

    const status = document.querySelector("#drawer-status");
    if (comparison && source === "comparison") {
      status.innerHTML = `<div class="drawer-change result-${resultTone(comparison.tone)}">${escapeHtml(comparison.headline)}</div><div class="drawer-state-grid"><article><span>Antes</span><strong>${escapeHtml(relationshipStateLabels.previous[comparison.fromState])}</strong><small>Te seguía: ${comparison.fromFollowsYou ? "Sí" : "No"} · Lo seguías: ${comparison.fromYouFollow ? "Sí" : "No"}</small></article><article><span>Ahora</span><strong>${escapeHtml(relationshipStateLabels.current[comparison.toState])}</strong><small>Te sigue: ${comparison.toFollowsYou ? "Sí" : "No"} · Lo seguís: ${comparison.toYouFollow ? "Sí" : "No"}</small></article></div>`;
    } else if (person) {
      status.innerHTML = `<div class="drawer-state-grid single"><article><span>Estado actual</span><strong>${escapeHtml(relationshipLabel(person))}</strong><small>Te sigue: ${person.followsYou ? "Sí" : "No"} · Lo seguís: ${person.youFollow ? "Sí" : "No"}</small></article></div>`;
    }

    const events = person ? person.events : [];
    const visibleEvents = events.slice(0, 200);
    document.querySelector("#drawer-history").innerHTML = `<h3>Historial</h3>${
      visibleEvents.length
        ? `${visibleEvents
            .map(
              (event) => `<article class="drawer-event"><strong>${escapeHtml(eventLabel(event.type))}</strong><small>${escapeHtml(formatDate(event.occurredAt))} · reporte ${escapeHtml(event.reportId || "sin id")}</small></article>`
            )
            .join("")}${events.length > visibleEvents.length ? `<p class="drawer-history-note">Se muestran los 200 cambios más recientes. Usá Actividad para consultar el historial completo.</p>` : ""}`
        : "<p>No hay cambios históricos guardados.</p>"
    }`;
    overlay.hidden = false;
    document.body.classList.add("drawer-open");
  }

  function resetRelationshipPage() {
    ux.relPage = 1;
  }

  function resetPeoplePage() {
    ux.peoplePage = 1;
  }

  injectCss();
  ensureControls();
  ensureDrawer();
  Runtime.registerRenderer("relationships", renderRelationshipTable, { id: "ux.relationships", priority: 100 });
  Runtime.registerRenderer("people", renderPeopleTable, { id: "ux.people", priority: 100 });
  Runtime.on("comparison:updated", resetRelationshipPage, { id: "ux.comparison" });
  Runtime.on("profile:loaded", () => {
    resetRelationshipPage();
    resetPeoplePage();
  }, { id: "ux.profile" });

  if (!location.hash) {
    state.view = "relationships";
    activateView("relationships", false);
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target.closest("#export-comparison-list")) {
      exportRelationshipRows();
      return;
    }

    const preset = target.closest("[data-preset]");
    if (preset) {
      applyComparisonPreset(preset.dataset.preset);
      return;
    }

    if (target.closest("#clear-relationship-filters")) {
      state.relationshipQuery = "";
      state.relationshipFilter = "all";
      ux.relState = "all";
      ux.relChange = "all";
      resetRelationshipPage();
      document.querySelector("#relationship-search").value = "";
      document.querySelector("#relationship-state-filter").value = "all";
      document.querySelector("#relationship-change-filter").value = "all";
      document
        .querySelectorAll("[data-relationship-filter]")
        .forEach((button) => button.classList.toggle("active", button.dataset.relationshipFilter === "all"));
      renderRelationshipTable();
      return;
    }

    if (target.closest("#clear-people-filters")) {
      state.query = "";
      state.filter = "all";
      resetPeoplePage();
      document.querySelector("#people-search").value = "";
      document
        .querySelectorAll("#people-filters .filter")
        .forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
      renderPeopleTable();
      return;
    }

    const relationshipSort = target.closest(".relationship-table .table-sort");
    if (relationshipSort) {
      toggleSort(ux.relSort, relationshipSort.dataset.sortKey);
      resetRelationshipPage();
      renderRelationshipTable();
      return;
    }

    const peopleSort = target.closest(".current-table .table-sort");
    if (peopleSort) {
      toggleSort(ux.peopleSort, peopleSort.dataset.sortKey);
      resetPeoplePage();
      renderPeopleTable();
      return;
    }

    const pageButton = target.closest("[data-page-action][data-page-scope]");
    if (pageButton && !pageButton.disabled) {
      const amount = pageButton.dataset.pageAction === "next" ? 1 : -1;
      if (pageButton.dataset.pageScope === "relationships") {
        ux.relPage += amount;
        renderRelationshipTable();
      } else {
        ux.peoplePage += amount;
        renderPeopleTable();
      }
      return;
    }

    const relationshipFilter = target.closest("[data-relationship-filter]");
    if (relationshipFilter) {
      resetRelationshipPage();
      queueMicrotask(renderRelationshipTable);
    }
    const peopleFilter = target.closest("#people-filters [data-filter]");
    if (peopleFilter) {
      resetPeoplePage();
      queueMicrotask(renderPeopleTable);
    }

    const row = target.closest(".clickable-table-row");
    if (row && !target.closest("a,button,input,select")) {
      openDrawer(row.dataset.user, row.dataset.source);
      return;
    }
    if (target.closest("#drawer-close") || target.id === "rel-drawer-overlay") closeDrawer();
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "relationship-state-filter") {
      ux.relState = event.target.value;
      resetRelationshipPage();
      renderRelationshipTable();
    } else if (event.target.id === "relationship-change-filter") {
      ux.relChange = event.target.value;
      resetRelationshipPage();
      renderRelationshipTable();
    } else if (event.target.id === "relationship-density") {
      ux.relDensity = event.target.value;
      renderRelationshipTable();
    } else if (event.target.id === "relationship-page-size") {
      ux.relPageSize = Number(event.target.value) || 250;
      resetRelationshipPage();
      renderRelationshipTable();
    } else if (event.target.id === "people-density") {
      ux.peopleDensity = event.target.value;
      renderPeopleTable();
    } else if (event.target.id === "people-page-size") {
      ux.peoplePageSize = Number(event.target.value) || 250;
      resetPeoplePage();
      renderPeopleTable();
    } else if (["compare-from", "compare-to"].includes(event.target.id)) {
      resetRelationshipPage();
    } else if (event.target.id === "profile-select") {
      resetRelationshipPage();
      resetPeoplePage();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
    const row = event.target.closest?.(".clickable-table-row");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openDrawer(row.dataset.user, row.dataset.source);
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "relationship-search") {
      resetRelationshipPage();
      queueMicrotask(() => {
        renderFilterChips();
        renderRelationshipTable();
      });
    } else if (event.target.id === "people-search") {
      resetPeoplePage();
      queueMicrotask(() => {
        renderFilterChips();
        renderPeopleTable();
      });
    }
  });

  setTimeout(() => {
    ensureControls();
    if (!location.hash) activateView("relationships", false);
    if (state.relationshipTransitions.length) renderRelationshipTable();
    if (state.people.length) renderPeopleTable();
  }, 0);
})();
