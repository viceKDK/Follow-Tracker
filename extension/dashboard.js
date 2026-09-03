"use strict";

const Core = globalThis.FollowTrackerCore;
const History = globalThis.FollowTrackerHistory;
const Runtime = globalThis.FollowTrackerDashboardRuntime;
const Storage = globalThis.FollowTrackerStorage;
const Relationship = globalThis.FollowTrackerRelationshipCore;
const Projection = globalThis.FollowTrackerDashboardProjection;

if (!Core || !History || !Runtime || !Storage || !Relationship || !Projection) {
  throw new Error("Follow Tracker Dashboard no pudo cargar sus dependencias base.");
}

const state = {
  storage: {},
  profiles: [],
  profile: null,
  snapshot: null,
  timeline: null,
  projection: null,
  people: [],
  view: "overview",
  filter: "all",
  query: "",
  compareFrom: null,
  compareTo: null,
  relationshipFilter: "changed",
  relationshipQuery: "",
  relationshipTransitions: [],
  chartRange: "all",
};

const eventMeta = {
  followed_you: { symbol: "+", tone: "positive", title: "te sigue ahora" },
  unfollowed_you: { symbol: "−", tone: "negative", title: "te dejó de seguir" },
  you_followed: { symbol: "→", tone: "neutral", title: "lo seguís ahora" },
  you_unfollowed: { symbol: "←", tone: "negative", title: "lo dejaste de seguir" },
};

const relationshipStateLabels = Relationship.STATE_LABELS;

function storageGetAll() { return Storage.getAll(); }
function storageRemove(keys) { return Storage.remove(keys); }
function formatNumber(value) { return Number(value || 0).toLocaleString("es-UY"); }

function formatDate(value, withTime = true) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(
    "es-UY",
    withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }
  );
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function profileDetails(usernameValue, reportId) {
  const username = String(usernameValue || "").toLowerCase().replace(/^@/, "");
  const reports = state.timeline && Array.isArray(state.timeline.reports) ? state.timeline.reports : [];
  const exactReport = reportId ? reports.find((report) => report.id === reportId) : null;
  const sources = [
    exactReport && exactReport.users,
    state.snapshot && state.snapshot.users,
    ...reports.slice().reverse().map((report) => report.users),
    state.timeline && state.timeline.baseline && state.timeline.baseline.users,
  ];
  for (const rows of sources) {
    const user = (Array.isArray(rows) ? rows : []).find((item) => {
      const names = [item && item.username, item && item.currentUsername, item && item.canonicalUsername, ...(item && item.aliases || [])];
      return names.some((name) => String(name || "").toLowerCase() === username);
    });
    if (!user) continue;
    let avatarUrl = "";
    try {
      const parsed = new URL(String(user.avatarUrl || user.profilePicUrl || user.profile_pic_url || ""));
      if (parsed.protocol === "https:") avatarUrl = parsed.href;
    } catch (_) {}
    return { ...user, username, avatarUrl };
  }
  return { username, avatarUrl: "" };
}

