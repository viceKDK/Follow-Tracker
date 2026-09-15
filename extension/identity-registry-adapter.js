(function (root, factory) {
  const trust = root && root.FollowTrackerTrust
    ? root.FollowTrackerTrust
    : (typeof module === "object" && module.exports ? require("./trust-domain-adapter.js") : null);
  const api = factory(trust);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerIdentityRegistry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Trust) {
  "use strict";
  if (!Trust) throw new Error("Follow Tracker Identity Registry Adapter no pudo cargar Trust.");

  const IDENTITY_SCHEMA_VERSION = 2;

  function mergeIdentityRecords(primary, secondary, key, observedAt, source) {
    const canonicalUsername = Trust.normalizeUsername(primary && primary.canonicalUsername
      || secondary && secondary.canonicalUsername
      || primary && primary.currentUsername
      || secondary && secondary.currentUsername);
    const currentUsername = Trust.normalizeUsername(secondary && secondary.currentUsername
      || primary && primary.currentUsername
      || canonicalUsername);
    const previousUsernames = [...new Set([
      ...(primary && primary.previousUsernames || []),
      ...(secondary && secondary.previousUsernames || []),
      primary && primary.currentUsername,
      secondary && secondary.currentUsername,
      canonicalUsername,
      currentUsername,
    ].map(Trust.normalizeUsername).filter(Boolean))];
    return {
      key,
      instagramUserId: Trust.normalizeInstagramId(secondary) || Trust.normalizeInstagramId(primary),
      canonicalUsername,
      currentUsername: currentUsername || canonicalUsername,
      previousUsernames,
      fullName: String(secondary && secondary.fullName || primary && primary.fullName || "").trim(),
      avatarUrl: Trust.normalizeAvatarUrl(secondary) || Trust.normalizeAvatarUrl(primary),
      firstSeenAt: String(primary && primary.firstSeenAt || secondary && secondary.firstSeenAt || observedAt),
      lastSeenAt: String(observedAt),
      source: String(source || secondary && secondary.source || primary && primary.source || "unknown"),
    };
  }

  function retargetAliases(registry, fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    Object.entries(registry.aliases || {}).forEach(([alias, key]) => {
      if (key === fromKey) registry.aliases[alias] = toKey;
    });
  }

  function keyForInstagramId(registry, instagramUserId) {
    if (!instagramUserId) return "";
    const expected = `id:${instagramUserId}`;
    if (registry.records[expected]) return expected;
    return Object.keys(registry.records).find((key) => Trust.normalizeInstagramId(registry.records[key]) === instagramUserId) || "";
  }

  function aliasCanMergeWithId(registry, aliasKey, instagramUserId) {
    if (!aliasKey || !registry.records[aliasKey]) return true;
    const aliasId = Trust.normalizeInstagramId(registry.records[aliasKey]);
    return !aliasId || !instagramUserId || aliasId === instagramUserId;
  }

  function consolidateRecord(registry, fromKey, toKey, observedAt, source) {
    if (!fromKey || fromKey === toKey || !registry.records[fromKey]) return registry.records[toKey] || null;
    const incoming = registry.records[fromKey];
    const existing = registry.records[toKey] || null;
    const merged = mergeIdentityRecords(existing || incoming, existing ? incoming : null, toKey, observedAt, source);
    registry.records[toKey] = merged;
    delete registry.records[fromKey];
    retargetAliases(registry, fromKey, toKey);
    merged.previousUsernames.forEach((alias) => { registry.aliases[alias] = toKey; });
    return merged;
  }

  function updateIdentityRegistry(existingValue, rows, options) {
    const settings = options && typeof options === "object" ? options : {};
    const observedAt = String(settings.observedAt || new Date().toISOString());
    const profile = Trust.safeProfile(settings.profile || existingValue && existingValue.profile);
    const registry = Trust.normalizeIdentityRegistry(existingValue, profile);
    registry.schemaVersion = IDENTITY_SCHEMA_VERSION;
    const renames = [];
    const conflicts = [];
    const resolved = [];

    Trust.uniqueUsers(rows, settings.source).forEach((user) => {
      const idKey = user.instagramUserId ? `id:${user.instagramUserId}` : "";
      const aliasKey = registry.aliases[user.username] || "";
      const legacyIdKey = keyForInstagramId(registry, user.instagramUserId);
      let key = idKey || aliasKey || `username:${user.username}`;

      if (idKey) {
        if (legacyIdKey && legacyIdKey !== idKey) consolidateRecord(registry, legacyIdKey, idKey, observedAt, user.source);
        if (aliasKey && aliasKey !== idKey && registry.records[aliasKey]) {
          if (aliasCanMergeWithId(registry, aliasKey, user.instagramUserId)) {
            consolidateRecord(registry, aliasKey, idKey, observedAt, user.source);
          } else {
            conflicts.push({
              type: "username_reused_by_different_id",
              username: user.username,
              incomingIdentityKey: idKey,
              incomingInstagramUserId: user.instagramUserId,
              existingIdentityKey: aliasKey,
              existingInstagramUserId: Trust.normalizeInstagramId(registry.records[aliasKey]),
            });
          }
        }
        key = idKey;
      }

      const current = registry.records[key] || null;
      const previousUsername = Trust.normalizeUsername(current && current.currentUsername);
      const incoming = {
        key,
        instagramUserId: user.instagramUserId,
        canonicalUsername: current && current.canonicalUsername || user.username,
        currentUsername: user.username,
        previousUsernames: user.aliases,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        source: user.source,
      };
      const merged = mergeIdentityRecords(current, incoming, key, observedAt, user.source);

      if (previousUsername && previousUsername !== user.username) {
        renames.push({
          identityKey: key,
          instagramUserId: merged.instagramUserId,
          from: previousUsername,
          to: user.username,
          canonicalUsername: merged.canonicalUsername,
          confidence: merged.instagramUserId ? 1 : 0.8,
          reason: merged.instagramUserId ? "stable_instagram_id" : "known_alias",
        });
      }

      registry.records[key] = merged;
      merged.previousUsernames.forEach((alias) => { registry.aliases[alias] = key; });
      registry.aliases[user.username] = key;
      resolved.push({ ...user, identityKey: key, canonicalUsername: merged.canonicalUsername, currentUsername: merged.currentUsername });
    });

    registry.profile = profile;
    registry.updatedAt = observedAt;
    return { registry, resolved, renames, conflicts };
  }

  function canonicalizeRelationshipLists(existingRegistry, followersRows, followingRows, options) {
    const settings = options && typeof options === "object" ? options : {};
    const combined = Trust.uniqueUsers([
      ...(Array.isArray(followersRows) ? followersRows : []),
      ...(Array.isArray(followingRows) ? followingRows : []),
    ], settings.source);
    const updated = updateIdentityRegistry(existingRegistry, combined, settings);
    const byIncoming = new Map();
    updated.resolved.forEach((user) => {
      byIncoming.set(user.username, user);
      if (user.instagramUserId) byIncoming.set(`id:${user.instagramUserId}`, user);
    });

    function resolveList(rows) {
      return Trust.uniqueUsers(rows, settings.source).map((user) => {
        const resolved = user.instagramUserId ? byIncoming.get(`id:${user.instagramUserId}`) : byIncoming.get(user.username);
        return resolved || { ...user, canonicalUsername: user.username, currentUsername: user.username };
      });
    }

    const followers = resolveList(followersRows);
    const following = resolveList(followingRows);
    return {
      registry: updated.registry,
      renames: updated.renames,
      conflicts: updated.conflicts,
      followers,
      following,
      followerUsernames: [...new Set(followers.map((user) => user.canonicalUsername))].sort(),
      followingUsernames: [...new Set(following.map((user) => user.canonicalUsername))].sort(),
      users: Trust.uniqueUsers([...followers, ...following], settings.source).map((user) => {
        const resolved = user.instagramUserId ? byIncoming.get(`id:${user.instagramUserId}`) : byIncoming.get(user.username);
        return resolved || user;
      }),
    };
  }

  Object.assign(Trust, { IDENTITY_SCHEMA_VERSION, aliasCanMergeWithId, canonicalizeRelationshipLists, updateIdentityRegistry });
  return Trust;
});