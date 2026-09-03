(function (root, factory) {
  const trust = root && root.FollowTrackerTrust ? root.FollowTrackerTrust : (typeof module === "object" && module.exports ? require("./trust-core.js") : null);
  const api = factory(trust); if (typeof module === "object" && module.exports) module.exports = api; if (root) root.FollowTrackerInstagramApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Trust) {
  "use strict";
  if (!Trust) throw new Error("Follow Tracker Instagram API no pudo cargar Trust Core.");
  const DEFAULTS = Object.freeze({ pageSize: 100, maxPages: 1200, maxUsers: 100000, maxAttempts: 5,
    timeoutMs: 20000, interPageMs: 450, maxBackoffMs: 30000 });

  function profileFromLocation(locationValue) {
    const locationObject = locationValue || (typeof location !== "undefined" ? location : null);
    if (!locationObject) return "";
    const first = String(locationObject.pathname || "").split("/").filter(Boolean)[0] || "";
    const blocked = new Set(["explore", "accounts", "reels", "direct", "stories", "challenge", "about", "developers", "legal", "api", "p", "tv"]);
    return /^[a-zA-Z0-9._]+$/.test(first) && !blocked.has(first.toLowerCase()) ? first.toLowerCase() : "";
  }

  function cookie(name) {
    if (typeof document === "undefined") return "";
    const prefix = `${name}=`;
    const part = String(document.cookie || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
    return part ? decodeURIComponent(part.slice(prefix.length)) : "";
  }

  function headers() {
    return { "x-csrftoken": cookie("csrftoken"), "x-ig-app-id": "936619743392459", "x-asbd-id": "129477",
      "x-ig-www-claim": cookie("ig_www_claim") || "0", "x-requested-with": "XMLHttpRequest", accept: "*/*",
      "accept-language": typeof navigator !== "undefined" && navigator.language ? navigator.language : "es-ES,es;q=0.9,en;q=0.8" };
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(new DOMException("Cancelado", "AbortError")); return; }
      const id = setTimeout(resolve, Math.max(0, ms));
      if (signal) signal.addEventListener("abort", () => { clearTimeout(id); reject(new DOMException("Cancelado", "AbortError")); }, { once: true });
    });
  }

  async function requestJson(url, options) {
    const settings = { ...DEFAULTS, ...(options || {}) };
    let lastError = null;
    for (let attempt = 1; attempt <= settings.maxAttempts; attempt += 1) {
      if (settings.signal && settings.signal.aborted) throw new DOMException("Cancelado", "AbortError");
      const controller = new AbortController();
      const abortFromParent = () => controller.abort();
      if (settings.signal) settings.signal.addEventListener("abort", abortFromParent, { once: true });
      const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
      try {
        const response = await fetch(url, { method: "GET", credentials: "include",
          headers: { ...headers(), referer: settings.referer || `${location.origin}/` }, signal: controller.signal });
        if (response.ok) return await response.json();
        if (response.status === 401 || response.status === 403) throw new Error("Instagram pidió volver a iniciar sesión o no permite ver esas listas.");
        if ([429, 502, 503, 504].includes(response.status)) {
          const retryHeader = Number(response.headers.get("retry-after")) * 1000;
          const wait = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : Math.min(settings.maxBackoffMs, 1200 * Math.pow(2, attempt - 1));
          settings.onRetry && settings.onRetry({ attempt, status: response.status, wait });
          await sleep(wait + Math.floor(Math.random() * 400), settings.signal);
          continue;
        }
        throw new Error(`Instagram rechazó la consulta (HTTP ${response.status}).`);
      } catch (error) {
        if (settings.signal && settings.signal.aborted) throw new DOMException("Cancelado", "AbortError");
        lastError = error && error.name === "AbortError" ? new Error("Instagram demoró demasiado en responder.") : error;
        if (attempt >= settings.maxAttempts) break;
        const wait = Math.min(settings.maxBackoffMs, 900 * Math.pow(2, attempt - 1));
        settings.onRetry && settings.onRetry({ attempt, status: null, wait, error: lastError });
        await sleep(wait, settings.signal);
      } finally {
        clearTimeout(timeout);
        if (settings.signal) settings.signal.removeEventListener("abort", abortFromParent);
      }
    }
    throw lastError || new Error("No se pudo conectar con Instagram.");
  }

  async function profileInfo(profile, options) {
    const json = await requestJson(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(profile)}`,
      { ...(options || {}), referer: `${location.origin}/${profile}/` });
    const user = json && json.data && json.data.user;
    if (!user || !user.id) throw new Error(`Instagram no devolvió información válida para @${profile}.`);
    if (user.is_private && !user.followed_by_viewer) throw new Error("La cuenta es privada y la sesión actual no puede ver sus listas.");
    return { id: String(user.id), username: Trust.normalizeUsername(user.username || profile), isPrivate: Boolean(user.is_private),
      avatarUrl: Trust.normalizeAvatarUrl(user.profile_pic_url_hd || user.profile_pic_url),
      followersCount: Number.isFinite(Number(user.edge_followed_by && user.edge_followed_by.count)) ? Number(user.edge_followed_by.count) : null,
      followingCount: Number.isFinite(Number(user.edge_follow && user.edge_follow.count)) ? Number(user.edge_follow.count) : null };
  }

  function apiUser(value) {
    if (!value || typeof value !== "object") return null;
    return Trust.normalizeUser({ instagramUserId: value.pk_id || value.pk || value.id, username: value.username,
      fullName: value.full_name, profilePicUrl: value.profile_pic_url }, "api");
  }

  async function collectPhase(userId, phase, expected, profile, options) {
    const settings = { ...DEFAULTS, ...(options || {}) };
    const endpoint = phase === "followers" ? "followers" : "following";
    const users = [];
    const seen = new Set();
    const rankToken = `${cookie("ds_user_id") || "anon"}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let maxId = "";
    let pages = 0;
    let retries = 0;
    let emptyPages = 0;
    let inputRecords = 0;
    let invalidRecords = 0;
    let duplicateRecords = 0;
    let terminationReason = "";

    while (pages < settings.maxPages && users.length < settings.maxUsers) {
      if (settings.signal && settings.signal.aborted) throw new DOMException("Cancelado", "AbortError");
      const query = new URLSearchParams({ count: String(settings.pageSize), rank_token: rankToken, search_surface: "follow_list_page" });
      if (maxId) query.set("max_id", maxId);
      const json = await requestJson(`/api/v1/friendships/${userId}/${endpoint}/?${query}`, {
        ...settings, referer: `${location.origin}/${profile}/${endpoint}/`,
        onRetry(info) { retries += 1; settings.onRetry && settings.onRetry({ ...info, phase }); },
      });
      const pageUsers = Array.isArray(json && json.users) ? json.users : [];
      inputRecords += pageUsers.length;
      let added = 0;
      pageUsers.forEach((value) => {
        if (users.length >= settings.maxUsers) return;
        const user = apiUser(value);
        if (!user) { invalidRecords += 1; return; }
        const key = user.instagramUserId ? `id:${user.instagramUserId}` : `username:${user.username}`;
        if (seen.has(key)) { duplicateRecords += 1; return; }
        seen.add(key); users.push(user); added += 1;
      });
      pages += 1;
      settings.onProgress && settings.onProgress({ phase, count: users.length, expected, pages });
      emptyPages = !pageUsers.length || added === 0 ? emptyPages + 1 : 0;
      const next = json && (json.next_max_id || json.next_min_id);
      const nextId = next == null || next === "" ? "" : String(next);
      if (!nextId) { terminationReason = "end_of_pagination"; break; }
      if (nextId === maxId) { terminationReason = "repeated_cursor"; break; }
      if (emptyPages >= 2) { terminationReason = "stalled"; break; }
      maxId = nextId;
      await sleep(settings.interPageMs + Math.floor(Math.random() * 250), settings.signal);
    }
    if (!terminationReason) terminationReason = pages >= settings.maxPages ? "max_pages" : users.length >= settings.maxUsers ? "max_users" : "stopped";
    const normalized = Trust.uniqueUsers(users, "api");
    return { users: normalized, pages, retries, paginationCompleted: terminationReason === "end_of_pagination", terminationReason,
      metrics: { inputRecords, validRecords: inputRecords - invalidRecords, invalidRecords, missingUsernameRecords: invalidRecords,
        duplicateRecords, capturedCount: normalized.length, expectedCount: expected !== null && expected !== undefined && expected !== "" && Number.isFinite(Number(expected)) ? Number(expected) : null,
        pages, paginationCompleted: terminationReason === "end_of_pagination", terminationReason } };
  }

  async function collectProfile(profileValue, options) {
    const profile = Trust.safeProfile(profileValue);
    const settings = { ...DEFAULTS, ...(options || {}) };
    const startedAt = Date.now();
    const info = await profileInfo(profile, settings);
    settings.onProfile && settings.onProfile(info);
    const followers = await collectPhase(info.id, "followers", info.followersCount, profile, settings);
    const following = await collectPhase(info.id, "following", info.followingCount, profile, settings);
    const warnings = [];
    const followerCoverage = Trust.coverage(followers.users.length, info.followersCount);
    const followingCoverage = Trust.coverage(following.users.length, info.followingCount);
    if (followerCoverage != null && followerCoverage < 0.95) warnings.push(`Instagram entregó ${followers.users.length} de ${info.followersCount} seguidores.`);
    if (followingCoverage != null && followingCoverage < 0.95) warnings.push(`Instagram entregó ${following.users.length} de ${info.followingCount} seguidos.`);
    if (!followers.paginationCompleted) warnings.push(`La paginación de seguidores terminó por ${followers.terminationReason}.`);
    if (!following.paginationCompleted) warnings.push(`La paginación de seguidos terminó por ${following.terminationReason}.`);
    return { source: "api", profile, profileId: info.id, followers: followers.users, following: following.users,
      expectedFollowers: info.followersCount, expectedFollowing: info.followingCount, durationMs: Date.now() - startedAt,
      retries: followers.retries + following.retries, captureMetrics: { followers: followers.metrics, following: following.metrics },
      completeness: { phases: { followers: { paginationCompleted: followers.paginationCompleted },
        following: { paginationCompleted: following.paginationCompleted } } }, warnings };
  }

  return { DEFAULTS, apiUser, collectPhase, collectProfile, cookie, headers, profileFromLocation, profileInfo, requestJson };
});