function profileAvatarMarkup(usernameValue, reportId, className = "relationship-avatar") {
  const details = profileDetails(usernameValue, reportId);
  const username = details.username || String(usernameValue || "").replace(/^@/, "");
  const initials = username.slice(0, 2).toUpperCase() || "IG";
  const image = details.avatarUrl
    ? `<img data-profile-avatar src="${escapeHtml(details.avatarUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
    : "";
  return `<span class="${escapeHtml(className)} profile-avatar${image ? " has-profile-photo" : ""}" aria-hidden="true"><span>${escapeHtml(initials)}</span>${image}</span>`;
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
    .map((key) => Core.safeProfile((items[key] && items[key].profile) || key.slice("ft_history_".length)))
    .filter((profile, index, list) => list.indexOf(profile) === index)
    .sort();
}

function validView(value) { return Runtime.resolveView(value, "overview"); }

function activateView(view, updateHash = true) {
  state.view = validView(view);
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === state.view;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  if (updateHash) {
    const url = new URL(location.href);
    url.hash = state.view;
    history.replaceState({}, "", url);
  }
  Runtime.emitSync("view:changed", { state, view: state.view });
}

function showEmpty() {
  document.querySelector("#empty-state").hidden = false;
  document.querySelector("#dashboard-content").hidden = true;
  const select = document.querySelector("#profile-select");
  select.innerHTML = "<option>Sin perfiles</option>";
  select.disabled = true;
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
  if (net > 0) return `+${formatNumber(net)} desde el reporte anterior`;
  if (net < 0) return `${formatNumber(net)} desde el reporte anterior`;
  if (added || removed) return "Misma cantidad; cambiaron personas";
  return "Sin cambios detectados";
}

function requireProjection() {
  if (!state.projection) Projection.projectState(state);
  return state.projection;
}

function renderOverview() {
  const projection = requireProjection();
  if (!projection) return;
  const summary = projection.summary;
  const latest = projection.latestReport;
  const changes = projection.latestChanges || {};

  document.querySelector("#hero-title").textContent = `Relaciones de @${state.profile}`;
  document.querySelector("#hero-subtitle").textContent =
    `Última captura completa: ${formatDate(summary.updatedAt)} · ` +
    `${projection.reports.length} reporte${projection.reports.length === 1 ? "" : "s"} guardado${projection.reports.length === 1 ? "" : "s"}.`;
  document.querySelector("#last-report-id").textContent = latest ? latest.id : "Línea base";
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
  const projection = requireProjection();
  const container = document.querySelector("#history-chart");
  const allReports = projection ? projection.reports : [];
  const latestTime = allReports.length ? new Date(allReports.at(-1).capturedAt).getTime() : 0;
  const rangeDays = state.chartRange === "all" ? 0 : Number(state.chartRange);
  const rangedReports = rangeDays
    ? allReports.filter((report) => new Date(report.capturedAt).getTime() >= latestTime - rangeDays * 86400000)
    : allReports;
  const reports = rangedReports.length ? rangedReports : allReports;
  if (!reports.length) {
    container.innerHTML = '<div class="chart-empty">Todavía no hay reportes suficientes para mostrar una evolución.</div>';
    return;
  }

  const width = 760;
  const height = 245;
  const padding = 30;
  const values = reports.flatMap((report) => [Number(report.followersCount || 0), Number(report.followingCount || 0)]);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  const margin = Math.max(2, Math.ceil((maxValue - minValue) * 0.12));
  minValue = Math.max(0, minValue - margin);
  maxValue += margin;

  const followers = reports.map((report, index) => chartPoint(report.followersCount, index, reports.length, minValue, maxValue, width, height, padding));
  const following = reports.map((report, index) => chartPoint(report.followingCount, index, reports.length, minValue, maxValue, width, height, padding));
  const polyline = (points) => points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${followers[0].x},${height - padding} ${polyline(followers)} ${followers[followers.length - 1].x},${height - padding}`;
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const y = padding + ratio * (height - padding * 2);
    const label = Math.round(maxValue - ratio * (maxValue - minValue));
    return `<line class="chart-grid-line" x1="${padding}" x2="${width - padding}" y1="${y}" y2="${y}"/><text class="chart-label" x="0" y="${y + 3}">${formatNumber(label)}</text>`;
  }).join("");
  const followerDots = followers.map((point, index) => `<circle class="chart-point-followers" cx="${point.x}" cy="${point.y}" r="4" tabindex="0"><title>${formatDate(reports[index].capturedAt)} · ${formatNumber(reports[index].followersCount)} te siguen</title></circle>`).join("");
  const followingDots = following.map((point, index) => `<circle class="chart-point-following" cx="${point.x}" cy="${point.y}" r="4" tabindex="0"><title>${formatDate(reports[index].capturedAt)} · seguís a ${formatNumber(reports[index].followingCount)}</title></circle>`).join("");

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-labelledby="history-chart-title history-chart-description">
    <title id="history-chart-title">Evolución de seguidores y seguidos</title><desc id="history-chart-description">${reports.length} reporte${reports.length === 1 ? "" : "s"} en el período seleccionado.</desc>
    ${grid}<polygon class="chart-fill" points="${area}"/><polyline class="chart-followers" points="${polyline(followers)}"/><polyline class="chart-following" points="${polyline(following)}"/>${followerDots}${followingDots}
    <text class="chart-label" x="${padding}" y="${height - 5}">${escapeHtml(formatDate(reports[0].capturedAt, false))}</text>
    <text class="chart-label" x="${width - padding}" y="${height - 5}" text-anchor="end">${escapeHtml(formatDate(reports[reports.length - 1].capturedAt, false))}</text>
  </svg>`;
}

function changeGroup(label, usernames, asset, tone) {
  const users = Array.isArray(usernames) ? usernames : [];
  const preview = users.slice(0, 6).map((username) => `@${username}`).join(", ");
  const remainder = users.length > 6 ? ` y ${users.length - 6} más` : "";
  return `<div class="change-group change-group-${tone}"><div class="change-group-head"><span><img class="change-group-icon" src="${asset}" alt="" />${escapeHtml(label)}</span><strong>${formatNumber(users.length)}</strong></div><p class="change-usernames">${users.length ? `${escapeHtml(preview)}${escapeHtml(remainder)}` : "Sin cambios"}</p></div>`;
}

function renderLatestChanges() {
  const projection = requireProjection();
  const latest = projection && projection.latestReport;
  const target = document.querySelector("#latest-changes");
  if (!latest || latest.isBaseline) {
    document.querySelector("#latest-change-date").textContent = "Línea base";
    target.innerHTML = '<div class="change-empty">La primera captura crea la referencia. Los cambios aparecerán desde el segundo análisis completo.</div>';
    return;
  }
  document.querySelector("#latest-change-date").textContent = formatDate(latest.capturedAt, false);
  const changes = projection.latestChanges || {};
  target.innerHTML = [
    changeGroup("Te sigue ahora", changes.newFollowers, "icons/metric-followers-v2.png", "followed-you"),
    changeGroup("Te dejó de seguir", changes.lostFollowers, "icons/metric-unfollowed-v4.png", "unfollowed-you"),
    changeGroup("Lo seguís ahora", changes.newFollowing, "icons/metric-following-v2.png", "you-followed"),
    changeGroup("Lo dejaste de seguir", changes.lostFollowing, "icons/metric-following-only-v4.png", "you-unfollowed"),
  ].join("");
}

function signedNumber(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${formatNumber(number)}` : formatNumber(number);
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

