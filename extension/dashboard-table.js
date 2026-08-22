"use strict";

(function enhanceRelationshipList() {
  function filteredRelationshipRows() {
    const query = state.relationshipQuery
      .trim()
      .toLowerCase()
      .replace(/^@/, "");

    return state.relationshipTransitions.filter(
      (item) =>
        relationshipMatchesFilter(item) &&
        (!query || item.normalized.includes(query))
    );
  }

  function booleanCell(value, pastTense) {
    const label = value ? "Sí" : "No";
    const explanation = value
      ? pastTense
        ? "Sí, estaba en la lista"
        : "Sí, está en la lista"
      : pastTense
        ? "No, no estaba en la lista"
        : "No, no está en la lista";

    return `<span class="list-boolean ${value ? "yes" : "no"}" title="${escapeHtml(explanation)}">${label}</span>`;
  }

  function resultToneClass(tone) {
    return ["positive", "negative", "info", "warning"].includes(tone)
      ? tone
      : "neutral";
  }

  function ensureRelationshipListActions() {
    const tools = document.querySelector(".relationship-tools");
    if (!tools || document.querySelector("#relationship-list-actions")) return;

    const actions = document.createElement("div");
    actions.id = "relationship-list-actions";
    actions.className = "relationship-list-actions";
    actions.innerHTML = `
      <div>
        <strong id="relationship-visible-count">0 filas</strong>
        <small>Una fila por persona, como una planilla.</small>
      </div>
      <button id="export-comparison-list" class="button button-secondary comparison-export" type="button">
        Descargar lista CSV
      </button>`;

    tools.append(actions);
  }

  function renderExcelStyleRelationshipList() {
    ensureRelationshipListActions();

    const target = document.querySelector("#relationship-list");
    if (!target) return;

    const rows = filteredRelationshipRows();
    const count = document.querySelector("#relationship-visible-count");
    const exportButton = document.querySelector("#export-comparison-list");

    if (count) {
      count.textContent = `${formatNumber(rows.length)} fila${rows.length === 1 ? "" : "s"}`;
    }
    if (exportButton) exportButton.disabled = rows.length === 0;

    if (!rows.length) {
      target.innerHTML =
        '<div class="relationship-empty">No hay personas que coincidan con este filtro en los reportes seleccionados.</div>';
      return;
    }

    target.innerHTML = `
      <div class="relationship-table-shell" role="region" aria-label="Lista comparada de seguidores y seguidos" tabindex="0">
        <table class="relationship-table">
          <thead>
            <tr>
              <th scope="col">Usuario</th>
              <th scope="col">Antes · te seguía</th>
              <th scope="col">Antes · lo seguías</th>
              <th scope="col">Ahora · te sigue</th>
              <th scope="col">Ahora · lo seguís</th>
              <th scope="col">Qué cambió</th>
              <th scope="col" class="table-profile-column">Perfil</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (item) => `
                  <tr class="table-tone-${escapeHtml(resultToneClass(item.tone))}">
                    <th scope="row" class="table-user-cell">
                      <span class="relationship-avatar">${escapeHtml(item.normalized.slice(0, 2))}</span>
                      <span>
                        <strong>@${escapeHtml(item.username)}</strong>
                        <small>${escapeHtml(relationshipStateLabels.current[item.toState])}</small>
                      </span>
                    </th>
                    <td data-label="Antes · te seguía">${booleanCell(item.fromFollowsYou, true)}</td>
                    <td data-label="Antes · lo seguías">${booleanCell(item.fromYouFollow, true)}</td>
                    <td data-label="Ahora · te sigue">${booleanCell(item.toFollowsYou, false)}</td>
                    <td data-label="Ahora · lo seguís">${booleanCell(item.toYouFollow, false)}</td>
                    <td data-label="Qué cambió">
                      <span class="table-result result-${escapeHtml(resultToneClass(item.tone))}">${escapeHtml(item.headline)}</span>
                    </td>
                    <td data-label="Perfil" class="table-profile-column">
                      <a
                        class="profile-link table-profile-link"
                        href="https://www.instagram.com/${encodeURIComponent(item.normalized)}/"
                        target="_blank"
                        rel="noreferrer"
                      >Abrir</a>
                    </td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  function escapeCsvCell(value) {
    let text = String(value == null ? "" : value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function exportVisibleRelationshipRows() {
    const rows = filteredRelationshipRows();
    if (!rows.length || !state.profile) return;

    const headers = [
      "Usuario",
      "Antes: te seguía",
      "Antes: lo seguías",
      "Ahora: te sigue",
      "Ahora: lo seguís",
      "Estado anterior",
      "Estado actual",
      "Qué cambió",
    ];

    const csvRows = rows.map((item) => [
      item.username,
      item.fromFollowsYou ? "Sí" : "No",
      item.fromYouFollow ? "Sí" : "No",
      item.toFollowsYou ? "Sí" : "No",
      item.toYouFollow ? "Sí" : "No",
      relationshipStateLabels.previous[item.fromState],
      relationshipStateLabels.current[item.toState],
      item.headline,
    ]);

    const csv = [headers, ...csvRows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");

    const safeFrom = String(state.compareFrom || "anterior").replace(/[^a-zA-Z0-9_-]/g, "-");
    const safeTo = String(state.compareTo || "actual").replace(/[^a-zA-Z0-9_-]/g, "-");
    const filename = `follow-tracker_lista_${state.profile}_${safeFrom}_a_${safeTo}.csv`;

    downloadText(filename, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  }

  renderRelationshipList = renderExcelStyleRelationshipList;

  document.addEventListener("click", (event) => {
    const button = event.target.closest("#export-comparison-list");
    if (button) exportVisibleRelationshipRows();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureRelationshipListActions, { once: true });
  } else {
    ensureRelationshipListActions();
  }
})();
