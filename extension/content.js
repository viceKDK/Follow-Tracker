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
    apiMaxRepechajes: 10,
    apiNoProgressBail: 5,
  };

  const PHASES = [
    { key: "followers", hrefKey: "/followers/", labels: ["followers", "seguidores"] },
    { key: "following", hrefKey: "/following/", labels: ["following", "seguidos"] },
  ];

  let running = false;
  let aborted = false;
  let activeProfile = null;
  let lastKnownTotals = { followers: null, following: null };
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

  function injectOverlayStyles() {
    if (document.getElementById("ft-auto-overlay-style")) return;
    const style = document.createElement("style");
    style.id = "ft-auto-overlay-style";
    style.textContent = `
      #ft-auto-overlay {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        width: 320px;
        background: linear-gradient(160deg, #f7fbff, #eef8f0);
        color: #1a2a33;
        border-radius: 14px;
        padding: 0;
        font-family: "Segoe UI", Tahoma, sans-serif;
        box-shadow: 0 18px 40px rgba(15, 30, 45, 0.22), 0 2px 6px rgba(0,0,0,.08);
        overflow: hidden;
        border: 1px solid rgba(15, 60, 80, 0.08);
      }
      #ft-auto-overlay .ft-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px 8px;
        background: linear-gradient(120deg, #1177cc, #0d8f74);
        color: #fff;
      }
      #ft-auto-overlay .ft-title {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: .2px;
      }
      #ft-auto-overlay .ft-icon-btn {
        border: none;
        background: rgba(255,255,255,.18);
        color: #fff;
        border-radius: 6px;
        padding: 2px 8px;
        cursor: pointer;
        font-size: 12px;
        line-height: 1;
        margin-left: 4px;
        transition: background .15s ease;
      }
      #ft-auto-overlay .ft-icon-btn:hover { background: rgba(255,255,255,.32); }
      #ft-auto-overlay .ft-body {
        padding: 12px 14px 14px;
      }
      #ft-auto-overlay .ft-row {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin-bottom: 4px;
        color: #3a4b57;
      }
      #ft-auto-overlay .ft-row b {
        color: #0d3d4f;
        font-weight: 600;
        max-width: 60%;
        text-align: right;
        word-break: break-all;
      }
      #ft-auto-overlay .ft-status {
        font-size: 12px;
        margin: 6px 0 4px;
        padding: 6px 8px;
        border-radius: 8px;
        background: #eaf5ee;
        color: #1a5d3a;
        border: 1px solid #c6e4cf;
      }
      #ft-auto-overlay .ft-status.warn { background:#fff5e6; color:#8a4b00; border-color:#ffd9a8; }
      #ft-auto-overlay .ft-status.err { background:#ffecec; color:#a60000; border-color:#ffc4c4; }
      #ft-auto-overlay .ft-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      #ft-auto-overlay .ft-btn {
        flex: 1;
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        cursor: pointer;
        font-weight: 700;
        color: #fff;
        font-size: 12px;
        font-family: inherit;
        transition: transform .08s ease, opacity .15s ease;
      }
      #ft-auto-overlay .ft-btn-primary {
        background: linear-gradient(120deg, #1177cc, #0d8f74);
      }
      #ft-auto-overlay .ft-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
      #ft-auto-overlay .ft-btn-secondary {
        background: linear-gradient(120deg, #6b7280, #374151);
      }
      #ft-auto-overlay .ft-btn-danger {
        background: linear-gradient(120deg, #dc2626, #991b1b);
      }
      #ft-auto-overlay .ft-btn:disabled { cursor: default; opacity: .55; transform: none; }
      #ft-auto-overlay .ft-log {
        margin-top: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        max-height: 180px;
        overflow: auto;
        background: #ffffff;
        border: 1px solid #d6e3eb;
        color: #1a2a33;
        font-size: 11.5px;
        line-height: 1.55;
        font-family: "Segoe UI", Tahoma, sans-serif;
      }
      #ft-auto-overlay .ft-log .ft-log-line {
        padding: 2px 0;
        border-bottom: 1px solid #f0f4f7;
      }
      #ft-auto-overlay .ft-log .ft-log-line:last-child { border-bottom: 0; }
      #ft-auto-overlay .ft-log::-webkit-scrollbar { width: 6px; }
      #ft-auto-overlay .ft-log::-webkit-scrollbar-thumb { background: #c8d4dc; border-radius: 3px; }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if (overlay && document.body.contains(overlay)) return overlay;
    const old = document.getElementById("ft-auto-overlay");
    if (old) old.remove();
    injectOverlayStyles();
    overlay = document.createElement("div");
    overlay.id = "ft-auto-overlay";
    overlay.innerHTML = `
      <div class="ft-header">
        <div class="ft-title">Follow Tracker Auto</div>
        <div>
          <button id="ft-min" class="ft-icon-btn" title="Ocultar (volver a abrir desde el icono de la extension)">_</button>
          <button id="ft-close" class="ft-icon-btn" title="Cerrar">×</button>
        </div>
      </div>
      <div class="ft-body">
        <div class="ft-row"><span>Perfil</span><b id="ft-profile">-</b></div>
        <div class="ft-row"><span>Seguidores</span><b id="ft-followers">- / -</b></div>
        <div class="ft-row"><span>Seguidos</span><b id="ft-following">- / -</b></div>
        <div id="ft-status" class="ft-status">Listo. Pulsa Iniciar.</div>
        <div class="ft-actions">
          <button id="ft-start" class="ft-btn ft-btn-primary">Iniciar analisis</button>
          <button id="ft-cancel" class="ft-btn ft-btn-secondary" disabled>Cancelar</button>
        </div>
        <div id="ft-log" class="ft-log"></div>
      </div>
    `;
    overlay.querySelector("#ft-close").addEventListener("click", () => {
      overlay.remove();
      overlay = null;
    });
    overlay.querySelector("#ft-min").addEventListener("click", () => {
      // Oculta toda la barra. Para volver a mostrarla, click en el icono de la extension.
      overlay.style.display = "none";
    });
    overlay.querySelector("#ft-start").addEventListener("click", () => {
      if (running) return;
      runAnalysis().catch(() => { /* el overlay ya muestra el error */ });
    });
    overlay.querySelector("#ft-cancel").addEventListener("click", () => {
      if (running) aborted = true;
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function setOverlayButtonsBusy(isBusy) {
    if (!overlay) return;
    const start = overlay.querySelector("#ft-start");
    const cancel = overlay.querySelector("#ft-cancel");
    if (start) {
      start.disabled = isBusy;
      start.textContent = isBusy ? "Ejecutando..." : "Iniciar analisis";
    }
    if (cancel) {
      cancel.disabled = !isBusy;
      cancel.classList.remove("ft-btn-secondary", "ft-btn-danger");
      cancel.classList.add(isBusy ? "ft-btn-danger" : "ft-btn-secondary");
    }
  }

  const overlayCounts = { followers: { current: null, total: null }, following: { current: null, total: null } };

  function renderCount(c) {
    if (c.current == null && c.total == null) return "- / -";
    const cur = c.current ?? 0;
    if (c.total == null) return `${cur}`;
    let pctNum = c.total > 0 ? Math.floor((cur / c.total) * 100) : 0;
    if (cur >= c.total) pctNum = 100;
    if (pctNum === 100 && cur < c.total) pctNum = 99;
    const pct = c.total > 0 ? ` (${pctNum}%)` : "";
    return `${cur} / ${c.total}${pct}`;
  }

  function updateCount(phaseKey, current, total) {
    const c = overlayCounts[phaseKey];
    if (!c) return;
    if (current != null) c.current = current;
    if (total != null) c.total = total;
    const box = ensureOverlay();
    const id = phaseKey === "followers" ? "#ft-followers" : "#ft-following";
    const el = box.querySelector(id);
    if (el) el.textContent = renderCount(c);
  }

  function resetOverlayCounts() {
    overlayCounts.followers = { current: null, total: null };
    overlayCounts.following = { current: null, total: null };
    const box = ensureOverlay();
    box.querySelector("#ft-followers").textContent = "- / -";
    box.querySelector("#ft-following").textContent = "- / -";
  }

  function setOverlay(profile, _phase, _count, status, color) {
    const box = ensureOverlay();
    box.querySelector("#ft-profile").textContent = profile || "-";
    const st = box.querySelector("#ft-status");
    st.textContent = status || "";
    st.classList.remove("warn", "err");
    if (color === "#ff9a9a" || color === "#ef4444" || color === "#f87171") {
      st.classList.add("err");
    } else if (color === "#ffd166" || color === "#f59e0b") {
      st.classList.add("warn");
    }
  }

  function appendOverlayLog(text) {
    const msg = String(text || "");
    overlayLogs.push(msg);
    if (overlayLogs.length > 18) overlayLogs.shift();
    const box = ensureOverlay();
    const log = box.querySelector("#ft-log");
    log.innerHTML = overlayLogs
      .map((m) => {
        const safe = m.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div class="ft-log-line">${safe}</div>`;
      })
      .join("");
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

  function formatScrapeDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return String(iso || "");
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
    // sessionid suele ser HttpOnly (no visible via document.cookie). NO la exigimos.
    // Solo validamos lo que el content script puede leer: csrftoken y ds_user_id.
    const csrf = getCookie("csrftoken");
    const ds = getCookie("ds_user_id");
    if (!csrf && !ds) {
      throw new Error(
        "No hay cookies de sesion visibles (csrftoken y ds_user_id ausentes). Asegurate de estar logueado en instagram.com."
      );
    }
    if (!csrf) {
      // Sin csrftoken muchas APIs igual responden, pero avisamos suave.
      sendProgress("Aviso: csrftoken no detectado, intentamos API igual.");
    }
    return { csrf: csrf || "", dsUserId: ds || "" };
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
        console.warn(`[FollowTracker] red caida en ${url}:`, netErr);
        if (attempt === 1) sendProgress("Conexion inestable, reintentando...");
        await sleep(wait);
        continue;
      }
      if (res.ok) {
        try {
          return await res.json();
        } catch (parseErr) {
          console.warn(`[FollowTracker] respuesta no-JSON en ${url}:`, parseErr);
          throw new Error("Instagram devolvio una respuesta inesperada.");
        }
      }
      if (res.status === 401 || res.status === 403) {
        console.warn(`[FollowTracker] HTTP ${res.status} en ${url}`);
        throw new Error("Instagram pidio reautenticacion. Recarga la pagina e intenta de nuevo.");
      }
      if (res.status === 429 || res.status === 503 || res.status === 502 || res.status === 504) {
        const retryAfterHeader = Number(res.headers.get("retry-after")) * 1000;
        const base = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader
          : Math.min(CONFIG.apiMaxBackoffMs, 1500 * Math.pow(2, attempt - 1));
        const jitter = Math.floor(Math.random() * 600);
        const wait = base + jitter;
        console.warn(`[FollowTracker] HTTP ${res.status} en ${url}, espera ${wait}ms`);
        if (attempt === 1) {
          sendProgress(`Instagram pidio una pausa, esperando ${Math.round(wait / 1000)}s...`);
        }
        await sleep(wait);
        continue;
      }
      console.warn(`[FollowTracker] HTTP ${res.status} en ${url}`);
      throw new Error("Instagram rechazo la consulta.");
    }
    if (lastErr) console.warn("[FollowTracker] red caida:", lastErr);
    throw new Error("No se pudo conectar con Instagram tras varios reintentos.");
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
      const nextMax = json && (json.next_max_id || json.next_min_id);
      const nextMaxStr = nextMax !== undefined && nextMax !== null && nextMax !== "" ? String(nextMax) : null;
      // Mensaje user-friendly: solo "Seguidores: 200/940 (21%)" sin cursor ni paginas.
      const label = phaseKey === "followers" ? "Seguidores" : "Seguidos";
      updateCount(phaseKey, out.length, expectedCount || null);
      if (page === 1 || page % 3 === 0 || added === 0 || (expectedCount && out.length >= expectedCount)) {
        sendProgress(`${label}: ${pctText(out.length, expectedCount)}`);
      }
      const phaseLabel = phaseKey === "followers" ? "Cargando seguidores" : "Cargando seguidos";
      setOverlay(getProfileFromPath(), null, null, `${phaseLabel}...`, "#a2f3a6");
      sendBadge(out.length > 999 ? `${Math.floor(out.length / 1000)}k` : String(out.length));

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
    // Math.floor para evitar "100%" cuando en realidad es 99.58%.
    // Solo mostramos 100% si actual >= expected.
    let pct = Math.floor((actual / expected) * 100);
    if (actual >= expected) pct = 100;
    if (pct === 100 && actual < expected) pct = 99;
    return `${actual}/${expected} (${pct}%)`;
  }

  function buildCsvFromRows(rows, scrapeTime) {
    return [
      "Usuario,Nombre,Timestamp",
      ...rows.map((r) => `${escapeCsvValue(r.username)},${escapeCsvValue(r.fullName)},${scrapeTime}`),
    ].join("\n");
  }

  async function runApiMode(profile) {
    sendProgress("Conectando con Instagram...");
    let session;
    try {
      session = ensureLoggedIn();
    } catch (_e) {
      session = { csrf: getCookie("csrftoken") || "", dsUserId: getCookie("ds_user_id") || "" };
    }
    const info = await getProfileInfoApi(profile);
    if (Number.isFinite(info.followersCount)) {
      updateCount("followers", 0, info.followersCount);
      lastKnownTotals.followers = info.followersCount;
    }
    if (Number.isFinite(info.followingCount)) {
      updateCount("following", 0, info.followingCount);
      lastKnownTotals.following = info.followingCount;
    }
    sendProgress(
      `Perfil @${profile}: ${info.followersCount || "?"} seguidores, ${info.followingCount || "?"} seguidos.`
    );

    let followersRowsRaw = [];
    let followingRowsRaw = [];
    try {
      followersRowsRaw = await paginateFriendshipApi(
        info.id, "followers", info.followersCount, session.dsUserId, profile
      );
    } catch (e) {
      if (e && e.name === "AbortedError") throw e;
      console.warn("[FollowTracker] followers pase inicial fallo:", e);
      sendProgress(`Seguidores: reintentando...`);
    }
    try {
      followingRowsRaw = await paginateFriendshipApi(
        info.id, "following", info.followingCount, session.dsUserId, profile
      );
    } catch (e) {
      if (e && e.name === "AbortedError") throw e;
      console.warn("[FollowTracker] following pase inicial fallo:", e);
      sendProgress(`Seguidos: reintentando...`);
    }
    const followersRows = await mergeWithProfileCache(profile, "followers", followersRowsRaw);
    const followingRows = await mergeWithProfileCache(profile, "following", followingRowsRaw);
    if (followersRows.length === 0 && followingRows.length === 0) {
      throw new Error("API devolvio 0 usuarios en ambas listas.");
    }

    const followersOk = isCompleteEnough(followersRows.length, info.followersCount);
    const followingOk = isCompleteEnough(followingRows.length, info.followingCount);
    updateCount("followers", followersRows.length, info.followersCount);
    updateCount("following", followingRows.length, info.followingCount);
    sendProgress(`Seguidores recolectados: ${pctText(followersRows.length, info.followersCount)}`);
    sendProgress(`Seguidos recolectados: ${pctText(followingRows.length, info.followingCount)}`);

    // Loop de repechajes: insistimos hasta alcanzar el total real o agotar
    // CONFIG.apiNoProgressBail ciclos sin sumar nuevos.
    async function ensureFull(phaseKey, expected, currentRows) {
      if (!Number.isFinite(expected) || expected <= 0) return currentRows;
      const label = phaseKey === "followers" ? "Seguidores" : "Seguidos";
      const MAX = CONFIG.apiMaxRepechajes;
      let rows = currentRows;
      let lastSize = rows.length;
      let noProgress = 0;
      let netFails = 0;
      for (let r = 1; r <= MAX; r += 1) {
        if (rows.length >= expected) break;
        if (aborted) break;
        sendProgress(`${label}: reintento ${r}/${MAX} (${pctText(rows.length, expected)})...`);
        await sleep(1500 + r * 600);
        try {
          checkAbort();
          const retry = await paginateFriendshipApi(info.id, phaseKey, expected, session.dsUserId, profile);
          rows = await mergeWithProfileCache(profile, phaseKey, retry);
          updateCount(phaseKey, rows.length, expected);
          const delta = rows.length - lastSize;
          sendProgress(`${label}: ${pctText(rows.length, expected)} (+${delta} nuevos)`);
          if (rows.length >= expected) {
            sendProgress(`${label}: completado al 100%.`);
            break;
          }
          if (delta <= 0) {
            noProgress += 1;
            if (noProgress >= CONFIG.apiNoProgressBail) {
              sendProgress(
                `${label}: IG no entrega mas usuarios despues de ${noProgress} reintentos. ` +
                `Faltan ${expected - rows.length} (probablemente cuentas suspendidas o bloqueadas).`
              );
              break;
            }
          } else {
            noProgress = 0;
          }
          lastSize = rows.length;
        } catch (e) {
          if (e && e.name === "AbortedError") throw e;
          netFails += 1;
          console.warn(`[FollowTracker] ${label} reintento ${r}/${MAX} fallo:`, e);
          if (netFails < 3) {
            sendProgress(`${label}: reintento ${r}/${MAX} fallo, esperando...`);
            await sleep(3000 + netFails * 1500);
          } else {
            sendProgress(`${label}: ${pctText(rows.length, expected)} (conexion inestable, parando reintentos).`);
            break;
          }
        }
      }
      return rows;
    }

    if (Number.isFinite(info.followersCount) && info.followersCount > 0 && followersRows.length < info.followersCount) {
      const next = await ensureFull("followers", info.followersCount, followersRows);
      followersRows.length = 0;
      Array.prototype.push.apply(followersRows, next);
    }
    if (Number.isFinite(info.followingCount) && info.followingCount > 0 && followingRows.length < info.followingCount) {
      const next = await ensureFull("following", info.followingCount, followingRows);
      followingRows.length = 0;
      Array.prototype.push.apply(followingRows, next);
    }
    void followersOk; void followingOk;

    // Solo abortamos si AMBAS estan vacias o muy pobres. Si tenemos al menos 30%
    // en alguna, preferimos quedarnos en API (UI seria mas lento y peor).
    const tooLow = (a, e) => Number.isFinite(e) && e > 0 && a < Math.max(5, Math.floor(e * 0.3));
    if (
      followersRows.length === 0 && followingRows.length === 0 ||
      (tooLow(followersRows.length, info.followersCount) && tooLow(followingRows.length, info.followingCount))
    ) {
      throw new Error(
        `API entrego muy poco (${followersRows.length}/${info.followersCount || "?"} y ${followingRows.length}/${info.followingCount || "?"}). Cayendo a UI.`
      );
    }

    const ts = nowIso();
    const safeProfile = toSafeFilePart(profile);
    const followersCsvName = `ig_auto_${safeProfile}_followers_${Date.now()}.csv`;
    const followersCsv = buildCsvFromRows(followersRows, ts);
    downloadText(followersCsvName, "﻿" + followersCsv, "text/csv;charset=utf-8;");
    sendProgress(`Descargado: lista de seguidores (${followersRows.length}).`);

    const followingCsvName = `ig_auto_${safeProfile}_following_${Date.now()}.csv`;
    const followingCsv = buildCsvFromRows(followingRows, ts);
    downloadText(followingCsvName, "﻿" + followingCsv, "text/csv;charset=utf-8;");
    sendProgress(`Descargado: lista de seguidos (${followingRows.length}).`);

    const comparison = buildComparison(followersRows, followingRows);
    const totalsApi = {
      followers: Number.isFinite(info.followersCount) ? info.followersCount : followersRows.length,
      following: Number.isFinite(info.followingCount) ? info.followingCount : followingRows.length,
    };
    const reportHtml = buildExcelHtml(profile, comparison, ts, totalsApi);
    const reportName = `ig_auto_${safeProfile}_seguidores_vs_seguidos_${nowCompact()}.xls`;
    downloadText(reportName, reportHtml, "application/vnd.ms-excel;charset=utf-8;");
    sendProgress(`Descargado: reporte Excel.`);
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
    // Si nada confiable, mejor null que un numero equivocado (evita falso "incompleto").
    return null;
  }

  function isModalRouteOpen(phaseKey) {
    const path = window.location.pathname.toLowerCase();
    return path.includes(`/${phaseKey}/`);
  }

  function readExpectedFromModal(phaseKey) {
    // El header del modal abierto suele decir "X seguidores" / "X followers" / "X seguidos".
    const dialog = document.querySelector('div[role="dialog"]') || getRouteScope(phaseKey);
    if (!dialog) return null;
    const labels = phaseKey === "followers"
      ? ["seguidor", "seguidores", "follower", "followers"]
      : ["seguido", "seguidos", "following"];
    const candidates = dialog.querySelectorAll("h1, h2, h3, span, div");
    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      const txt = (el.textContent || "").toLowerCase().trim();
      if (txt.length > 60) continue;
      if (!labels.some((l) => txt.includes(l))) continue;
      const n = parseCountFromText(txt);
      if (n) return n;
    }
    // Tambien probamos atributos title="N" cerca.
    const titled = dialog.querySelectorAll("[title]");
    for (const el of titled) {
      const v = el.getAttribute("title") || "";
      const n = parseCountFromText(v);
      if (n) return n;
    }
    return null;
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
    let expectedCount = getExpectedCountFromTrigger(trigger);

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
        // Enriquecemos el expectedCount con el header del modal si el trigger no lo tenia.
        if (!Number.isFinite(expectedCount) || expectedCount <= 0) {
          const fromModal = readExpectedFromModal(phase.key);
          if (fromModal) expectedCount = fromModal;
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
    if (!Number.isFinite(expectedCount) || expectedCount <= 0) {
      const fromModal = readExpectedFromModal(phase.key);
      if (fromModal) expectedCount = fromModal;
    }
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

    // Set total inicial. Respaldos en orden: trigger -> modal -> lastKnownTotals (de runApiMode).
    if (!Number.isFinite(expectedCount) || expectedCount <= 0) {
      const fromModal = readExpectedFromModal(phase.key);
      if (fromModal) expectedCount = fromModal;
    }
    if (!Number.isFinite(expectedCount) || expectedCount <= 0) {
      const fallback = lastKnownTotals[phase.key];
      if (Number.isFinite(fallback) && fallback > 0) expectedCount = fallback;
    }
    if (Number.isFinite(expectedCount) && expectedCount > 0) {
      updateCount(phase.key, 0, expectedCount);
    } else {
      updateCount(phase.key, 0, null);
    }

    // Hidratacion: esperamos a que el modal pinte mas anchors antes de empezar.
    let initialAnchors = initialScope.querySelectorAll("a[href]").length;
    let hydrationWait = 0;
    while (hydrationWait < 12) {
      await sleep(350);
      extractUsers(container, data, phase.key);
      updateCount(phase.key, data.size, null);
      const a = (document.querySelector('div[role="dialog"]') || getRouteScope(phase.key) || container)
        .querySelectorAll("a[href]").length;
      if (a > initialAnchors) initialAnchors = a;
      if (Number.isFinite(expectedCount) && expectedCount > 0 && data.size >= expectedCount) break;
      if (Number.isFinite(expectedCount) && expectedCount <= 20 && a >= expectedCount + 1) break;
      hydrationWait += 1;
    }
    const phaseLabel = phase.key === "followers" ? "Cargando seguidores" : "Cargando seguidos";
    setOverlay(profile, null, null, `${phaseLabel}...`, "#a2f3a6");
    const lbl = phase.key === "followers" ? "Seguidores" : "Seguidos";
    sendProgress(`${lbl}: ${pctText(data.size, expectedCount)}`);

    // Caso lista corta ya completa: salimos sin meter loops de recuperacion.
    if (Number.isFinite(expectedCount) && expectedCount > 0 && data.size >= expectedCount) {
      sendProgress(`${phase.key}: lista completa al inicio (${data.size}/${expectedCount}), sin scroll.`);
    }

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
        // scroll correctivo silencioso (ruido tecnico)
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
      updateCount(phase.key, data.size, expectedCount || null);
      setOverlay(profile, null, null, `${phaseLabel}...`, "#a2f3a6");
      if (added > 0) {
        sendProgress(`${lbl}: ${pctText(data.size, expectedCount)}`);
      }
      sendBadge(data.size > 999 ? `${Math.floor(data.size / 1000)}k` : String(data.size));
      prevVisible = currVisible;

      const countUnchanged = data.size === prevCount;
      // Si llegamos al fondo del contenedor y no suma, terminamos limpio.
      const atBottom = container.scrollHeight - (container.scrollTop + (container.clientHeight || 0)) < 4;
      if (added === 0 && countUnchanged && atBottom && data.size > 0) {
        sendProgress(`${lbl}: lista completa (${data.size}).`);
        break;
      }
      if (added === 0 && countUnchanged) {
        stagnant += 1;
        if (stagnant >= CONFIG.stagnantAttempts) {
          const hasExpected = Number.isFinite(expectedCount) && expectedCount > 0;
          const clearlyIncomplete = hasExpected && data.size < Math.floor(expectedCount * 0.95);
          if (clearlyIncomplete && recoveries < 4) {
            recoveries += 1;
            sendProgress(
              `${lbl}: cargando los que faltan (${pctText(data.size, expectedCount)})...`
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
            sendProgress(`${lbl}: ultimo intento (${pctText(data.size, expectedCount)})...`);
            await deepRescan(container, data, phase.key);
            updateCount(phase.key, data.size, expectedCount || null);
            if (data.size < Math.floor(expectedCount * 0.98)) {
              sendProgress(`${lbl}: ${pctText(data.size, expectedCount)} (IG no entrega mas).`);
            } else {
              sendProgress(`${lbl}: ${pctText(data.size, expectedCount)} terminado.`);
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

  function buildExcelHtml(profile, comparison, scrapeTime, totals) {
    const nos = comparison.nos;
    const noLoSigo = comparison.noLoSigo;
    const noMeSigue = comparison.noMeSigue;
    const maxLen = Math.max(nos.length, noLoSigo.length, noMeSigue.length, 1);
    const title = "Seguidores vs Seguidos (" + profile + ")";
    const totalFollowers = totals && Number.isFinite(totals.followers) ? totals.followers : null;
    const totalFollowing = totals && Number.isFinite(totals.following) ? totals.following : null;
    const scrapeDateFmt = formatScrapeDate(scrapeTime);
    const subtitleParts = [];
    if (totalFollowers != null) subtitleParts.push(`Total seguidores: ${totalFollowers}`);
    if (totalFollowing != null) subtitleParts.push(`Total seguidos: ${totalFollowing}`);
    if (scrapeDateFmt) subtitleParts.push(`Scrapeo: ${scrapeDateFmt}`);
    const subtitle = subtitleParts.join("   |   ");
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
        r += `<Cell ss:Index="12" ss:StyleID="d"><Data ss:Type="String">${esc(scrapeDateFmt)}</Data></Cell>`;
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
      '<Style ss:ID="sub"><Font ss:Size="12" ss:Bold="1" ss:Color="#3A4B57"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>',
      `<Style ss:ID="d">${bdr}</Style>`,
      `<Style ss:ID="ds"><Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/>${bdr}</Style>`,
      "</Styles>",
      '<Worksheet ss:Name="Seguimiento Instagram">',
      `<Table ss:ExpandedColumnCount="12" ss:ExpandedRowCount="${7 + maxLen}">`,
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
      `<Row ss:Height="20"><Cell ss:Index="2" ss:MergeAcross="10" ss:StyleID="sub"><Data ss:Type="String">${esc(subtitle)}</Data></Cell></Row>`,
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
    lastKnownTotals = { followers: null, following: null };
    sendBadge("RUN", "#1fa37d");
    setOverlayButtonsBusy(true);

    try {
      const profile = activeProfile;
      resetOverlayCounts();
      setOverlay(profile, null, null, "Iniciando analisis...", "#a2f3a6");
      sendProgress(`Analizando perfil @${profile}...`);

      try {
        ensureLoggedIn();
      } catch (sessionErr) {
        // sessionid es HttpOnly y no es visible desde JS, no abortamos.
        // Si IG no autoriza, el 401 dara mensaje claro.
        if (!/HttpOnly|invisible|sessionid/i.test(sessionErr.message)) {
          sendProgress(`Aviso: ${sessionErr.message}`);
        }
      }

      let usedApi = false;
      let lastApiError = null;
      for (let attempt = 1; attempt <= CONFIG.apiMaxAttempts; attempt += 1) {
        try {
          await runApiMode(profile);
          usedApi = true;
          break;
        } catch (apiError) {
          lastApiError = apiError;
          console.warn(`[FollowTracker] intento API ${attempt} fallo:`, apiError);
          if (attempt < CONFIG.apiMaxAttempts) {
            sendProgress("Reintentando conexion...");
            await sleep(CONFIG.apiRetryDelayMs);
          }
        }
      }

      if (!usedApi) {
        if (lastApiError) console.warn("[FollowTracker] API mode fallo:", lastApiError);
        sendProgress("Cambiando a metodo alternativo...");
      }

      if (!usedApi) {
        const phaseResults = {};
        const phaseExpected = { followers: null, following: null };
        for (const phase of PHASES) {
          const phLbl = phase.key === "followers" ? "seguidores" : "seguidos";
          setOverlay(profile, null, null, `Abriendo lista de ${phLbl}...`, "#a2f3a6");
          sendProgress(`Abriendo lista de ${phLbl}...`);
          const phaseMeta = await openDialogForPhase(phase);
          const exp = phaseMeta && Number.isFinite(phaseMeta.expectedCount) ? phaseMeta.expectedCount : null;
          phaseExpected[phase.key] = exp;
          await sleep(650);
          phaseResults[phase.key] = await scrapeCurrentDialog(phase, profile, exp);
          sendProgress(`Descargado: lista de ${phLbl} (${phaseResults[phase.key].rows.length}).`);
          await closeDialog();
          await sleep(CONFIG.phaseDelayMs);
        }

        const comparison = buildComparison(phaseResults.followers.rows, phaseResults.following.rows);
        const mergedFollowersRows = await mergeWithProfileCache(profile, "followers", phaseResults.followers.rows);
        const mergedFollowingRows = await mergeWithProfileCache(profile, "following", phaseResults.following.rows);
        const mergedComparison = buildComparison(mergedFollowersRows, mergedFollowingRows);
        const scrapeTime = phaseResults.following.scrapeTimestamp || nowIso();
        const totalsUi = {
          followers: phaseExpected.followers != null ? phaseExpected.followers : mergedFollowersRows.length,
          following: phaseExpected.following != null ? phaseExpected.following : mergedFollowingRows.length,
        };
        const reportHtml = buildExcelHtml(profile, mergedComparison, scrapeTime, totalsUi);
        const reportName = `ig_auto_${toSafeFilePart(profile)}_seguidores_vs_seguidos_${nowCompact()}.xls`;
        downloadText(reportName, reportHtml, "application/vnd.ms-excel;charset=utf-8;");
        sendProgress(`Descargado: reporte Excel.`);
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
      setOverlayButtonsBusy(false);
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

  // El overlay NO se muestra solo. Aparece unicamente cuando el usuario
  // hace click en el icono de la extension (popup -> ENSURE_OVERLAY -> SHOW_OVERLAY)
  // o cuando se llama START_ANALYSIS.
  function showOverlayIfProfile() {
    if (!onProfilePage()) return false;
    const profile = getProfileFromPath();
    setOverlay(profile, null, null, running ? "Analisis en curso..." : "Listo. Pulsa Iniciar.", "#a2f3a6");
    if (overlay) overlay.style.display = "block";
    return true;
  }

  // Si el usuario navega a otro perfil mientras el overlay esta abierto,
  // refrescamos el nombre de perfil sin crear uno nuevo.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    if (overlay && document.body.contains(overlay) && onProfilePage() && !running) {
      const profile = getProfileFromPath();
      const profEl = overlay.querySelector("#ft-profile");
      if (profEl) profEl.textContent = profile;
    }
  }, 1500);

  // Hook adicional: SHOW_OVERLAY desde el popup.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "SHOW_OVERLAY") return undefined;
    const ok = showOverlayIfProfile();
    sendResponse({ ok, error: ok ? null : "No estas en un perfil." });
    return true;
  });
})();