function relationshipMatchesFilter(item) { return Relationship.matchesFilter(item, state.relationshipFilter); }
function relationshipFilterCount(filter) { return Relationship.filterCount(state.relationshipTransitions, filter); }

function updateRelationshipFilterCounts() {
  document.querySelectorAll("[data-filter-count]").forEach((element) => {
    element.textContent = formatNumber(relationshipFilterCount(element.dataset.filterCount));
  });
}

function renderRelationshipCards() {
  const target = document.querySelector("#relationship-list");
  const query = state.relationshipQuery.trim().toLowerCase().replace(/^@/, "");
  const rows = state.relationshipTransitions.filter((item) => relationshipMatchesFilter(item) && (!query || item.normalized.includes(query)));
  if (!rows.length) {
    target.innerHTML = '<div class="relationship-empty">No hay personas que coincidan con este filtro en los reportes seleccionados.</div>';
    return;
  }
  target.innerHTML = rows.map((item) => `<article class="relationship-row tone-${escapeHtml(item.tone)}">
    ${profileAvatarMarkup(item.normalized, state.compareTo)}
    <div class="relationship-main"><strong>@${escapeHtml(item.username)}</strong><p>${escapeHtml(item.headline)}</p></div>
    <div class="state-comparison" aria-label="Relación anterior y actual"><div class="state-box"><span>Antes</span><strong>${escapeHtml(relationshipStateLabels.previous[item.fromState])}</strong></div><span class="state-arrow" aria-hidden="true">→</span><div class="state-box"><span>Ahora</span><strong>${escapeHtml(relationshipStateLabels.current[item.toState])}</strong></div></div>
    <a class="profile-link" href="https://www.instagram.com/${encodeURIComponent(item.normalized)}/" target="_blank" rel="noreferrer">Ver perfil</a>
  </article>`).join("");
}

function renderRelationshipList() { return Runtime.render("relationships", renderRelationshipCards); }

