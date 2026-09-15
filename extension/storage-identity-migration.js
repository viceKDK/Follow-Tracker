(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerStorageIdentityMigration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const IDENTITY_STORAGE_SCHEMA_VERSION = 2;

  function normalizeUsername(value) {
    const raw = typeof value === "string" ? value : value && (value.currentUsername || value.username || value.canonicalUsername);
    return String(raw || "").trim().replace(/^@+/, "")
      .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "").split(/[/?#]/)[0]
      .replace(/[^a-zA-Z0-9._]/g, "").toLowerCase();
  }

  function normalizeInstagramId(value) {
    const raw = value && typeof value === "object"
      ? value.instagramUserId || value.instagram_user_id || value.pk || value.pk_id || value.id
      : value;
    const text = String(raw == null ? "" : raw).trim();
    return /^\d+$/.test(text) ? text : "";
  }

  function latestRecord(primary, secondary) {
    const primaryTime = Date.parse(primary && primary.lastSeenAt || "") || 0;
    const secondaryTime = Date.parse(secondary && secondary.lastSeenAt || "") || 0;
    return secondaryTime >= primaryTime ? secondary : primary;
  }

  function mergeIdentityRecord(primary, secondary, key) {
    const preferred = latestRecord(primary, secondary) || secondary || primary || {};
    const fallback = preferred === secondary ? primary || {} : secondary || {};
    const canonicalUsername = normalizeUsername(primary && primary.canonicalUsername || secondary && secondary.canonicalUsername
      || primary && primary.currentUsername || secondary && secondary.currentUsername);
    const currentUsername = normalizeUsername(preferred.currentUsername || preferred.username || fallback.currentUsername || canonicalUsername);
    const previousUsernames = [...new Set([
      ...(primary && primary.previousUsernames || []), ...(primary && primary.aliases || []),
      ...(secondary && secondary.previousUsernames || []), ...(secondary && secondary.aliases || []),
      primary && primary.currentUsername, secondary && secondary.currentUsername, canonicalUsername, currentUsername,
    ].map(normalizeUsername).filter(Boolean))];
    return {
      ...fallback,
      ...preferred,
      key,
      instagramUserId: normalizeInstagramId(secondary) || normalizeInstagramId(primary),
      canonicalUsername: canonicalUsername || currentUsername,
      currentUsername: currentUsername || canonicalUsername,
      previousUsernames,
      firstSeenAt: String(primary && primary.firstSeenAt || secondary && secondary.firstSeenAt || new Date(0).toISOString()),
      lastSeenAt: String(preferred.lastSeenAt || fallback.lastSeenAt || new Date(0).toISOString()),
    };
  }

  function migrateIdentityRegistry(value, profileValue) {
    const input = value && typeof value === "object" ? value : {};
    const recordsInput = input.records && typeof input.records === "object" ? input.records : {};
    const records = {};
    const aliases = {};
    const keyMap = new Map();

    Object.entries(recordsInput).forEach(([oldKey, record]) => {
      if (!record || typeof record !== "object") return;
      const currentUsername = normalizeUsername(record.currentUsername || record.username || record.canonicalUsername);
      const canonicalUsername = normalizeUsername(record.canonicalUsername || currentUsername);
      if (!canonicalUsername) return;
      const instagramUserId = normalizeInstagramId(record);
      const key = instagramUserId ? `id:${instagramUserId}` : `username:${canonicalUsername}`;
      keyMap.set(oldKey, key);
      const normalized = {
        ...record,
        key,
        instagramUserId,
        canonicalUsername,
        currentUsername: currentUsername || canonicalUsername,
        previousUsernames: [...new Set([...(record.previousUsernames || []), ...(record.aliases || []), canonicalUsername, currentUsername]
          .map(normalizeUsername).filter(Boolean))],
      };
      records[key] = records[key] ? mergeIdentityRecord(records[key], normalized, key) : normalized;
    });

    Object.entries(input.aliases && typeof input.aliases === "object" ? input.aliases : {}).forEach(([alias, oldKey]) => {
      const normalizedAlias = normalizeUsername(alias);
      const target = keyMap.get(oldKey) || oldKey;
      if (normalizedAlias && records[target]) aliases[normalizedAlias] = target;
    });
    Object.entries(records).forEach(([key, record]) => {
      (record.previousUsernames || []).forEach((alias) => { aliases[alias] = key; });
      if (record.currentUsername) aliases[record.currentUsername] = key;
      if (record.canonicalUsername) aliases[record.canonicalUsername] = key;
    });

    return {
      ...input,
      schemaVersion: IDENTITY_STORAGE_SCHEMA_VERSION,
      profile: String(input.profile || profileValue || "perfil"),
      records,
      aliases,
    };
  }

  return { IDENTITY_STORAGE_SCHEMA_VERSION, mergeIdentityRecord, migrateIdentityRegistry, normalizeInstagramId, normalizeUsername };
});