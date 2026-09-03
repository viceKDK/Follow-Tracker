(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerFollowerDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODEL_SCHEMA_VERSION = 1;
  const SNAPSHOT_SCHEMA_VERSION = 3;
  const TIMELINE_SCHEMA_VERSION = 2;
  const MAX_REPORTS = 400;
  const MAX_EVENTS = 100000;
  const EVENT_TYPES = Object.freeze({
    FOLLOWED_YOU: "followed_you", UNFOLLOWED_YOU: "unfollowed_you",
    YOU_FOLLOWED: "you_followed", YOU_UNFOLLOWED: "you_unfollowed",
  });
  const RELATIONSHIP_STATES = Object.freeze({
    MUTUAL: "mutual", FOLLOWS_YOU: "follows_you", YOU_FOLLOW: "you_follow",
    NONE: "none", HISTORICAL: "historical",
  });
  const STATE_LABELS = Object.freeze({
    current: Object.freeze({ mutual: "Se siguen los dos", follows_you: "Solo te sigue",
      you_follow: "Solo lo seguís", none: "No se siguen", historical: "Ya no se siguen" }),
    previous: Object.freeze({ mutual: "Se seguían los dos", follows_you: "Solo te seguía",
      you_follow: "Solo lo seguías", none: "No se seguían", historical: "Ya no se seguían" }),
  });

  function safeProfile(value) {
    return String(value || "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "perfil";
  }

  function isoOrNow(value) {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toISOString()
      : new Date().toISOString();
  }

  function normalizeUsername(value) {
    const raw = typeof value === "string"
      ? value
      : value && (value.username || value.value || value.handle || value.user_name || value.href);
    return String(raw || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
      .split(/[/?#]/)[0]
      .replace(/[^a-zA-Z0-9._]/g, "")
      .toLowerCase();
  }

  function normalizeInstagramId(value) {
    const raw = value && typeof value === "object"
      ? value.instagramUserId || value.instagram_user_id || value.pk || value.pk_id || value.id
      : value;
    const text = String(raw == null ? "" : raw).trim();
    return /^\d+$/.test(text) ? text : "";
  }

  function normalizeAvatarUrl(value) {
    const object = value && typeof value === "object" ? value : {};
    const raw = typeof value === "string"
      ? value
      : object.avatarUrl || object.avatar_url || object.profilePicUrl || object.profile_pic_url;
    const text = String(raw || "").trim();
    if (!text) return "";
    try {
      const url = new URL(text);
      return url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function normalizeUser(value, source) {
    const username = normalizeUsername(value);
    if (!username) return null;
    const object = value && typeof value === "object" ? value : {};
    const aliases = Array.isArray(object.aliases)
      ? object.aliases.map(normalizeUsername).filter(Boolean)
      : [];
    return {
      instagramUserId: normalizeInstagramId(object),
      username,
      fullName: String(object.fullName || object.full_name || object.name || object.title || "").trim(),
      avatarUrl: normalizeAvatarUrl(object),
      aliases: [...new Set([username, ...aliases])],
      source: String(source || object.source || "unknown"),
    };
  }

  function userIdentityKey(user) {
    return user && user.instagramUserId
      ? `id:${user.instagramUserId}`
      : `username:${user && user.username || "unknown"}`;
  }

  function uniqueUsers(rows, source) {
    const byIdentity = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const user = normalizeUser(row, source);
      if (!user) return;
      const key = userIdentityKey(user);
      const current = byIdentity.get(key);
      byIdentity.set(key, current
        ? {
            ...current,
            username: user.username || current.username,
            fullName: user.fullName || current.fullName,
            avatarUrl: user.avatarUrl || current.avatarUrl,
            aliases: [...new Set([...(current.aliases || []), ...(user.aliases || [])])],
            source: user.source || current.source,
          }
        : user);
    });

    // Si una fuente no trae ID, el username es la identidad disponible. Si una
    // misma cuenta llegó una vez con ID y otra sin él, preferimos el registro con ID.
    const byUsername = new Map();
    [...byIdentity.values()].forEach((user) => {
      const current = byUsername.get(user.username);
      if (!current || (!current.instagramUserId && user.instagramUserId)) {
        byUsername.set(user.username, user);
        return;
      }
      byUsername.set(user.username, {
        ...current,
        fullName: user.fullName || current.fullName,
        avatarUrl: user.avatarUrl || current.avatarUrl,
        aliases: [...new Set([...(current.aliases || []), ...(user.aliases || [])])],
      });
    });

    return [...byUsername.values()].sort((a, b) => a.username.localeCompare(b.username));
  }

  function uniqueUsernames(rows) {
    return uniqueUsers((Array.isArray(rows) ? rows : []).map((row) =>
      typeof row === "string" ? { username: row } : row
    )).map((user) => user.username);
  }

  function usernameMap() {
    const map = new Map();
    Array.from(arguments).forEach((rows) => {
      (Array.isArray(rows) ? rows : []).forEach((value) => {
        const normalized = normalizeUsername(value);
        if (normalized) map.set(normalized, normalized);
      });
    });
    return map;
  }

  function usernameSet(rows) {
    return new Set(uniqueUsernames(rows));
  }

  return { MODEL_SCHEMA_VERSION, SNAPSHOT_SCHEMA_VERSION, TIMELINE_SCHEMA_VERSION, MAX_REPORTS, MAX_EVENTS,
    EVENT_TYPES, RELATIONSHIP_STATES, STATE_LABELS, safeProfile, isoOrNow, normalizeUsername,
    normalizeInstagramId, normalizeAvatarUrl, normalizeUser, userIdentityKey, uniqueUsers, uniqueUsernames, usernameMap, usernameSet };
});