function renderReportComparison() {
  const projection = requireProjection();
  const reports = projection ? projection.reports : [];
  const comparison = projection ? projection.comparison : null;
  const fromSelect = document.querySelector("#compare-from");
  const toSelect = document.querySelector("#compare-to");
  const empty = document.querySelector("#compare-empty");
  const content = document.querySelector("#compare-content");

  if (reports.length < 2) {
    const options = reports.map(reportOption).join("") || "<option>Sin reportes</option>";
    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;
    fromSelect.disabled = true;
    toSelect.disabled = true;
    empty.hidden = false;
    content.hidden = true;
    state.relationshipTransitions = [];
    return;
  }

  fromSelect.disabled = false;
  toSelect.disabled = false;
  fromSelect.innerHTML = reports.map(reportOption).join("");
  toSelect.innerHTML = reports.map(reportOption).join("");
  fromSelect.value = state.compareFrom;
  toSelect.value = state.compareTo;

  if (!comparison) {
    empty.textContent = "No se pudo reconstruir una de las capturas seleccionadas.";
    empty.hidden = false;
    content.hidden = true;
    state.relationshipTransitions = [];
    return;
  }

  empty.hidden = true;
  content.hidden = false;
  document.querySelector("#compare-caption").textContent = `Antes: ${formatDate(comparison.fromReport.capturedAt)} · Ahora: ${formatDate(comparison.toReport.capturedAt)}.`;
  setDeltaTone(document.querySelector("#compare-followers-delta"), comparison.followers.delta);
  setDeltaTone(document.querySelector("#compare-following-delta"), comparison.following.delta);
  setDeltaTone(document.querySelector("#compare-mutual-delta"), comparison.mutualDelta);
  document.querySelector("#movement-followed-you").textContent = formatNumber(comparison.followers.added.length);
  document.querySelector("#movement-unfollowed-you").textContent = formatNumber(comparison.followers.removed.length);
  document.querySelector("#movement-you-followed").textContent = formatNumber(comparison.following.added.length);
  document.querySelector("#movement-you-unfollowed").textContent = formatNumber(comparison.following.removed.length);

  Runtime.emitSync("comparison:updated", { comparison, projection, state });
  updateRelationshipFilterCounts();
  renderRelationshipList();
}

function renderActivityCards() {
  const projection = requireProjection();
  const events = projection ? projection.activity : [];
  document.querySelector("#event-total").textContent = `${formatNumber(events.length)} evento${events.length === 1 ? "" : "s"}`;
  const target = document.querySelector("#activity-list");
  if (!events.length) {
    target.innerHTML = '<div class="activity-empty">Todavía no hay cambios: ejecutá un segundo análisis completo para comparar.</div>';
    return;
  }
  target.innerHTML = events.slice(0, 200).map((event) => {
    const meta = eventMeta[event.type] || { symbol: "·", tone: "neutral", title: "cambio detectado" };
    return `<article class="activity-item">${profileAvatarMarkup(event.username, event.reportId, "activity-profile-avatar")}<span class="activity-symbol ${escapeHtml(meta.tone)}">${meta.symbol}</span><div class="activity-copy"><strong>@${escapeHtml(event.username)} ${escapeHtml(meta.title)}</strong><p>${escapeHtml(formatDate(event.occurredAt))}</p><small>Reporte ${escapeHtml(event.reportId || "sin id")}</small></div></article>`;
  }).join("");
}

function renderActivity() { return Runtime.render("activity", renderActivityCards); }

function relationshipLabel(person) {
  return { mutual: "Se siguen los dos", follows_you: "Solo te sigue", you_follow: "Solo lo seguís", historical: "Ya no se siguen" }[person.relationship] || person.relationship;
}

function matchesFilter(person) {
  if (state.filter === "unfollowed") return person.hasUnfollowedYou;
  if (state.filter === "follows-you") return person.relationship === "follows_you";
  if (state.filter === "not-following-back") return person.relationship === "you_follow";
  if (state.filter === "mutual") return person.relationship === "mutual";
  if (state.filter === "historical") return person.relationship === "historical";
  const extensionResult = Runtime.matchFilter("people", state.filter, person, { state });
  return extensionResult === undefined ? true : extensionResult;
}

