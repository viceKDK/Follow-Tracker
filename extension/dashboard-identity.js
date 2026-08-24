"use strict";

(function () {
  const Trust = globalThis.FollowTrackerTrust;
  if (!Trust) throw new Error("Follow Tracker Identity no pudo cargar Trust Core.");

  let registry = Trust.emptyIdentityRegistry("");
  let peopleMeta = { schemaVersion: 1, profile: "", people: {} };
  let captureMetadata = { schemaVersion: 1, profile: "", reports: {} };
  let selectedCanonical = "";
  let observer = null;
  let decorationScheduled = false;

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function normalizePeopleMeta(value, profile) {
    const input = value && typeof value === "object" ? value : {};
    const output = {
      schemaVersion: 1,
      profile: Trust.safeProfile(profile || input.profile),
      people: {},
      updatedAt: String(input.updatedAt || new Date(0).toISOString()),
    };
    Object.entries(input.people && typeof input.people === "object" ? input.people : {}).forEach(([username, meta]) => {
      const canonical = Trust.normalizeUsername(username);
      if (!canonical) return;
      output.people[canonical] = {
        pinned: meta && meta.pinned === true,
        note: String(meta && meta.note || ""),
        tags: [...new Set((Array.isArray(meta && meta.tags) ? meta.tags : [])
          .map((tag) => String(tag).trim().toLowerCase())
          .filter(Boolean))].slice(0, 12),
        updatedAt: String(meta && meta.updatedAt || new Date(0).toISOString()),
      };
    });
    return output;
  }

  function refreshSidecars() {
    if (!state.profile) return;
    const keys = Trust.storageKeys(state.profile);
    registry = Trust.normalizeIdentityRegistry(state.storage && state.storage[keys.identities], state.profile);
    peopleMeta = normalizePeopleMeta(state.storage && state.storage[keys.peopleMeta], state.profile);
    captureMetadata = state.storage && state.storage[keys.captureMeta] || { schemaVersion: 1, profile: state.profile, reports: {} };
  }

  function recordFor(value) {
    const username = Trust.normalizeUsername(value);
    const key = registry.aliases[username]
      || Object.keys(registry.records).find((recordKey) => registry.records[recordKey].canonicalUsername === username);
    return key ? registry.records[key] || null : null;
  }

  function canonicalFor(value) {
    const record = recordFor(value);
    return record && record.canonicalUsername || Trust.normalizeUsername(value);
  }

  function displayFor(value) {
    const record = recordFor(value);
    return record && record.currentUsername || Trust.normalizeUsername(value);
  }

  function metadataFor(value) {
    return peopleMeta.people[canonicalFor(value)] || { pinned: false, note: "", tags: [] };
  }

  function decorateRow(row) {
    const canonical = Trust.normalizeUsername(row.dataset.user || "");
    if (!canonical) return;
    const current = displayFor(canonical);
    const record = recordFor(canonical);
    const meta = metadataFor(canonical);
    const signature = JSON.stringify({ current, canonical, pinned: meta.pinned, tags: meta.tags });
    if (row.dataset.trustSignature === signature) return;
    row.dataset.trustSignature = signature;

    const strong = row.querySelector(".table-user-content strong,.person-main strong");
    if (strong) strong.textContent = `@${current}`;
    const strongParent = strong && strong.parentElement;
    if (strongParent) {
      strongParent.querySelector(":scope > .person-pin")?.remove();
      if (meta.pinned) strong.insertAdjacentHTML("afterend", '<span class="person-pin" title="Persona fijada">★</span>');
    }
    const link = row.querySelector("a.profile-link");
    if (link) link.href = `https://www.instagram.com/${encodeURIComponent(current)}/`;
    const copy = row.querySelector(".table-user-content > span:last-child,.person-main");
    if (copy) {
      copy.querySelector(".identity-renamed")?.remove();
      copy.querySelector(".person-tags")?.remove();
      if (record && record.currentUsername !== record.canonicalUsername) {
        copy.insertAdjacentHTML("beforeend", `<small class="identity-renamed">Antes @${escapeHtml(record.canonicalUsername)}</small>`);
      }
      if (meta.tags.length) {
        copy.insertAdjacentHTML("beforeend", `<span class="person-tags">${meta.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</span>`);
      }
    }
  }

  function decorateVisiblePeople() {
    decorationScheduled = false;
    document.querySelectorAll(".clickable-table-row[data-user]").forEach(decorateRow);
    const drawer = document.querySelector("#drawer-user");
    if (drawer && drawer.textContent) {
      const canonical = selectedCanonical || canonicalFor(drawer.textContent);
      const current = displayFor(canonical);
      const nextText = `@${current}`;
      if (drawer.textContent !== nextText) drawer.textContent = nextText;
      const link = document.querySelector("#drawer-link");
      const nextHref = `https://www.instagram.com/${encodeURIComponent(current)}/`;
      if (link && link.href !== nextHref) link.href = nextHref;
      renderMetaEditor(canonical);
    }
  }

  function scheduleDecoration() {
    if (decorationScheduled) return;
    decorationScheduled = true;
    requestAnimationFrame(decorateVisiblePeople);
  }

  function ensureQualityPanel() {
    const overview = document.querySelector("#overview");
    const health = document.querySelector("#data-health-panel");
    const danger = overview && overview.querySelector(".danger-zone");
    if (!overview || document.querySelector("#trust-quality-panel")) return;
    const anchor = health || danger;
    if (!anchor) return;
    anchor.insertAdjacentHTML("beforebegin", `
      <section id="trust-quality-panel" class="panel trust-quality-panel">
        <div class="trust-quality-head"><div><p class="panel-kicker">CALIDAD DE CAPTURA</p><h2>Qué tan confiable es el último reporte</h2><p id="trust-quality-copy"></p></div><div id="trust-quality-badge" class="trust-quality-badge"><strong>—</strong><small>sin datos</small></div></div>
        <div id="trust-quality-metrics" class="trust-metrics"></div>
        <div id="trust-quality-observations" class="trust-observations"></div>
      </section>`);
  }

  function qualityLabel(status) {
    return {
      trusted: "confiable",
      review: "revisar",
      suspicious: "sospechoso",
      rejected: "rechazado",
    }[status] || "heredado";
  }

  function renderQuality() {
    ensureQualityPanel();
    const panel = document.querySelector("#trust-quality-panel");
    if (!panel || !state.timeline) return;
    const latest = History.latestReport(state.timeline);
    const meta = latest && captureMetadata.reports && captureMetadata.reports[latest.id];
    const badge = document.querySelector("#trust-quality-badge");
    if (!meta) {
      badge.className = "trust-quality-badge review";
      badge.innerHTML = "<strong>—</strong><small>reporte heredado</small>";
      document.querySelector("#trust-quality-copy").textContent = "Este reporte se creó antes de que Follow Tracker guardara evidencia de cobertura y fuente.";
      document.querySelector("#trust-quality-metrics").innerHTML = "";
      document.querySelector("#trust-quality-observations").innerHTML = '<div class="trust-observation info">Las capturas nuevas mostrarán fuente, cobertura, advertencias y bajas pendientes.</div>';
      return;
    }
    const status = String(meta.status || "review");
    badge.className = `trust-quality-badge ${escapeHtml(status)}`;
    badge.innerHTML = `<strong>${formatNumber(meta.score)}/100</strong><small>${escapeHtml(qualityLabel(status))}</small>`;
    document.querySelector("#trust-quality-copy").textContent = `Fuente ${meta.source || "desconocida"}. Captura detectada el ${formatDate(meta.capturedAt)}.`;
    const metrics = [
      ["Seguidores", `${formatNumber(meta.collectedFollowers)}${Number.isFinite(meta.expectedFollowers) ? ` / ${formatNumber(meta.expectedFollowers)}` : ""}`],
      ["Cobertura seguidores", meta.followersCoverage == null ? "Sin contador" : `${Math.round(meta.followersCoverage * 1000) / 10}%`],
      ["Seguidos", `${formatNumber(meta.collectedFollowing)}${Number.isFinite(meta.expectedFollowing) ? ` / ${formatNumber(meta.expectedFollowing)}` : ""}`],
      ["Cobertura seguidos", meta.followingCoverage == null ? "Sin contador" : `${Math.round(meta.followingCoverage * 1000) / 10}%`],
    ];
    document.querySelector("#trust-quality-metrics").innerHTML = metrics
      .map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
      .join("");
    const observations = [];
    (meta.reasons || []).forEach((reason) => observations.push(`<div class="trust-observation">${escapeHtml(reason)}</div>`));
    if (meta.renames && meta.renames.length) {
      observations.push(`<div class="trust-observation info">${meta.renames.length} cambio(s) de username se unificaron mediante identidad estable.</div>`);
    }
    const pending = [
      ...(meta.pendingAbsences && meta.pendingAbsences.followers || []),
      ...(meta.pendingAbsences && meta.pendingAbsences.following || []),
    ];
    if (pending.length) {
      observations.push(`<div class="trust-observation"><strong>Bajas pendientes:</strong><div class="quality-pending-list">${pending.slice(0, 20).map((item) => `<span>@${escapeHtml(displayFor(item.username))} ${item.count}/${item.confirmAfter}</span>`).join("")}</div></div>`);
    }
    if (!observations.length) observations.push('<div class="trust-observation ok">No se detectaron anomalías importantes en esta captura.</div>');
    document.querySelector("#trust-quality-observations").innerHTML = observations.join("");
  }

  function ensureWatchlistFilter() {
    const filters = document.querySelector("#people-filters");
    if (!filters || filters.querySelector('[data-filter="watchlist"]')) return;
    filters.insertAdjacentHTML("beforeend", '<button class="filter" data-filter="watchlist" type="button">Fijados</button>');
  }

  function ensureMetaEditor() {
    const drawer = document.querySelector(".relationship-detail-drawer");
    const link = document.querySelector("#drawer-link");
    if (!drawer || !link || drawer.querySelector("#person-meta-editor")) return;
    link.insertAdjacentHTML("beforebegin", `
      <section id="person-meta-editor" class="person-meta-editor">
        <h3>Notas privadas</h3>
        <div id="person-identity-status" class="person-meta-status"></div>
        <label class="person-meta-check"><input id="person-meta-pinned" type="checkbox"> Fijar esta persona</label>
        <label>Etiquetas<input id="person-meta-tags" type="text" placeholder="amistad, trabajo, familia"></label>
        <label>Nota<textarea id="person-meta-note" placeholder="Información que quieras recordar. Solo se guarda en tu navegador."></textarea></label>
        <button id="person-meta-save" class="button button-secondary" type="button">Guardar nota</button>
        <div id="person-meta-status" class="person-meta-status" role="status" aria-live="polite"></div>
      </section>`);
  }

  function renderMetaEditor(canonicalValue) {
    ensureMetaEditor();
    const editor = document.querySelector("#person-meta-editor");
    if (!editor) return;
    const canonical = canonicalFor(canonicalValue);
    if (!canonical) return;
    const previousCanonical = Trust.normalizeUsername(editor.dataset.canonical || "");
    const meta = metadataFor(canonical);
    const signature = JSON.stringify({ canonical, pinned: meta.pinned, tags: meta.tags, note: meta.note });
    if (editor.dataset.signature === signature && document.activeElement?.closest("#person-meta-editor")) return;
    editor.dataset.signature = signature;
    editor.dataset.canonical = canonical;
    selectedCanonical = canonical;
    document.querySelector("#person-meta-pinned").checked = meta.pinned;
    document.querySelector("#person-meta-tags").value = meta.tags.join(", ");
    document.querySelector("#person-meta-note").value = meta.note;
    const record = recordFor(canonical);
    document.querySelector("#person-identity-status").textContent = record && record.previousUsernames.length > 1
      ? `Identidad unificada: ${record.previousUsernames.map((name) => `@${name}`).join(" → ")}.`
      : "";
    if (previousCanonical && previousCanonical !== canonical) {
      document.querySelector("#person-meta-status").textContent = "";
    }
  }

  async function savePersonMeta() {
    const editor = document.querySelector("#person-meta-editor");
    const canonical = editor && Trust.normalizeUsername(editor.dataset.canonical);
    if (!canonical || !state.profile) return;
    const status = document.querySelector("#person-meta-status");
    status.textContent = "Guardando…";
    const tags = document.querySelector("#person-meta-tags").value
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    peopleMeta.people[canonical] = {
      pinned: document.querySelector("#person-meta-pinned").checked,
      note: document.querySelector("#person-meta-note").value.trim(),
      tags: [...new Set(tags)].slice(0, 12),
      updatedAt: new Date().toISOString(),
    };
    peopleMeta.updatedAt = new Date().toISOString();
    const key = Trust.storageKeys(state.profile).peopleMeta;
    await storageSet({ [key]: peopleMeta });
    if (state.storage) state.storage[key] = peopleMeta;
    editor.dataset.signature = JSON.stringify({
      canonical,
      pinned: peopleMeta.people[canonical].pinned,
      tags: peopleMeta.people[canonical].tags,
      note: peopleMeta.people[canonical].note,
    });
    status.textContent = "Nota guardada localmente.";
    document.querySelectorAll(".clickable-table-row[data-user]").forEach((row) => { row.dataset.trustSignature = ""; });
    decorateVisiblePeople();
    if (state.filter === "watchlist") renderPeople();
  }

  const originalMatchesFilter = matchesFilter;
  matchesFilter = function identityMatchesFilter(person) {
    if (state.filter === "watchlist") return metadataFor(person.username).pinned;
    return originalMatchesFilter(person);
  };

  const originalLoadProfile = loadProfile;
  loadProfile = async function identityLoadProfile(profile) {
    const result = await originalLoadProfile(profile);
    refreshSidecars();
    renderQuality();
    scheduleDecoration();
    return result;
  };

  const originalRenderAll = renderAll;
  renderAll = function identityRenderAll() {
    refreshSidecars();
    originalRenderAll();
    ensureWatchlistFilter();
    renderQuality();
    scheduleDecoration();
  };

  document.addEventListener("click", (event) => {
    const row = event.target.closest(".clickable-table-row[data-user]");
    if (row) {
      selectedCanonical = canonicalFor(row.dataset.user);
      queueMicrotask(() => renderMetaEditor(selectedCanonical));
    }
    const filter = event.target.closest('#people-filters [data-filter="watchlist"]');
    if (filter) {
      document.querySelectorAll("#people-filters .filter").forEach((item) => item.classList.remove("active"));
      filter.classList.add("active");
      state.filter = "watchlist";
      renderPeople();
    }
    if (event.target.closest("#person-meta-save")) {
      savePersonMeta().catch((error) => {
        document.querySelector("#person-meta-status").textContent = error.message;
      });
    }
  });

  function startObserver() {
    if (observer) observer.disconnect();
    const target = document.querySelector("#dashboard-content") || document.body;
    observer = new MutationObserver(scheduleDecoration);
    observer.observe(target, { childList: true, subtree: true });
  }

  refreshSidecars();
  ensureWatchlistFilter();
  ensureQualityPanel();
  renderQuality();
  scheduleDecoration();
  startObserver();

  globalThis.FollowTrackerIdentityUi = {
    canonicalFor,
    decorateVisiblePeople,
    displayFor,
    metadataFor,
    normalizePeopleMeta,
    recordFor,
    refreshSidecars,
    renderQuality,
  };
})();
