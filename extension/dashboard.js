"use strict";

const Core = globalThis.FollowTrackerCore;
const History = globalThis.FollowTrackerHistory;
const state = {
  storage: {},
  profiles: [],
  profile: null,
  snapshot: null,
  timeline: null,
  people: [],
  filter: "all",
  query: "",
  compareFrom: null,
  compareTo: null,
};

const eventMeta = {
  followed_you: { symbol: "+", tone: "positive", title: "te siguio" },
  unfollowed_you: { symbol: "−", tone: "negative", title: "te dejo de seguir" },
  you_followed: { symbol: "→", tone: "neutral", title: "empezaste a seguir" },
  you_unfollowed: { symbol: "←", tone: "negative", title: "dejaste de seguir" },
};

function storageGetAll() {
  return new Promise((resolve) => chrome.storage.local.get(null, (items) => resolve(items || {})));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("es-UY");
}

function formatDate(value, withTime = true) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("es-UY", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function profileKeys(profile) {
  const safe = Core.safeProfile(profile);
  return { history: `ft_history_${safe}`, timeline: `ft_timeline_${safe}` };
}

function detectProfiles(items) {
  return Object.keys(items)
    .filter((key) => key.startsWith("ft_history_") && items[key])
    .map((key) => {
      const snapshot = items[key];
      return Core.safeProfile((snapshot && snapshot.profile) || key.slice("ft_history_".length));
    })
    .filter((profile, index, list) => list.indexOf(profile) === index)
    .sort();
}

function showEmpty() {
  document.querySelector("#empty-state").hidden = false;
  document.querySelector("#dashboard-content").hidden = true;
  document.querySelector("#profile-select").innerHTML = '<option>Sin perfiles</option>';
  document.querySelector("#profile-select").disabled = true;
  document.querySelector("#analyze-profile").disabled = true;
  document.querySelector("#export-toggle").disabled = true;
}

function fillProfileSelect() {
  const select = document.querySelector("#profile-select");
  select.disabled = false;
  select.innerHTML = state.profiles
    .map((profile) => `<option value="${escapeHtml(profile)}"${profile === state.profile ? " selected" : ""}>@${escapeHtml(profile)}</option>`)
    .join("");
}

function deltaText(added, removed) {
  const net = Number(added || 0) - Number(removed || 0);
  if (net > 0) return `+${formatNumber(net)} netos en el ultimo reporte`;
  if (net < 0) return `${formatNumber(net)} netos en el ultimo reporte`;
  if (added || removed) return "Sin cambio neto en el ultimo reporte";
  return "Sin cambios detectados";
}

function renderOverview() {
  const summary = History.summarizeSnapshot(state.snapshot);
  const latest = History.latestReport(state.timeline);
  const changes = latest && latest.changes ? latest.changes : {};

  document.querySelector("#hero-title").textContent = `Actividad de @${state.profile}`;
  document.querySelector("#hero-subtitle").textContent = `Ultima captura completa: ${formatDate(summary.updatedAt)} · ${state.timeline.reports.length} reporte${state.timeline.reports.length === 1 ? "" : "s"} guardado${state.timeline.reports.length === 1 ? "" : "s"}.`;
  document.querySelector("#last-report-id").textContent = latest ? latest.id : "Linea base";

  document.querySelector("#kpi-followers").textContent = formatNumber(summary.followers);
  document.querySelector("#kpi-following").textContent = formatNumber(summary.following);
  document.querySelector("#kpi-mutual").textContent = formatNumber(summary.mutual);
  document.querySelector("#kpi-follower-only").textContent = formatNumber(summary.followerOnly);
  document.querySelector("#kpi-following-only").textContent = formatNumber(summary.followingOnly);
  document.querySelector("#kpi-lost").textContent = formatNumber((changes.lostFollowers || []).length);
  document.querySelector("#delta-followers").textContent = deltaText((changes.newFollowers || []).length, (changes.lostFollowers || []).length);
  document.querySelector("#delta-following").textContent = deltaText((changes.newFollowing || []).length, (changes.lostFollowing || []).length);
}

function chartPoint(value, index, count, minValue, maxValue, width, height, padding) {
  const x = count <= 1 ? width / 2 : padding + (index * (width - padding * 2)) / (count - 1);
  const range = Math.max(1, maxValue - minValue);
  const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

function renderChart() {
  const container = document.querySelector("#history-chart");
  const reports = [...state.timeline.reports].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
  if (!reports.length) {
    container.innerHTML = '<div class="chart-empty">Todavia no hay reportes suficientes para mostrar una evolucion.</div>';
    return;
  }

  const width = 760;
  const height = 235;
  const padding = 28;
  const values = reports.flatMap((report) => [Number(report.followersCount || 0), Number(report.followingCount || 0)]);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  const margin = Math.max(2, Math.ceil((maxValue - minValue) * .12));
  minValue = Math.max(0, minValue - margin);
  maxValue += margin;

  const followerPoints = reports.map((report, index) => chartPoint(report.followersCount, index, reports.length, minValue, maxValue, width, height, padding));
  const followingPoints = reports.map((report, index) => chartPoint(report.followingCount, index, reports.length, minValue, maxValue, width, height, padding));
  const polyline = (points) => points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${followerPoints[0].x},${height - padding} ${polyline(followerPoints)} ${followerPoints[followerPoints.length - 1].x},${height - padding}`;

  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const y = padding + ratio * (height - padding * 2);
    const label = Math.round(maxValue - ratio * (maxValue - minValue));
    return `<line class="chart-grid-line" x1="${padding}" x2="${width - padding}" y1="${y}" y2="${y}"/><text class="chart-label" x="0" y="${y + 3}">${formatNumber(label)}</text>`;
  }).join("");

  const followerDots = followerPoints.map((point, index) => `<circle class="chart-point-followers" cx="${point.x}" cy="${point.y}" r="4"><title>${formatDate(reports[index].capturedAt)} · ${formatNumber(reports[index].followersCount)} seguidores</title></circle>`).join("");
  const followingDots = followingPoints.map((point, index) => `<circle class="chart-point-following" cx="${point.x}" cy="${point.y}" r="4"><title>${formatDate(reports[index].capturedAt)} · ${formatNumber(reports[index].followingCount)} seguidos</title></circle>`).join("");
  const firstDate = formatDate(reports[0].capturedAt, false);
  const lastDate = formatDate(reports[reports.length - 1].capturedAt, false);

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="followersFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#7557ff" stop-opacity=".22"/><stop offset="100%" stop-color="#7557ff" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <polygon class="chart-fill" points="${area}"/>
      <polyline class="chart-followers" points="${polyline(followerPoints)}"/>
      <polyline class="chart-following" points="${polyline(followingPoints)}"/>
      ${followerDots}${followingDots}
      <text class="chart-label" x="${padding}" y="${height - 5}">${escapeHtml(firstDate)}</text>
      <text class="chart-label" x="${width - padding}" y="${height - 5}" text-anchor="end">${escapeHtml(lastDate)}</text>
    </svg>`;
}

function changeGroup(label, usernames, color) {
  const users = Array.isArray(usernames) ? usernames : [];
  const preview = users.slice(0, 5).map((username) => `@${username}`).join(", ");
  const remainder = users.length > 5 ? ` y ${users.length - 5} mas` : "";
  return `<div class="change-group"><div class="change-group-head"><span><i style="background:${color}"></i>${escapeHtml(label)}</span><strong>${formatNumber(users.length)}</strong></div><p class="change-usernames">${users.length ? `${escapeHtml(preview)}${escapeHtml(remainder)}` : "Sin cambios"}</p></div>`;
}

function renderLatestChanges() {
  const latest = History.latestReport(state.timeline);
  const target = document.querySelector("#latest-changes");
  if (!latest || latest.isBaseline) {
    document.querySelector("#latest-change-date").textContent = "Linea base";
    target.innerHTML = '<div class="change-empty">La primera captura crea la referencia. Los cambios apareceran desde el segundo analisis completo.</div>';
    return;
  }
  document.querySelector("#latest-change-date").textContent = formatDate(latest.capturedAt, false);
  const changes = latest.changes || {};
  target.innerHTML = [
    changeGroup("Nuevos seguidores", changes.newFollowers, "#169c72"),
    changeGroup("Te dejaron de seguir", changes.lostFollowers, "#d54961"),
    changeGroup("Empezaste a seguir", changes.newFollowing, "#7557ff"),
    changeGroup("Dejaste de seguir", changes.lostFollowing, "#d98737"),
  ].join("");
}

function signedNumber(value) {
  const number = Number(value || 0);
  if (number > 0) return `+${formatNumber(number)}`;
  return formatNumber(number);
}

function setDeltaTone(element, value) {
  element.classList.remove("positive", "negative");
  if (value > 0) element.classList.add("positive");
  if (value < 0) element.classList.add("negative");
  element.textContent = signedNumber(value);
}

function reportOption(report) {
  const label = `${formatDate(report.capturedAt)} · ${report.id}`;
  return `<option value="${escapeHtml(report.id)}">${escapeHtml(label)}</option>`;
}

function renderReportComparison() {
  const reports = [...state.timeline.reports].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
  const fromSelect = document.querySelector("#compare-from");
  const toSelect = document.querySelector("#compare-to");
  const empty = document.querySelector("#compare-empty");
  const content = document.querySelector("#compare-content");

  if (reports.length < 2) {
    fromSelect.innerHTML = reports.map(reportOption).join("") || "<option>Sin reportes</option>";
    toSelect.innerHTML = fromSelect.innerHTML;
    fromSelect.disabled = true;
    toSelect.disabled = true;
    empty.hidden = false;
    content.hidden = true;
    return;
  }

  const ids = new Set(reports.map((report) => report.id));
  if (!state.compareTo || !ids.has(state.compareTo)) state.compareTo = reports[reports.length - 1].id;
  if (!state.compareFrom || !ids.has(state.compareFrom)) state.compareFrom = reports[reports.length - 2].id;

  fromSelect.disabled = false;
  toSelect.disabled = false;
  fromSelect.innerHTML = reports.map(reportOption).join("");
  toSelect.innerHTML = reports.map(reportOption).join("");
  fromSelect.value = state.compareFrom;
  toSelect.value = state.compareTo;

  const comparison = History.compareReports(state.timeline, state.compareFrom, state.compareTo);
  if (!comparison) {
    empty.textContent = "No se pudo reconstruir una de las capturas seleccionadas.";
    empty.hidden = false;
    content.hidden = true;
    return;
  }

  empty.hidden = true;
  content.hidden = false;
  document.querySelector("#compare-caption").textContent =
    `Desde ${formatDate(comparison.fromReport.capturedAt)} hasta ${formatDate(comparison.toReport.capturedAt)}.`;

  setDeltaTone(document.querySelector("#compare-followers-delta"), comparison.followers.delta);
  setDeltaTone(document.querySelector("#compare-following-delta"), comparison.following.delta);
  setDeltaTone(document.querySelector("#compare-mutual-delta"), comparison.mutualDelta);

  document.querySelector("#compare-groups").innerHTML = [
    changeGroup("Empezaron a seguirte", comparison.followers.added, "#169c72"),
    changeGroup("Dejaron de seguirte", comparison.followers.removed, "#d54961"),
    changeGroup("Empezaste a seguir", comparison.following.added, "#7557ff"),
    changeGroup("Dejaste de seguir", comparison.following.removed, "#d98737"),
  ].join("");
}

function renderActivity() {
  const events = [...state.timeline.events].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  document.querySelector("#event-total").textContent = `${formatNumber(events.length)} evento${events.length === 1 ? "" : "s"}`;
  const target = document.querySelector("#activity-list");
  if (!events.length) {
    target.innerHTML = '<div class="activity-empty">Aun no hay cambios: ejecuta un segundo analisis completo para comparar.</div>';
    return;
  }
  target.innerHTML = events.slice(0, 100).map((event) => {
    const meta = eventMeta[event.type] || { symbol: "·", tone: "neutral", title: "cambio detectado" };
    return `<article class="activity-item"><span class="activity-symbol ${meta.tone}">${meta.symbol}</span><div class="activity-copy"><strong>@${escapeHtml(event.username)} ${escapeHtml(meta.title)}</strong><p>${escapeHtml(formatDate(event.occurredAt))}</p><small>Reporte ${escapeHtml(event.reportId || "sin id")}</small></div></article>`;
  }).join("");
}

function relationshipLabel(person) {
  return {
    mutual: "Mutuo",
    follows_you: "Te sigue; no lo sigues",
    you_follow: "Lo sigues; no te sigue",
    historical: "Solo en historial",
  }[person.relationship] || person.relationship;
}

function matchesFilter(person) {
  if (state.filter === "unfollowed") return person.hasUnfollowedYou;
  if (state.filter === "not-following-back") return person.relationship === "you_follow";
  if (state.filter === "mutual") return person.relationship === "mutual";
  return true;
}

function renderPeople() {
  const query = state.query.trim().toLowerCase().replace(/^@/, "");
  const people = state.people.filter((person) => matchesFilter(person) && (!query || person.username.includes(query)));
  document.querySelector("#people-count").textContent = `${formatNumber(people.length)} persona${people.length === 1 ? "" : "s"}`;
  const target = document.querySelector("#people-list");
  if (!people.length) {
    target.innerHTML = '<div class="people-empty">No hay usuarios que coincidan con este filtro.</div>';
    return;
  }
  target.innerHTML = people.slice(0, 500).map((person) => {
    const last = person.lastEvent;
    const meta = last ? (eventMeta[last.type] || { title: "cambio detectado" }) : null;
    const initials = person.username.slice(0, 2);
    return `<article class="person-row"><span class="avatar">${escapeHtml(initials)}</span><div class="person-main"><strong>@${escapeHtml(person.username)}</strong><small>${person.events.length} cambio${person.events.length === 1 ? "" : "s"} historico${person.events.length === 1 ? "" : "s"}</small></div><span class="relationship-badge ${person.relationship}">${escapeHtml(relationshipLabel(person))}</span><div class="last-event">${last ? escapeHtml(meta.title) : "Sin cambios detectados"}${last ? `<small>${escapeHtml(formatDate(last.occurredAt))} · ${escapeHtml(last.reportId)}</small>` : ""}</div><button class="person-open" data-username="${escapeHtml(person.username)}" type="button" aria-label="Ver historial de @${escapeHtml(person.username)}">›</button></article>`;
  }).join("");

  target.querySelectorAll(".person-open").forEach((button) => {
    button.addEventListener("click", () => openPersonDialog(button.dataset.username));
  });
}

function openPersonDialog(username) {
  const person = state.people.find((item) => item.username === username);
  if (!person) return;
  document.querySelector("#dialog-username").textContent = `@${person.username}`;
  document.querySelector("#dialog-relationship").textContent = `Estado actual: ${relationshipLabel(person)}. El historial conserva ${person.events.length} evento${person.events.length === 1 ? "" : "s"} asociado${person.events.length === 1 ? "" : "s"} a esta persona.`;
  document.querySelector("#dialog-profile-link").href = `https://www.instagram.com/${encodeURIComponent(person.username)}/`;
  const events = document.querySelector("#dialog-events");
  events.innerHTML = person.events.length
    ? person.events.map((event) => `<article class="dialog-event"><i></i><div><strong>${escapeHtml(History.eventLabel(event.type))}</strong><small>${escapeHtml(formatDate(event.occurredAt))} · reporte ${escapeHtml(event.reportId || "sin id")}</small></div></article>`).join("")
    : '<div class="activity-empty">Esta persona esta en la captura actual, pero aun no tiene eventos historicos.</div>';
  document.querySelector("#person-dialog").showModal();
}

function renderAll() {
  renderOverview();
  renderChart();
  renderLatestChanges();
  renderReportComparison();
  renderActivity();
  renderPeople();
}

async function loadProfile(profile) {
  state.profile = Core.safeProfile(profile);
  const keys = profileKeys(state.profile);
  state.snapshot = state.storage[keys.history] || null;
  if (!state.snapshot) {
    await initialize();
    return;
  }
  state.timeline = state.storage[keys.timeline] || History.appendSnapshot(null, null, state.snapshot);
  state.people = History.buildPeopleIndex(state.snapshot, state.timeline);
  fillProfileSelect();
  document.querySelector("#empty-state").hidden = true;
  document.querySelector("#dashboard-content").hidden = false;
  document.querySelector("#analyze-profile").disabled = false;
  document.querySelector("#export-toggle").disabled = false;
  const url = new URL(location.href);
  url.searchParams.set("profile", state.profile);
  history.replaceState({}, "", url);
  renderAll();
}

async function initialize() {
  state.storage = await storageGetAll();
  state.profiles = detectProfiles(state.storage);
  if (!state.profiles.length) {
    state.profile = null;
    showEmpty();
    return;
  }
  const requested = Core.safeProfile(new URLSearchParams(location.search).get("profile") || "");
  const profile = state.profiles.includes(requested) ? requested : state.profiles[0];
  await loadProfile(profile);
}

document.querySelector("#profile-select").addEventListener("change", (event) => loadProfile(event.target.value));
document.querySelector("#people-search").addEventListener("input", (event) => { state.query = event.target.value; renderPeople(); });
document.querySelector("#compare-from").addEventListener("change", (event) => {
  state.compareFrom = event.target.value;
  renderReportComparison();
});
document.querySelector("#compare-to").addEventListener("change", (event) => {
  state.compareTo = event.target.value;
  renderReportComparison();
});
document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderPeople();
  });
});

