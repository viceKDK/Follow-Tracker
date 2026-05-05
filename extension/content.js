(function () {
  const CONFIG = {
    maxUsers: 10000,
    minWaitMs: 1200,
    maxWaitMs: 2600,
    stagnantAttempts: 14,
    phaseDelayMs: 1200,
    continuityWindow: 8,
    continuityTail: 4,
    continuityMinOverlap: 2,
    apiMaxAttempts: 3,
    apiRetryDelayMs: 1800,
    apiPageSize: 100,
    apiInterPageMs: 600,
    apiMaxBackoffMs: 30000,
    apiCompletenessRatio: 0.95,
  };

  const PHASES = [
    { key: "followers", hrefKey: "/followers/", labels: ["followers", "seguidores"] },
    { key: "following", hrefKey: "/following/", labels: ["following", "seguidos"] },
  ];

  let running = false;
  let aborted = false;
  let activeProfile = null;
  let overlay = null;
  const overlayLogs = [];

  class AbortedError extends Error {
    constructor(reason) {
      super(reason || "Cancelado por el usuario.");
      this.name = "AbortedError";
    }
  }

  function checkAbort() {
    if (aborted) throw new AbortedError();
    if (activeProfile && getProfileFromPath() !== activeProfile) {
      throw new AbortedError(`Cambio de perfil detectado (${activeProfile} -> ${getProfileFromPath()}).`);
    }
  }

  function ensureOverlay() {
    if (overlay && document.body.contains(overlay)) return overlay;
    const old = document.getElementById("ft-auto-overlay");
    if (old) old.remove();
    overlay = document.createElement("div");
    overlay.id = "ft-auto-overlay";
    overlay.style.cssText = [
      "position:fixed",
      "top:20px",
      "right:20px",
      "z-index:2147483647",
      "width:320px",
      "background:rgba(10,18,28,.92)",
      "color:#d9f2ff",
      "border:2px solid #1fa37d",
      "border-radius:12px",
      "padding:10px",
      "font-family:Segoe UI,Arial,sans-serif",
      "box-shadow:0 10px 24px rgba(0,0,0,.35)",
    ].join(";");
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="font-size:14px;font-weight:700;color:#7de8c6;">Follow Tracker Auto</div>
        <button id="ft-close" style="border:none;background:#ef4444;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px;">X</button>
      </div>
      <div style="font-size:12px;margin-bottom:4px;">Perfil: <span id="ft-profile">-</span></div>
      <div style="font-size:12px;margin-bottom:4px;">Fase: <span id="ft-phase">-</span></div>
      <div style="font-size:12px;margin-bottom:4px;">Usuarios: <span id="ft-count">0</span></div>
      <div id="ft-status" style="font-size:12px;color:#a2f3a6;">Iniciando...</div>
      <div id="ft-log" style="margin-top:8px;max-height:120px;overflow:auto;background:rgba(255,255,255,.05);padding:6px;border-radius:8px;font-size:11px;line-height:1.35;"></div>
    `;
    overlay.querySelector("#ft-close").addEventListener("click", () => {
      overlay.remove();
      overlay = null;
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function setOverlay(profile, phase, count, status, color) {
    const box = ensureOverlay();
    box.querySelector("#ft-profile").textContent = profile || "-";
    box.querySelector("#ft-phase").textContent = phase || "-";
    box.querySelector("#ft-count").textContent = String(count ?? 0);
    const st = box.querySelector("#ft-status");
    st.textContent = status || "";
    if (color) st.style.color = color;
  }

  function appendOverlayLog(text) {
    const msg = String(text || "");
    overlayLogs.push(msg);
    if (overlayLogs.length > 16) overlayLogs.shift();
    const box = ensureOverlay();
    const log = box.querySelector("#ft-log");
    log.textContent = overlayLogs.join("\n");
    log.scrollTop = log.scrollHeight;
  }

  function sendProgress(text) {
    try { chrome.runtime.sendMessage({ source: "content", type: "progress", text }); } catch (_e) {}
    appendOverlayLog(text);
  }

  function sendDone() {
    try { chrome.runtime.sendMessage({ source: "content", type: "done" }); } catch (_e) {}
  }

  function sendError(text) {
    try { chrome.runtime.sendMessage({ source: "content", type: "error", text }); } catch (_e) {}
  }

  function sendBadge(text, color) {
    try {
      chrome.runtime.sendMessage({
        source: "content",
        type: "badge",
        text: String(text || "").slice(0, 4),
        color: color || "#1fa37d",
      });
    } catch (_e) {}
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      const total = Math.max(0, ms);
      const tick = 200;
      let elapsed = 0;
      const id = setInterval(() => {
        if (aborted) {
          clearInterval(id);
          resolve();
          return;
        }
        elapsed += tick;
        if (elapsed >= total) {
          clearInterval(id);
          resolve();
        }
      }, Math.min(tick, total || tick));
      if (total === 0) {
        clearInterval(id);
        resolve();
      }
    });
  }

  function randomSleep() {
    const ms = Math.floor(Math.random() * (CONFIG.maxWaitMs - CONFIG.minWaitMs + 1)) + CONFIG.minWaitMs;
    return sleep(ms);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function nowCompact() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function getCookie(name) {
    const parts = document.cookie.split(";").map((x) => x.trim());
    for (const p of parts) {
      if (p.startsWith(`${name}=`)) return decodeURIComponent(p.slice(name.length + 1));
    }
    return "";
  }

  function getApiHeaders() {
    const claim = getCookie("ig_www_claim") || "0";
    return {
      "x-csrftoken": getCookie("csrftoken"),
      "x-ig-app-id": "936619743392459",
      "x-asbd-id": "129477",
      "x-ig-www-claim": claim,
      "x-requested-with": "XMLHttpRequest",
      accept: "*/*",
      "accept-language": navigator.language || "es-ES,es;q=0.9,en;q=0.8",
    };
  }

  function ensureLoggedIn() {
    const csrf = getCookie("csrftoken");
    const ds = getCookie("ds_user_id");
    const sid = getCookie("sessionid");
    if (!csrf || !ds || !sid) {
      throw new Error(
        "No hay sesion activa de Instagram en este navegador. Inicia sesion en instagram.com y reintenta."
      );
    }
    return { csrf, dsUserId: ds };
  }

  function buildRankToken(dsUserId) {
    const seed = `${dsUserId || "anon"}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return seed;
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (obj) => resolve(obj && obj[key] ? obj[key] : null));
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve());
    });
  }

  function cacheKeyForProfile(profile) {
    return `ft_cache_${toSafeFilePart(profile)}`;
  }

  function mergeRowsByUsername(aRows, bRows) {
    const map = new Map();
    (aRows || []).forEach((r) => {
      if (!r || !r.username) return;
      map.set(r.username, { username: r.username, fullName: r.fullName || "Sin Nombre" });
    });
    (bRows || []).forEach((r) => {
      if (!r || !r.username) return;
      map.set(r.username, { username: r.username, fullName: r.fullName || "Sin Nombre" });
    });
    return Array.from(map.values()).sort((x, y) => x.username.localeCompare(y.username));
  }

  async function mergeWithProfileCache(profile, phaseKey, rows) {
    const key = cacheKeyForProfile(profile);
    const cache = (await storageGet(key)) || { followers: [], following: [], updatedAt: null };
    const prevRows = Array.isArray(cache[phaseKey]) ? cache[phaseKey] : [];
    const merged = mergeRowsByUsername(prevRows, rows || []);
    cache[phaseKey] = merged;
    cache.updatedAt = new Date().toISOString();
    await storageSet({ [key]: cache });
    sendProgress(`${phaseKey}: cache acumulada ${merged.length} usuarios`);
    return merged;
  }

  async function igFetchJson(url, opts) {
    const referer = (opts && opts.referer) || `${location.origin}/`;
    const maxAttempts = (opts && opts.maxAttempts) || 6;
    let attempt = 0;
    let lastErr = null;
    while (attempt < maxAttempts) {
      attempt += 1;
      let res;
      try {
        res = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: { ...getApiHeaders(), referer },
        });
      } catch (netErr) {
        lastErr = netErr;
        const wait = Math.min(CONFIG.apiMaxBackoffMs, 800 * Math.pow(2, attempt - 1));
        sendProgress(`Red caida (${netErr.message || "error"}), reintento ${attempt}/${maxAttempts} en ${wait}ms`);
        await sleep(wait);
        continue;
      }
      if (res.ok) {
        try {
          return await res.json();
        } catch (parseErr) {
          throw new Error(`API ${url}: respuesta no JSON (${parseErr.message || "parse error"}).`);
        }
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`API ${res.status}: sesion no autorizada para ${url}. Reabre instagram.com logueado.`);
      }
      if (res.status === 429 || res.status === 503 || res.status === 502 || res.status === 504) {
        const retryAfterHeader = Number(res.headers.get("retry-after")) * 1000;
        const base = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader
          : Math.min(CONFIG.apiMaxBackoffMs, 1500 * Math.pow(2, attempt - 1));
        const jitter = Math.floor(Math.random() * 600);
        const wait = base + jitter;
        sendProgress(`API ${res.status} (rate limit), espera ${wait}ms, reintento ${attempt}/${maxAttempts}`);
        await sleep(wait);
        continue;
      }
      throw new Error(`API ${res.status} en ${url}`);
    }
    throw lastErr || new Error(`API agotada tras ${maxAttempts} reintentos: ${url}`);
  }

  async function getProfileInfoApi(username) {
    const url = `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    const referer = `${location.origin}/${username}/`;
    let json;
    try {
      json = await igFetchJson(url, { referer });
    } catch (e) {
      if (/API 404/.test(e.message)) {
        throw new Error(`El perfil @${username} no existe o fue eliminado.`);
      }
      throw e;
    }
    const user = json && json.data && json.data.user;
    if (!user || !user.id) {
      throw new Error(`No se pudo obtener user_id de @${username} (¿perfil oculto o renombrado?).`);
    }
    if (user.is_private && !user.followed_by_viewer) {
      throw new Error("Cuenta privada y no la sigues: no se puede listar via API.");
    }
    return {
      id: user.id,
      isPrivate: !!user.is_private,
      followersCount: (user.edge_followed_by && user.edge_followed_by.count) || null,
      followingCount: (user.edge_follow && user.edge_follow.count) || null,
    };
  }

  function mapApiUser(u) {
    const username = normalizeUsernameCandidate(u && u.username);
    if (!username) return null;
    const fullName = String((u && u.full_name) || "Sin Nombre").trim() || "Sin Nombre";
    return { username, fullName };
  }

  async function paginateFriendshipApi(userId, phaseKey, expectedCount, dsUserId, profile) {
    const out = [];
    const seen = new Set();
    let maxId = null;
    let page = 0;
    let emptyStreak = 0;
    const rankToken = buildRankToken(dsUserId);
    const referer = `${location.origin}/${profile}/${phaseKey === "followers" ? "followers" : "following"}/`;
    const endpoint = phaseKey === "followers" ? "followers" : "following";
    const targetCap = Number.isFinite(expectedCount) && expectedCount > 0
      ? Math.max(expectedCount + 200, Math.ceil(expectedCount * 1.05))
      : CONFIG.maxUsers;

    while (page < 600 && out.length < targetCap) {
      checkAbort();
      const qs = new URLSearchParams();
      qs.set("count", String(CONFIG.apiPageSize));
      qs.set("rank_token", rankToken);
      qs.set("search_surface", "follow_list_page");
      if (maxId) qs.set("max_id", String(maxId));
      const url = `/api/v1/friendships/${userId}/${endpoint}/?${qs.toString()}`;

      const json = await igFetchJson(url, { referer });
      const users = Array.isArray(json && json.users) ? json.users : [];

      let added = 0;
      users.forEach((u) => {
        const m = mapApiUser(u);
        if (!m) return;
        if (seen.has(m.username)) return;
        seen.add(m.username);
        out.push(m);
        added += 1;
      });

      page += 1;
      // Throttle de logs: cada 3 paginas o si hay cambio significativo.
      if (page % 3 === 0 || added === 0 || (expectedCount && out.length >= expectedCount)) {
        sendProgress(
          `${phaseKey} [API]: ${out.length} usuarios (+${added})` +
            (expectedCount ? ` de ${expectedCount}` : "") +
            ` p${page}`
        );
      }
      setOverlay(getProfileFromPath(), `${phaseKey} api`, out.length, `Pagina ${page} (+${added})`, "#a2f3a6");
      sendBadge(out.length > 999 ? `${Math.floor(out.length / 1000)}k` : String(out.length));

      const nextMax = json && (json.next_max_id || json.next_min_id);
      const nextMaxStr = nextMax !== undefined && nextMax !== null && nextMax !== "" ? String(nextMax) : null;

      if (added === 0 && (!users || users.length === 0)) {
        emptyStreak += 1;
      } else {
        emptyStreak = 0;
      }

      // Fin de paginacion: la senal autoritativa es next_max_id ausente.
      if (!nextMaxStr) break;
      // Salvavidas: si IG devuelve la misma cursor varias veces sin sumar, cortamos.
      if (nextMaxStr === maxId && added === 0) break;
      if (emptyStreak >= 2) break;

      maxId = nextMaxStr;
      const jitter = Math.floor(Math.random() * 350);
      await sleep(CONFIG.apiInterPageMs + jitter);
    }

    return out;
  }

  function isCompleteEnough(actual, expected) {
    if (!Number.isFinite(expected) || expected <= 0) return true;
    // Tolerancia generosa: IG puede ocultar cuentas suspendidas/privadas o
    // contar duplicados. Aceptamos >=95% sin abortar.
    const minAllowed = Math.floor(expected * CONFIG.apiCompletenessRatio);
    return actual >= Math.max(1, minAllowed);
  }

  function pctText(actual, expected) {
    if (!Number.isFinite(expected) || expected <= 0) return `${actual}`;
    const pct = Math.round((actual / expected) * 100);
    return `${actual}/${expected} (${pct}%)`;
  }

  function buildCsvFromRows(rows, scrapeTime) {
    return [
      "Usuario,Nombre,Timestamp",
      ...rows.map((r) => `${escapeCsvValue(r.username)},${escapeCsvValue(r.fullName)},${scrapeTime}`),
    ].join("\n");
  }

  async function runApiMode(profile) {
    sendProgress("Intentando modo API...");
    const session = ensureLoggedIn();
    const info = await getProfileInfoApi(profile);
    sendProgress(
      `API profile ok: user_id=${info.id}, followers=${info.followersCount || "?"}, following=${info.followingCount || "?"}`
    );

    const followersRowsRaw = await paginateFriendshipApi(
      info.id,
      "followers",
      info.followersCount,
      session.dsUserId,
      profile
    );
    const followingRowsRaw = await paginateFriendshipApi(
      info.id,
      "following",
      info.followingCount,
      session.dsUserId,
      profile
    );
    const followersRows = await mergeWithProfileCache(profile, "followers", followersRowsRaw);
    const followingRows = await mergeWithProfileCache(profile, "following", followingRowsRaw);
    if (followersRows.length === 0 && followingRows.length === 0) {
      throw new Error("API devolvio 0 usuarios en ambas listas.");
    }

    const followersOk = isCompleteEnough(followersRows.length, info.followersCount);
    const followingOk = isCompleteEnough(followingRows.length, info.followingCount);
    sendProgress(`Followers ${pctText(followersRows.length, info.followersCount)}`);
    sendProgress(`Following ${pctText(followingRows.length, info.followingCount)}`);

    // Si una de las dos quedo claramente bajo el umbral, intentamos un repechaje
    // antes de aceptar el resultado parcial.
    if (!followersOk && Number.isFinite(info.followersCount) && info.followersCount > 0) {
      sendProgress(`Followers parcial (<${Math.round(CONFIG.apiCompletenessRatio * 100)}%), repechaje API...`);
      const retry = await paginateFriendshipApi(
        info.id,
        "followers",
        info.followersCount,
        session.dsUserId,
        profile
      );
      const merged = await mergeWithProfileCache(profile, "followers", retry);
      followersRows.length = 0;
      Array.prototype.push.apply(followersRows, merged);
      sendProgress(`Repechaje followers ${pctText(followersRows.length, info.followersCount)}`);
    }
    if (!followingOk && Number.isFinite(info.followingCount) && info.followingCount > 0) {
      sendProgress(`Following parcial (<${Math.round(CONFIG.apiCompletenessRatio * 100)}%), repechaje API...`);
      const retry = await paginateFriendshipApi(
        info.id,
        "following",
        info.followingCount,
        session.dsUserId,
        profile
      );
      const merged = await mergeWithProfileCache(profile, "following", retry);
      followingRows.length = 0;
      Array.prototype.push.apply(followingRows, merged);
      sendProgress(`Repechaje following ${pctText(followingRows.length, info.followingCount)}`);
    }

    // Solo abortamos si ambas estan absurdamente bajas (<50%) — ahi conviene el UI fallback.
    const half = (a, e) => Number.isFinite(e) && e > 0 && a < Math.floor(e * 0.5);
    if (half(followersRows.length, info.followersCount) && half(followingRows.length, info.followingCount)) {
      throw new Error(
        `API muy incompleto en ambas listas (${followersRows.length}/${info.followersCount} y ${followingRows.length}/${info.followingCount}). Cayendo a UI.`
      );
    }

    const ts = nowIso();
    const safeProfile = toSafeFilePart(profile);
    const followersCsvName = `ig_auto_${safeProfile}_followers_${Date.now()}.csv`;
    const followersCsv = buildCsvFromRows(followersRows, ts);
    downloadText(followersCsvName, "﻿" + followersCsv, "text/csv;charset=utf-8;");
    sendProgress(`CSV followers descargado: ${followersCsvName}`);

    const followingCsvName = `ig_auto_${safeProfile}_following_${Date.now()}.csv`;
    const followingCsv = buildCsvFromRows(followingRows, ts);
    downloadText(followingCsvName, "﻿" + followingCsv, "text/csv;charset=utf-8;");
    sendProgress(`CSV following descargado: ${followingCsvName}`);

    const comparison = buildComparison(followersRows, followingRows);
    const reportHtml = buildExcelHtml(profile, comparison, ts);
    const reportName = `ig_auto_${safeProfile}_seguidores_vs_seguidos_${nowCompact()}.xls`;
    downloadText(reportName, reportHtml, "application/vnd.ms-excel;charset=utf-8;");
    sendProgress(`Excel compatible descargado: ${reportName}`);
  }

  function toSafeFilePart(text) {
    return String(text || "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  function escapeCsvValue(value) {
    const s = String(value ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function normalizeUsernameCandidate(text) {
    const raw = String(text || "").trim().toLowerCase();
    if (!raw) return null;
    const cleaned = raw.replace(/^@+/, "").replace(/[^a-z0-9._]/g, "");
    if (!cleaned) return null;
    if (!/^[a-z0-9._]+$/.test(cleaned)) return null;
    if (cleaned.length < 2) return null;
    return cleaned;
  }

  function collectVisibleUsernames(scopeEl) {
    const names = [];
    const seen = new Set();
    const root = scopeEl || document;

    const anchors = root.querySelectorAll("a[href]");
    anchors.forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href) return;
      let path = href;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        try {
          path = new URL(href).pathname;
        } catch (_e) {
          return;
        }
      }
      const username = normalizeUsernameCandidate(path.split("/").filter(Boolean)[0] || "");
      if (!username) return;
      if (seen.has(username)) return;
      seen.add(username);
      names.push(username);
    });

    if (names.length === 0) {
      const rows = root.querySelectorAll("li, div[role='button'], div[role='listitem']");
      rows.forEach((row) => {
        const text = (row.innerText || "").trim();
        if (!text) return;
        const first = text.split("\n").map((x) => x.trim()).filter(Boolean)[0] || "";
        const username = normalizeUsernameCandidate(first);
        if (!username) return;
        if (seen.has(username)) return;
        seen.add(username);
        names.push(username);
      });
    }

    return names;
  }

  function continuityOverlap(prevVisible, currVisible) {
    if (!prevVisible || !currVisible) return CONFIG.continuityMinOverlap;
    const prevTail = prevVisible.slice(-CONFIG.continuityTail);
    const currHead = currVisible.slice(0, CONFIG.continuityWindow);
    let overlap = 0;
    prevTail.forEach((u) => {
      if (currHead.includes(u)) overlap += 1;
    });
    return overlap;
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getProfileFromPath() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] || "perfil";
  }

  function onProfilePage() {
    if (!window.location.hostname.includes("instagram.com")) return false;
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return false;
    const first = parts[0];
    const blocked = new Set([
      "explore",
      "accounts",
      "reels",
      "direct",
      "stories",
      "challenge",
      "about",
      "developers",
      "legal",
      "api",
      "p",
      "tv",
    ]);
    if (blocked.has(first)) return false;
    return /^[a-zA-Z0-9._]+$/.test(first);
  }

  function findPhaseTrigger(phase) {
    const profile = getProfileFromPath();
    const strictHrefA = document.querySelector(`a[href='/${profile}/${phase.key}/']`);
    if (strictHrefA) return strictHrefA;
    const strictHrefB = document.querySelector(`a[href^='/${profile}/${phase.key}/?']`);
    if (strictHrefB) return strictHrefB;

    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const byHref = anchors.find((a) => (a.getAttribute("href") || "").includes(phase.hrefKey));
    if (byHref) return byHref;

    const clickable = Array.from(document.querySelectorAll("a, button"));
    return clickable.find((el) => {
      const txt = (el.textContent || "").toLowerCase().trim();
      return phase.labels.some((label) => txt.includes(label));
    });
  }

  async function waitFor(predicate, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return true;
      await sleep(150);
    }
    return false;
  }

  function parseCountFromText(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/\./g, "").replace(/,/g, "");
    const match = cleaned.match(/(\d{1,9})/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  }

  function getExpectedCountFromTrigger(trigger) {
    if (!trigger) return null;
    // 1) atributo title="N" (Instagram lo usa para el numero exacto)
    const titleEl = trigger.querySelector("span[title], [title]");
    if (titleEl) {
      const titleVal = titleEl.getAttribute("title");
      const fromTitle = parseCountFromText(titleVal);
      if (fromTitle) return fromTitle;
    }
    if (trigger.getAttribute && trigger.getAttribute("title")) {
      const fromOwnTitle = parseCountFromText(trigger.getAttribute("title"));
      if (fromOwnTitle) return fromOwnTitle;
    }
    // 2) primer span con numero como texto directo (no concatenado con etiquetas hermanas)
    const spans = trigger.querySelectorAll("span");
    for (const sp of spans) {
      const direct = sp.childNodes && Array.from(sp.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent || "")
        .join("");
      const n = parseCountFromText(direct);
      if (n) return n;
    }
    // 3) texto propio del trigger (sin descender a hermanos del contenedor)
    const ownText = parseCountFromText(trigger.textContent || "");
    if (ownText) return ownText;
    return null;
  }

  function isModalRouteOpen(phaseKey) {
    const path = window.location.pathname.toLowerCase();
    return path.includes(`/${phaseKey}/`);
  }

  function getRouteScope(phaseKey) {
    // En el caso "modal como ruta" (no hay role=dialog), el listado se renderiza
    // dentro de un contenedor del main. Devolvemos el mejor scope disponible.
    const scope =
      document.querySelector('div[role="dialog"]') ||
      document.querySelector("main section") ||
      document.querySelector("main") ||
      document.body;
    return scope;
  }

  async function openDialogForPhase(phase) {
    const trigger = findPhaseTrigger(phase);
    const expectedCount = getExpectedCountFromTrigger(trigger);

    // Camino preferido: click en el trigger y esperar role=dialog.
    if (trigger) {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      const okDialog = await waitFor(() => !!document.querySelector('div[role="dialog"]'), 9000);
      if (okDialog) {
        const hasAnyListAnchor = !!document.querySelector(
          'div[role="dialog"] a[href^="/"], div[role="dialog"] a[href*="instagram.com/"]'
        );
        if (!hasAnyListAnchor && trigger.parentElement) {
          trigger.parentElement.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          await waitFor(
            () => !!document.querySelector(
              'div[role="dialog"] a[href^="/"], div[role="dialog"] a[href*="instagram.com/"]'
            ),
            5000
          );
        }
        return { expectedCount, mode: "dialog" };
      }
    }

    // Fallback: abrir como ruta (history.pushState). IG soporta /usuario/followers/.
    const profile = getProfileFromPath();
    const targetPath = `/${profile}/${phase.key}/`;
    sendProgress(`No abrio role=dialog, intentando ruta ${targetPath}`);
    try {
      history.pushState({}, "", targetPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (_e) {
      window.location.href = targetPath;
    }
    const okRoute = await waitFor(() => {
      if (document.querySelector('div[role="dialog"]')) return true;
      const scope = getRouteScope(phase.key);
      const anchors = scope ? scope.querySelectorAll('a[href^="/"]').length : 0;
      return isModalRouteOpen(phase.key) && anchors > 5;
    }, 12000);
    if (!okRoute) throw new Error(`No se abrio el listado de ${phase.key} (ni dialog ni ruta).`);
    return {
      expectedCount,
      mode: document.querySelector('div[role="dialog"]') ? "dialog" : "route",
    };
  }

  async function closeDialog() {
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) {
      const closeBtn =
        dialog.querySelector('button[aria-label="Cerrar"]') ||
        dialog.querySelector('button[aria-label="Close"]') ||
        dialog.querySelector('svg[aria-label="Cerrar"]') ||
        dialog.querySelector('svg[aria-label="Close"]');
      if (closeBtn) {
        closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        await waitFor(() => !document.querySelector('div[role="dialog"]'), 3000);
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await waitFor(() => !document.querySelector('div[role="dialog"]'), 3000);
      }
    }
    // Si estamos en /usuario/followers/ o /usuario/following/ volver al perfil.
    const path = window.location.pathname.toLowerCase();
    if (/\/(followers|following)\/?$/.test(path)) {
      const profile = getProfileFromPath();
      try {
        history.pushState({}, "", `/${profile}/`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch (_e) {
        // ignorar
      }
      await sleep(600);
    }
  }

  function isLikelyScrollable(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const hasOverflow = style.overflowY === "auto" || style.overflowY === "scroll";
    const hasSize = el.scrollHeight > el.clientHeight + 20;
    return hasOverflow || hasSize;
  }

  function scoreContainer(el) {
    if (!el) return -1;
    const userLinks = el.querySelectorAll('a[href^="/"]').length;
    const heightScore = Math.min(el.scrollHeight, 30000) / 1000;
    const overflowBonus = isLikelyScrollable(el) ? 10 : 0;
    return userLinks * 5 + heightScore + overflowBonus;
  }

  function canScrollElement(el) {
    if (!el) return false;
    const before = el.scrollTop;
    el.scrollTop = before + 250;
    const changed = el.scrollTop !== before;
    el.scrollTop = before;
    return changed;
  }

  function getActiveScope(phaseKey) {
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) return { scope: dialog, kind: "dialog" };
    const route = getRouteScope(phaseKey);
    if (route) return { scope: route, kind: "route" };
    throw new Error("No hay dialogo ni ruta abiertos.");
  }

  function getScrollableCandidates(phaseKey) {
    const { scope, kind } = getActiveScope(phaseKey);

    const dialogSelectors = [
      'div[role="dialog"] ._aano',
      'div[role="dialog"] div[style*="overflow"]',
      'div[role="dialog"] div[class*="scroll"]',
      'div[role="dialog"] [role="dialog"]',
      'div[role="dialog"] > div > div',
    ];
    const routeSelectors = [
      "main div[style*='overflow']",
      "main div[class*='scroll']",
      "main section",
    ];
    const selectors = kind === "dialog" ? dialogSelectors : routeSelectors;

    const seen = new Set();
    const candidates = [];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (seen.has(el)) continue;
        seen.add(el);
        candidates.push(el);
      }
    }

    for (const el of scope.querySelectorAll("div")) {
      if (seen.has(el)) continue;
      if (!isLikelyScrollable(el)) continue;
      seen.add(el);
      candidates.push(el);
    }

    // Si nada califica, usamos el scope mismo y window como ultimo recurso.
    if (candidates.length === 0) {
      candidates.push(scope);
      candidates.push(document.scrollingElement || document.documentElement);
    }

    candidates.sort((a, b) => scoreContainer(b) - scoreContainer(a));
    return candidates;
  }

  function findScrollableContainer(phaseKey) {
    const candidates = getScrollableCandidates(phaseKey);
    for (const el of candidates) {
      if (canScrollElement(el)) {
        return el;
      }
    }
    return candidates[0];
  }

  function extractUsers(container, map, phaseKey) {
    const dialog =
      document.querySelector('div[role="dialog"]') ||
      (phaseKey ? getRouteScope(phaseKey) : null) ||
      container;
    const links = dialog.querySelectorAll("a[href]");
    let added = 0;

    // 1) Escaneo por links (rápido y fiable cuando href existe).
    links.forEach((el) => {
      const href = el.getAttribute("href") || "";
      if (!href) return;
      const lower = href.toLowerCase();
      if (
        lower.includes("/p/") ||
        lower.includes("/reel/") ||
        lower.includes("/stories/") ||
        lower.includes("/explore/") ||
        lower.includes("/accounts/")
      ) {
        return;
      }

      let path = href;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        try {
          path = new URL(href).pathname;
        } catch (_e) {
          return;
        }
      }
      if (!path.startsWith("/")) return;
      const username = normalizeUsernameCandidate(path.split("/").filter(Boolean)[0] || "");
      if (!username || !/^[a-zA-Z0-9._]+$/.test(username)) return;
      if (map.has(username)) return;

      let fullName = "Sin Nombre";
      const text = (el.innerText || "").trim();
      if (text && text.toLowerCase() !== username.toLowerCase()) {
        fullName = (text.split("\n")[0] || "").trim() || "Sin Nombre";
      }
      map.set(username, { username, fullName });
      added += 1;
    });

    // 2) Escaneo 1x1 por filas visibles (fallback para virtualizacion sin href estable).
    const rows = dialog.querySelectorAll("li, div[role='button'], div[role='listitem']");
    void phaseKey;
    rows.forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const text = (row.innerText || "").trim();
      if (!text) return;
      const lines = text
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      if (lines.length === 0) return;

      // Tomamos la primera línea como posible username.
      const username = normalizeUsernameCandidate(lines[0]);
      if (!username) return;
      if (map.has(username)) return;

      // Evitar capturar textos UI.
      if (
        username.includes("follow") ||
        username.includes("seguir") ||
        username.includes("message") ||
        username.includes("enviar")
      ) {
        return;
      }

      const fullName = lines.length > 1 ? (lines[1] || "").trim() || "Sin Nombre" : "Sin Nombre";
      map.set(username, { username, fullName });
      added += 1;
    });

    return added;
  }

  async function slowSweep(container, map, phaseKey) {
    // Barrido lento para listas virtualizadas: recorre en pasos pequenos
    // para evitar saltarse celdas que cargan tarde.
    let totalAdded = 0;
    container.scrollTop = 0;
    await sleep(700);
    totalAdded += extractUsers(container, map, phaseKey);

    const step = Math.max(180, Math.floor(container.clientHeight * 0.35));
    let guard = 0;
    while (guard < 2500) {
      const before = container.scrollTop;
      container.scrollTop = Math.min(container.scrollTop + step, container.scrollHeight);
      container.dispatchEvent(new WheelEvent("wheel", { deltaY: step, bubbles: true }));
      await sleep(320);
      totalAdded += extractUsers(container, map, phaseKey);
      if (container.scrollTop === before) break;
      guard += 1;
    }
    sendProgress(`${phaseKey}: barrido lento completo (+${totalAdded})`);
    return totalAdded;
  }

  async function deepRescan(container, map, phaseKey) {
    // Reescaneo profundo: 2 pasadas completas con pasos muy cortos.
    let totalAdded = 0;
    const passes = 2;
    for (let p = 1; p <= passes; p += 1) {
      container.scrollTop = 0;
      await sleep(900);
      totalAdded += extractUsers(container, map, phaseKey);

      const step = Math.max(120, Math.floor(container.clientHeight * 0.22));
      let guard = 0;
      while (guard < 5000) {
        const before = container.scrollTop;
        container.scrollTop = Math.min(container.scrollTop + step, container.scrollHeight);
        container.dispatchEvent(new WheelEvent("wheel", { deltaY: step, bubbles: true }));
        await sleep(420);
        totalAdded += extractUsers(container, map, phaseKey);
        if (container.scrollTop === before) break;
        guard += 1;
      }
      sendProgress(`${phaseKey}: deep-rescan pasada ${p}/${passes} (+${totalAdded})`);
    }
    return totalAdded;
  }

  async function scrapeCurrentDialog(phase, profile, expectedCount) {
    const data = new Map();
    let candidates = getScrollableCandidates(phase.key);
    let activeIndex = 0;
    let container = candidates[activeIndex] || findScrollableContainer(phase.key);
    let stagnant = 0;
    let prevCount = 0;
    let recoveries = 0;
    const initialScope =
      document.querySelector('div[role="dialog"]') || getRouteScope(phase.key) || container;
    let prevVisible = collectVisibleUsernames(initialScope);

    // Toma inicial de elementos visibles antes de empezar a mover.
    extractUsers(container, data, phase.key);
    const initialAnchors = initialScope.querySelectorAll("a[href]").length;
    setOverlay(profile, phase.key, data.size, "Recolectando...", "#a2f3a6");
    sendProgress(
      `${phase.key}: ${data.size} usuarios (inicio, anchors=${initialAnchors}, esperado=${expectedCount || "?"})`
    );

    while (data.size < CONFIG.maxUsers) {
      checkAbort();
      const startTop = container.scrollTop;
      const jump = Math.max(700, Math.floor((container.clientHeight || 600) * 0.8));
      // Micro-scroll en 3 pasos para no saltar filas virtualizadas.
      for (let i = 0; i < 3; i += 1) {
        const mini = Math.floor(jump / 3);
        container.scrollTop = Math.min(container.scrollTop + mini, container.scrollHeight);
        if (typeof container.scrollBy === "function") container.scrollBy(0, mini);
        container.dispatchEvent(new WheelEvent("wheel", { deltaY: mini, bubbles: true }));
        await sleep(180);
      }
      if (container.scrollTop === startTop) {
        container.scrollTop = startTop + jump;
        // Si seguimos sin movernos (window scrolling), forzar window.scrollBy.
        if (container.scrollTop === startTop) {
          window.scrollBy(0, jump);
        }
      }
      await randomSleep();

      const liveScope =
        document.querySelector('div[role="dialog"]') || getRouteScope(phase.key) || container;
      const currVisible = collectVisibleUsernames(liveScope);
      const overlap = continuityOverlap(prevVisible, currVisible);
      if (prevVisible.length > 0 && currVisible.length > 0 && overlap < CONFIG.continuityMinOverlap) {
        sendProgress(
          `${phase.key}: continuidad baja (${overlap}/${CONFIG.continuityTail}), aplicando scroll correctivo`
        );
        container.scrollTop = Math.max(0, container.scrollTop - Math.floor((container.clientHeight || 600) * 0.6));
        await sleep(700);
        const mini = Math.max(160, Math.floor((container.clientHeight || 600) * 0.25));
        for (let k = 0; k < 3; k += 1) {
          container.scrollTop = Math.min(container.scrollTop + mini, container.scrollHeight);
          await sleep(260);
          extractUsers(container, data, phase.key);
        }
      }

      const added = extractUsers(container, data, phase.key);
      setOverlay(profile, phase.key, data.size, `En curso (+${added})`, "#a2f3a6");
      // Throttle logs cada 5 ciclos o si suma usuarios.
      if (added > 0 || prevCount !== data.size || stagnant === 0) {
        sendProgress(`${phase.key}: ${data.size} usuarios (+${added})`);
      }
      sendBadge(data.size > 999 ? `${Math.floor(data.size / 1000)}k` : String(data.size));
      prevVisible = currVisible;

      const countUnchanged = data.size === prevCount;
      if (added === 0 && countUnchanged) {
        stagnant += 1;
        if (stagnant >= CONFIG.stagnantAttempts) {
          const hasExpected = Number.isFinite(expectedCount) && expectedCount > 0;
          const clearlyIncomplete = hasExpected && data.size < Math.floor(expectedCount * 0.95);
          if (clearlyIncomplete && recoveries < 4) {
            recoveries += 1;
            sendProgress(
              `${phase.key}: atascado en ${data.size}/${expectedCount}, intento recuperacion ${recoveries}/4`
            );
            container.scrollTop = Math.max(0, container.scrollTop - (container.clientHeight || 600) * 4);
            await sleep(1200 + recoveries * 400);
            container.scrollTop = container.scrollHeight;
            container.dispatchEvent(new WheelEvent("wheel", { deltaY: 1800, bubbles: true }));
            await sleep(3000 + recoveries * 800);
            await slowSweep(container, data, phase.key);

            candidates = getScrollableCandidates(phase.key);
            let switched = false;
            for (let idx = 0; idx < candidates.length; idx += 1) {
              if (idx === activeIndex) continue;
              const beforeTry = data.size;
              const candidate = candidates[idx];
              candidate.scrollTop = candidate.scrollHeight;
              candidate.dispatchEvent(new WheelEvent("wheel", { deltaY: 1400, bubbles: true }));
              await sleep(1200);
              await slowSweep(candidate, data, phase.key);
              if (data.size > beforeTry) {
                activeIndex = idx;
                container = candidate;
                switched = true;
                sendProgress(`${phase.key}: cambio a contenedor alternativo #${idx}`);
                break;
              }
            }
            if (!switched) {
              await sleep(1800 + recoveries * 600);
            }
            stagnant = 0;
            continue;
          }
          if (clearlyIncomplete) {
            sendProgress(`${phase.key}: ejecutando deep-rescan final (${data.size}/${expectedCount})`);
            await deepRescan(container, data, phase.key);
            if (data.size < Math.floor(expectedCount * 0.98)) {
              sendProgress(
                `${phase.key}: final parcial ${data.size}/${expectedCount} (Instagram no entrego mas items visibles)`
              );
            }
          }
          break;
        }
      } else {
        stagnant = 0;
      }
      prevCount = data.size;
    }

    const ts = nowIso();
    const rows = Array.from(data.values());
    const csv = [
      "Usuario,Nombre,Timestamp",
      ...rows.map((r) => `${escapeCsvValue(r.username)},${escapeCsvValue(r.fullName)},${ts}`),
    ].join("\n");
    const filename = `ig_auto_${toSafeFilePart(profile)}_${phase.key}_${Date.now()}.csv`;
    downloadText(filename, "﻿" + csv, "text/csv;charset=utf-8;");
    return { phase: phase.key, rows, filename, scrapeTimestamp: ts };
  }

  function buildComparison(followersRows, followingRows) {
    const followersSet = new Set(followersRows.map((r) => r.username));
    const followingSet = new Set(followingRows.map((r) => r.username));

    // Reglas:
    // Nos seguimos: en ambos sets
    // No lo sigo: me sigue pero yo no lo sigo => followers - following
    // No me sigue: yo lo sigo pero el no me sigue => following - followers
    const nos = [...followersSet].filter((u) => followingSet.has(u)).sort();
    const noLoSigo = [...followersSet].filter((u) => !followingSet.has(u)).sort();
    const noMeSigue = [...followingSet].filter((u) => !followersSet.has(u)).sort();

    return { nos, noLoSigo, noMeSigue };
  }

  function buildExcelHtml(profile, comparison, scrapeTime) {
    const nos = comparison.nos;
    const noLoSigo = comparison.noLoSigo;
    const noMeSigue = comparison.noMeSigue;
    const maxLen = Math.max(nos.length, noLoSigo.length, noMeSigue.length, 1);
    const title = "Seguidores vs Seguidos (" + profile + ")";
    const esc = (s) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const bdr =
      "<Borders>" +
      '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>' +
      '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>' +
      '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>' +
      '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>' +
      "</Borders>";

    const dataRows = [];
    for (let i = 0; i < maxLen; i += 1) {
      const s = i % 2 === 1 ? "ds" : "d";
      let r = "<Row>";
      r += `<Cell ss:Index="2" ss:StyleID="${s}"><Data ss:Type="String">${esc(nos[i] || "")}</Data></Cell>`;
      r += `<Cell ss:Index="4" ss:StyleID="${s}"><Data ss:Type="String">${esc(noLoSigo[i] || "")}</Data></Cell>`;
      r += `<Cell ss:Index="6" ss:StyleID="${s}"><Data ss:Type="String">${esc(noMeSigue[i] || "")}</Data></Cell>`;
      r += `<Cell ss:Index="8" ss:StyleID="${s}"><Data ss:Type="String"></Data></Cell>`;
      r += `<Cell ss:Index="10" ss:StyleID="${s}"><Data ss:Type="String"></Data></Cell>`;
      if (i === 0) {
        r += `<Cell ss:Index="12" ss:StyleID="d"><Data ss:Type="String">${esc(scrapeTime)}</Data></Cell>`;
      }
      r += "</Row>";
      dataRows.push(r);
    }

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?mso-application progid="Excel.Sheet"?>',
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
      ' xmlns:o="urn:schemas-microsoft-com:office:office"',
      ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
      ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
      "<Styles>",
      '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>',
      '<Style ss:ID="t"><Font ss:Size="24" ss:Bold="1" ss:Color="#2E75B6"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>',
      `<Style ss:ID="h1"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#4F81BD" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>${bdr}</Style>`,
      `<Style ss:ID="h2"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#E46C0A" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>${bdr}</Style>`,
      `<Style ss:ID="h3"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#C00000" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>${bdr}</Style>`,
      `<Style ss:ID="h4"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#92D050" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>${bdr}</Style>`,
      `<Style ss:ID="h5"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#00B0F0" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>${bdr}</Style>`,
      `<Style ss:ID="h6"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6A1B9A" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>${bdr}</Style>`,
      `<Style ss:ID="d">${bdr}</Style>`,
      `<Style ss:ID="ds"><Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/>${bdr}</Style>`,
      "</Styles>",
      '<Worksheet ss:Name="Seguimiento Instagram">',
      `<Table ss:ExpandedColumnCount="12" ss:ExpandedRowCount="${6 + maxLen}">`,
      '<Column ss:Index="1" ss:Width="37.5"/>',
      '<Column ss:Index="2" ss:Width="225"/>',
      '<Column ss:Index="3" ss:Width="75"/>',
      '<Column ss:Index="4" ss:Width="225"/>',
      '<Column ss:Index="5" ss:Width="75"/>',
      '<Column ss:Index="6" ss:Width="225"/>',
      '<Column ss:Index="7" ss:Width="75"/>',
      '<Column ss:Index="8" ss:Width="225"/>',
      '<Column ss:Index="9" ss:Width="75"/>',
      '<Column ss:Index="10" ss:Width="225"/>',
      '<Column ss:Index="11" ss:Width="75"/>',
      '<Column ss:Index="12" ss:Width="180"/>',
      `<Row ss:Height="25"><Cell ss:Index="2" ss:MergeAcross="10" ss:MergeDown="2" ss:StyleID="t"><Data ss:Type="String">${esc(title)}</Data></Cell></Row>`,
      '<Row ss:Height="25"/>',
      '<Row ss:Height="25"/>',
      "<Row/>",
      "<Row/>",
      "<Row>",
      `<Cell ss:Index="2" ss:StyleID="h1"><Data ss:Type="String">Nos seguimos (${nos.length})</Data></Cell>`,
      `<Cell ss:Index="4" ss:StyleID="h2"><Data ss:Type="String">No lo sigo (${noLoSigo.length})</Data></Cell>`,
      `<Cell ss:Index="6" ss:StyleID="h3"><Data ss:Type="String">No me sigue (${noMeSigue.length})</Data></Cell>`,
      '<Cell ss:Index="8" ss:StyleID="h4"><Data ss:Type="String">Nuevos Seguidores (0)</Data></Cell>',
      '<Cell ss:Index="10" ss:StyleID="h5"><Data ss:Type="String">Nuevos Siguiendo (0)</Data></Cell>',
      '<Cell ss:Index="12" ss:StyleID="h6"><Data ss:Type="String">Ultimo Scrapeo</Data></Cell>',
      "</Row>",
      ...dataRows,
      "</Table>",
      '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">',
      "<DoNotDisplayGridlines/>",
      "</WorksheetOptions>",
      "</Worksheet>",
      "</Workbook>",
    ].join("\n");
  }

  async function runAnalysis() {
    if (running) throw new Error("Ya hay un analisis en curso.");
    if (!onProfilePage()) {
      throw new Error("Abre Instagram en el perfil objetivo (ej: instagram.com/usuario/).");
    }
    running = true;
    aborted = false;
    activeProfile = getProfileFromPath();
    sendBadge("RUN", "#1fa37d");

    try {
      const profile = activeProfile;
      setOverlay(profile, "preparando", 0, "Iniciando analisis...", "#a2f3a6");
      sendProgress(`Perfil detectado: ${profile}`);

      try {
        ensureLoggedIn();
        sendProgress("Sesion de Instagram detectada.");
      } catch (sessionErr) {
        // No abortamos: el modo UI puede funcionar leyendo el DOM aun con sesion debil.
        sendProgress(`Aviso sesion: ${sessionErr.message}`);
      }

      let usedApi = false;
      let lastApiError = null;
      for (let attempt = 1; attempt <= CONFIG.apiMaxAttempts; attempt += 1) {
        try {
          sendProgress(`Intento API ${attempt}/${CONFIG.apiMaxAttempts}...`);
          await runApiMode(profile);
          usedApi = true;
          break;
        } catch (apiError) {
          lastApiError = apiError;
          sendProgress(`Intento API ${attempt} fallo: ${apiError.message}`);
          if (attempt < CONFIG.apiMaxAttempts) {
            await sleep(CONFIG.apiRetryDelayMs);
          }
        }
      }

      if (!usedApi) {
        sendProgress(
          `Modo API fallo tras ${CONFIG.apiMaxAttempts} intentos: ${
            (lastApiError && lastApiError.message) || "error desconocido"
          }`
        );
        sendProgress("Pasando a modo UI...");
      }

      if (!usedApi) {
        const phaseResults = {};
        for (const phase of PHASES) {
          setOverlay(profile, phase.key, 0, `Abriendo ${phase.key}...`, "#a2f3a6");
          sendProgress(`Abriendo ${phase.key}...`);
          const phaseMeta = await openDialogForPhase(phase);
          await sleep(650);
          phaseResults[phase.key] = await scrapeCurrentDialog(
            phase,
            profile,
            phaseMeta && Number.isFinite(phaseMeta.expectedCount) ? phaseMeta.expectedCount : null
          );
          sendProgress(`CSV ${phase.key} descargado: ${phaseResults[phase.key].filename}`);
          await closeDialog();
          await sleep(CONFIG.phaseDelayMs);
        }

        const comparison = buildComparison(phaseResults.followers.rows, phaseResults.following.rows);
        const mergedFollowersRows = await mergeWithProfileCache(profile, "followers", phaseResults.followers.rows);
        const mergedFollowingRows = await mergeWithProfileCache(profile, "following", phaseResults.following.rows);
        const mergedComparison = buildComparison(mergedFollowersRows, mergedFollowingRows);
        const scrapeTime = phaseResults.following.scrapeTimestamp || nowIso();
        const reportHtml = buildExcelHtml(profile, mergedComparison, scrapeTime);
        const reportName = `ig_auto_${toSafeFilePart(profile)}_seguidores_vs_seguidos_${nowCompact()}.xls`;
        downloadText(reportName, reportHtml, "application/vnd.ms-excel;charset=utf-8;");
        sendProgress(`Excel compatible descargado: ${reportName}`);
        setOverlay(
          profile,
          "completo",
          mergedComparison.nos.length + mergedComparison.noLoSigo.length + mergedComparison.noMeSigue.length,
          "Finalizado (modo UI)",
          "#7de8c6"
        );
      } else {
        setOverlay(profile, "completo", 0, "Finalizado (modo API)", "#7de8c6");
      }

      sendDone();
      sendBadge("OK", "#16a34a");
    } catch (error) {
      if (error instanceof AbortedError) {
        setOverlay(getProfileFromPath(), "cancelado", 0, error.message, "#ffd166");
        sendProgress(`Cancelado: ${error.message}`);
        sendDone();
        sendBadge("CXL", "#f59e0b");
        return;
      }
      setOverlay(getProfileFromPath(), "error", 0, `Error: ${error.message || "desconocido"}`, "#ff9a9a");
      sendError(error.message || "Error desconocido.");
      sendBadge("ERR", "#ef4444");
      throw error;
    } finally {
      running = false;
      activeProfile = null;
      aborted = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return undefined;
    if (msg.type === "CANCEL_ANALYSIS") {
      if (running) {
        aborted = true;
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "No hay analisis en curso." });
      }
      return true;
    }
    if (msg.type === "PING") {
      sendResponse({ ok: true, running, profile: activeProfile });
      return true;
    }
    if (msg.type !== "START_ANALYSIS") return undefined;

    runAnalysis()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));

    return true;
  });
})();