function renderPeopleCards() {
  const query = state.query.trim().toLowerCase().replace(/^@/, "");
  const people = state.people.filter((person) => matchesFilter(person) && (!query || person.username.toLowerCase().includes(query)));
  document.querySelector("#people-count").textContent = `${formatNumber(people.length)} persona${people.length === 1 ? "" : "s"}`;
  const target = document.querySelector("#people-list");
  if (!people.length) {
    target.innerHTML = '<div class="people-empty">No hay usuarios que coincidan con este filtro.</div>';
    return;
  }
  target.innerHTML = people.slice(0, 1000).map((person) => {
    const last = person.lastEvent;
    const meta = last ? eventMeta[last.type] || { title: "cambio detectado" } : null;
    return `<article class="person-row">${profileAvatarMarkup(person.username, null, "avatar")}<div class="person-main"><strong>@${escapeHtml(person.username)}</strong><small>${person.events.length} cambio${person.events.length === 1 ? "" : "s"} guardado${person.events.length === 1 ? "" : "s"}</small></div><span class="relationship-badge ${escapeHtml(person.relationship)}">${escapeHtml(relationshipLabel(person))}</span><div class="last-event">${last ? escapeHtml(meta.title) : "Sin cambios detectados"}${last ? `<small>${escapeHtml(formatDate(last.occurredAt))} · ${escapeHtml(last.reportId)}</small>` : ""}</div><button class="person-open" data-username="${escapeHtml(person.username)}" type="button" aria-label="Ver historial de @${escapeHtml(person.username)}">›</button></article>`;
  }).join("");
  target.querySelectorAll(".person-open").forEach((button) => button.addEventListener("click", () => openPersonDialog(button.dataset.username)));
}

function renderPeople() { return Runtime.render("people", renderPeopleCards); }
function eventLabel(type) { return eventMeta[type] ? eventMeta[type].title : "Cambio detectado"; }

function openPersonDialog(username) {
  const person = state.people.find((item) => item.username === username);
  if (!person) return;
  document.querySelector("#dialog-username").textContent = `@${person.username}`;
  document.querySelector("#dialog-relationship").textContent = `Estado actual: ${relationshipLabel(person)}. El historial conserva ${person.events.length} cambio${person.events.length === 1 ? "" : "s"} detectado${person.events.length === 1 ? "" : "s"} para esta persona.`;
  document.querySelector("#dialog-profile-link").href = `https://www.instagram.com/${encodeURIComponent(person.username)}/`;
  const events = document.querySelector("#dialog-events");
  events.innerHTML = person.events.length ? person.events.map((event) => `<article class="dialog-event"><i></i><div><strong>${escapeHtml(eventLabel(event.type))}</strong><small>${escapeHtml(formatDate(event.occurredAt))} · reporte ${escapeHtml(event.reportId || "sin id")}</small></div></article>`).join("") : '<div class="activity-empty">Esta persona aparece en la captura actual, pero todavía no tiene cambios históricos.</div>';
  document.querySelector("#person-dialog").showModal();
}

function renderAll() {
  Runtime.emitSync("render:before", { projection: state.projection, state });
  renderOverview();
  renderChart();
  renderLatestChanges();
  renderReportComparison();
  renderPeople();
  renderActivity();
  Runtime.emitSync("render:after", { projection: state.projection, state });
}

async function loadProfile(profile) {
  state.profile = Core.safeProfile(profile);
  const keys = profileKeys(state.profile);
  state.snapshot = state.storage[keys.history] || null;
  if (!state.snapshot) { await initialize(); return; }

  state.timeline = state.storage[keys.timeline] || History.appendSnapshot(null, null, state.snapshot);
  state.compareFrom = null;
  state.compareTo = null;
  state.relationshipFilter = "changed";
  state.relationshipQuery = "";
  Projection.projectState(state);
  Runtime.emitSync("profile:loaded", { profile: state.profile, projection: state.projection, state });

  fillProfileSelect();
  document.querySelector("#empty-state").hidden = true;
  document.querySelector("#dashboard-content").hidden = false;
  document.querySelector("#analyze-profile").disabled = false;
  document.querySelector("#export-toggle").disabled = false;
  document.querySelector("#relationship-search").value = "";
  document.querySelectorAll("[data-relationship-filter]").forEach((button) => button.classList.toggle("active", button.dataset.relationshipFilter === state.relationshipFilter));

  const url = new URL(location.href);
  url.searchParams.set("profile", state.profile);
  history.replaceState({}, "", url);
  renderAll();
  activateView(state.view, false);
}

