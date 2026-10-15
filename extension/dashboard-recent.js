"use strict";

(function () {
  const Recent = globalThis.FollowTrackerRecentCore;
  const Runtime = globalThis.FollowTrackerDashboardRuntime;
  if (!Recent || !Runtime) throw new Error("Recientes requiere recent-core y dashboard-runtime.");
  const root = document.querySelector("#recent");
  if (!root) return;

  Runtime.registerView("recent");
  const ui = { kind: "followers", scope: "all", sort: "newest", query: "", limit: 36, projection: null, index: null };
  const elements = {
    list: root.querySelector("#recent-list"),
    message: root.querySelector("#recent-message"),
    count: root.querySelector("#recent-count"),
    more: root.querySelector("#recent-more"),
    scope: root.querySelector("#recent-scope"),
    sort: root.querySelector("#recent-sort"),
    search: root.querySelector("#recent-search"),
    report: root.querySelector("#recent-report"),
  };

  function getIndex() {
    if (!state.projection) return null;
    if (ui.projection !== state.projection) {
      ui.projection = state.projection;
      ui.index = Recent.buildRecentIndex(state.projection.snapshot, state.projection.timeline);
    }
    return ui.index;
  }

  function render() {
    if (state.view !== "recent") return;
    const index = getIndex();
    if (!index) return;
    const result = Recent.selectRecent(index, ui);

    root.querySelectorAll("[data-recent-kind]").forEach((button) => {
      const active = button.dataset.recentKind === ui.kind;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      const counts = index[button.dataset.recentKind + "Counts"];
      const value = button.querySelector(".recent-segment-count");
      if (value && counts) value.textContent = formatNumber(counts.total);
    });

    const label = ui.kind === "followers" ? "seguidores" : "seguidos";
    elements.report.textContent = index.latestReport
      ? `Última captura: ${formatDate(index.latestReport.capturedAt)}`
      : "Todavía no hay capturas guardadas";
    elements.count.textContent = `${formatNumber(result.total)} ${label} en esta vista`;
    elements.more.hidden = !result.hasMore;

    if (!result.items.length) {
      const detail = ui.query
        ? "No encontramos cuentas que coincidan con la búsqueda."
        : ui.scope === "detected"
          ? "Todavía no se detectaron incorporaciones desde la primera captura. Esa primera captura no revela el orden de antigüedad."
          : ui.scope === "latest"
            ? "No hay cuentas nuevas detectadas en el último reporte."
            : "No hay cuentas en la lista actual.";
      elements.list.innerHTML = `<div class="recent-empty"><span aria-hidden="true">◎</span><strong>Sin resultados</strong><p>${detail}</p><p>Probá «Todas las cuentas» para consultar la lista actual.</p></div>`;
      elements.message.textContent = "Cada nueva captura completa permite detectar cambios.";
      return;
    }

    elements.message.textContent = ui.scope === "all"
      ? "Las cuentas sin fecha detectada aparecen sin orden cronológico."
      : "Ordenado por fecha de detección, no por hora real del follow.";
    elements.list.innerHTML = result.items.map((person) => {
      const observed = person.detected
        ? `Detectado en la captura del ${formatDate(person.observedAt)}`
        : "Ya estaba en la primera captura o no hay fecha verificable";
      const chip = person.inLatest
        ? '<span class="recent-chip recent-chip-new">Nuevo en último reporte</span>'
        : person.detected
          ? '<span class="recent-chip">Detectado después</span>'
          : '<span class="recent-chip recent-chip-unknown">Fecha desconocida</span>';
      return `<article class="recent-person">
        ${profileAvatarMarkup(person.username, person.reportId, "recent-avatar")}
        <div class="recent-person-main">
          <strong>@${escapeHtml(person.username)}</strong>
          <small>${escapeHtml(observed)}</small>
        </div>
        ${chip}
        <div class="recent-person-actions">
          <button type="button" data-recent-person="${escapeHtml(person.username)}" aria-label="Ver historial de @${escapeHtml(person.username)}">Historial</button>
          <a href="https://www.instagram.com/${encodeURIComponent(person.username)}/" target="_blank" rel="noopener noreferrer" aria-label="Abrir @${escapeHtml(person.username)} en Instagram">Instagram ↗</a>
        </div>
      </article>`;
    }).join("");
  }

  root.addEventListener("click", (event) => {
    const kind = event.target.closest("[data-recent-kind]");
    if (kind) {
      ui.kind = kind.dataset.recentKind === "following" ? "following" : "followers";
      ui.limit = 36;
      render();
      return;
    }
    if (event.target.closest("#recent-more")) {
      ui.limit += 36;
      render();
      return;
    }
    const person = event.target.closest("[data-recent-person]");
    if (person) openPersonDialog(person.dataset.recentPerson);
  });

  root.addEventListener("change", (event) => {
    if (event.target === elements.scope) ui.scope = elements.scope.value;
    else if (event.target === elements.sort) ui.sort = elements.sort.value;
    else return;
    ui.limit = 36;
    render();
  });

  elements.search.addEventListener("input", () => {
    ui.query = elements.search.value.trim();
    ui.limit = 36;
    render();
  });

  Runtime.on("profile:loaded", () => {
    ui.projection = null;
    ui.index = null;
    ui.query = "";
    ui.limit = 36;
    elements.search.value = "";
  }, { id: "recent.profile" });
  Runtime.on("view:changed", ({ view }) => {
    if (view === "recent") render();
  }, { id: "recent.view" });
  Runtime.on("render:after", () => {
    if (state.view === "recent") render();
  }, { id: "recent.render" });
  render();
})();