document.querySelector("#analyze-profile").addEventListener("click", () => {
  if (state.profile) chrome.tabs.create({ url: `https://www.instagram.com/${encodeURIComponent(state.profile)}/` });
});
document.querySelector("#empty-open-instagram").addEventListener("click", () => chrome.tabs.create({ url: "https://www.instagram.com/" }));

document.querySelector("#export-toggle").addEventListener("click", () => {
  const menu = document.querySelector("#export-menu");
  menu.hidden = !menu.hidden;
  document.querySelector("#export-toggle").setAttribute("aria-expanded", String(!menu.hidden));
});

document.querySelectorAll("[data-export]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.profile || !state.snapshot || !state.timeline) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (button.dataset.export === "json") {
      downloadText(`follow-tracker_${state.profile}_${stamp}.json`, JSON.stringify({ snapshot: state.snapshot, timeline: state.timeline }, null, 2), "application/json;charset=utf-8");
    } else if (button.dataset.export === "events") {
      downloadText(`follow-tracker_actividad_${state.profile}_${stamp}.csv`, `\uFEFF${History.eventsToCsv(state.timeline.events)}`, "text/csv;charset=utf-8");
    } else {
      downloadText(`follow-tracker_relaciones_${state.profile}_${stamp}.csv`, `\uFEFF${History.relationshipToCsv(state.snapshot)}`, "text/csv;charset=utf-8");
    }
    document.querySelector("#export-menu").hidden = true;
  });
});

document.querySelector("#delete-profile").addEventListener("click", async () => {
  if (!state.profile) return;
  const accepted = confirm(`¿Borrar todo el historial local de @${state.profile}? Esta accion no se puede deshacer.`);
  if (!accepted) return;
  const keys = profileKeys(state.profile);
  await storageRemove([keys.history, keys.timeline]);
  location.href = "dashboard.html";
});

document.querySelector("#dialog-close").addEventListener("click", () => document.querySelector("#person-dialog").close());
document.querySelector("#person-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.addEventListener("click", (event) => {
  const wrap = document.querySelector(".export-wrap");
  if (!wrap.contains(event.target)) document.querySelector("#export-menu").hidden = true;
});

let reloadTimer = null;
chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== "local") return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => initialize(), 180);
});

initialize().catch((error) => {
  console.error("No se pudo cargar el dashboard", error);
  showEmpty();
});