async function initialize() {
  state.storage = await storageGetAll();
  state.profiles = detectProfiles(state.storage);
  state.view = validView(location.hash.replace(/^#/, "") || state.view);
  Runtime.emitSync("initialized", { state });
  if (!state.profiles.length) {
    state.profile = null;
    state.snapshot = null;
    state.timeline = null;
    state.projection = null;
    showEmpty();
    activateView(state.view, false);
    return;
  }
  const requested = Core.safeProfile(new URLSearchParams(location.search).get("profile") || "");
  await loadProfile(state.profiles.includes(requested) ? requested : state.profiles[0]);
}

const dashboardInternals = {
  buildRelationshipTransitions: Relationship.buildTransitions,
  transitionHeadline,
  relationshipStateLabels,
  relationshipFilterCount,
};

globalThis.FollowTrackerDashboardInternals = dashboardInternals;
if (typeof module === "object" && module.exports) module.exports = dashboardInternals;

if (typeof document !== "undefined") {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => activateView(button.dataset.view)));
  document.querySelector("#profile-select").addEventListener("change", (event) => loadProfile(event.target.value));
  document.querySelector("#people-search").addEventListener("input", (event) => { state.query = event.target.value; renderPeople(); });
  document.querySelector("#relationship-search").addEventListener("input", (event) => { state.relationshipQuery = event.target.value; renderRelationshipList(); });
  document.querySelector("#compare-from").addEventListener("change", (event) => { Projection.selectComparison(state, event.target.value, state.compareTo); renderReportComparison(); });
  document.querySelector("#compare-to").addEventListener("change", (event) => { Projection.selectComparison(state, state.compareFrom, event.target.value); renderReportComparison(); });
  document.querySelectorAll("[data-chart-range]").forEach((button) => button.addEventListener("click", () => {
    state.chartRange = button.dataset.chartRange;
    document.querySelectorAll("[data-chart-range]").forEach((item) => item.classList.toggle("active", item === button));
    renderChart();
  }));

  document.querySelectorAll("[data-relationship-filter]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-relationship-filter]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.relationshipFilter = button.dataset.relationshipFilter;
    renderRelationshipList();
  }));

  document.querySelectorAll("#people-filters .filter").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("#people-filters .filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderPeople();
  }));

  document.querySelector("#analyze-profile").addEventListener("click", () => {
    if (state.profile) chrome.tabs.create({ url: `https://www.instagram.com/${encodeURIComponent(state.profile)}/` });
  });
  document.querySelector("#empty-open-instagram").addEventListener("click", () => chrome.tabs.create({ url: "https://www.instagram.com/" }));
  document.querySelector("#export-toggle").addEventListener("click", () => {
    const menu = document.querySelector("#export-menu");
    menu.hidden = !menu.hidden;
    document.querySelector("#export-toggle").setAttribute("aria-expanded", String(!menu.hidden));
  });

  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => {
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
  }));

  document.querySelector("#delete-profile").addEventListener("click", async () => {
    if (!state.profile) return;
    if (!confirm(`¿Borrar todo el historial de @${state.profile}? Esta acción no se puede deshacer.`)) return;
    const keys = profileKeys(state.profile);
    await storageRemove([keys.history, keys.timeline]);
    location.href = "dashboard.html";
  });

  document.querySelector("#dialog-close").addEventListener("click", () => document.querySelector("#person-dialog").close());
  document.querySelector("#person-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  document.addEventListener("click", (event) => {
    const wrap = document.querySelector(".export-wrap");
    if (wrap && !wrap.contains(event.target)) document.querySelector("#export-menu").hidden = true;
  });
  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches("[data-profile-avatar]")) return;
    image.closest(".profile-avatar")?.classList.add("profile-avatar-failed");
    image.remove();
  }, true);
  window.addEventListener("hashchange", () => activateView(location.hash.replace(/^#/, ""), false));

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
}
