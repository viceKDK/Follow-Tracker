(function (root, factory) {
  const core = root && root.FollowTrackerCore
    ? root.FollowTrackerCore
    : (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerTrust = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";

  const TRUST_SCHEMA_VERSION = 1;
  const DEFAULT_SETTINGS = Object.freeze({
    minTrustedCoverage: 0.95,
    minHardCoverage: 0.8,
    maxTrustedDropRatio: 0.15,
    confirmRemovalsAfter: 2,
    autoAcceptTrusted: false,
    backupReminderDays: 30,
    backupReminderReports: 5,
  });

  function safeProfile(value) {
    if (Core && Core.safeProfile) return Core.safeProfile(value);
    return String(value || "perfil")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "perfil";
  }

  function normalizeUsername(value) {
    const raw = typeof value === "string"
      ? value
      : value && (value.username || value.value || value.handle || value.user_name);
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
    const fullName = String(object.fullName || object.full_name || object.name || "").trim();
    const aliases = Array.isArray(object.aliases)
      ? object.aliases.map(normalizeUsername).filter(Boolean)
      : [];
    return {
      instagramUserId: normalizeInstagramId(object),
      username,
      fullName,
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
    const byKey = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const user = normalizeUser(row, source);
      if (!user) return;
      const key = userIdentityKey(user);
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, user);
        return;
      }
      byKey.set(key, {
        ...current,
        fullName: user.fullName || current.fullName,
        avatarUrl: user.avatarUrl || current.avatarUrl,
        aliases: [...new Set([...current.aliases, ...user.aliases])],
      });
    });
    return [...byKey.values()].sort((a, b) => a.username.localeCompare(b.username));
  }

  function emptyIdentityRegistry(profile) {
    return {
      schemaVersion: TRUST_SCHEMA_VERSION,
      profile: safeProfile(profile),
      updatedAt: new Date(0).toISOString(),
      records: {},
      aliases: {},
    };
  }

  function normalizeIdentityRecord(value, fallbackKey) {
    if (!value || typeof value !== "object") return null;
    const currentUsername = normalizeUsername(value.currentUsername || value.username || value.canonicalUsername);
    const canonicalUsername = normalizeUsername(value.canonicalUsername || currentUsername);
    if (!canonicalUsername) return null;
    const instagramUserId = normalizeInstagramId(value);
    const key = String(value.key || fallbackKey || (instagramUserId ? `id:${instagramUserId}` : `username:${canonicalUsername}`));
    const previousUsernames = [...new Set([
      ...(Array.isArray(value.previousUsernames) ? value.previousUsernames : []),
      ...(Array.isArray(value.aliases) ? value.aliases : []),
      canonicalUsername,
      currentUsername,
    ].map(normalizeUsername).filter(Boolean))];
    return {
      key,
      instagramUserId,
      canonicalUsername,
      currentUsername: currentUsername || canonicalUsername,
      previousUsernames,
      fullName: String(value.fullName || "").trim(),
      avatarUrl: normalizeAvatarUrl(value),
      firstSeenAt: String(value.firstSeenAt || value.lastSeenAt || new Date(0).toISOString()),
      lastSeenAt: String(value.lastSeenAt || value.firstSeenAt || new Date(0).toISOString()),
      source: String(value.source || "legacy"),
    };
  }

  function normalizeIdentityRegistry(value, profile) {
    const registry = emptyIdentityRegistry(profile || value && value.profile);
    if (!value || typeof value !== "object") return registry;
    const recordsInput = value.records && typeof value.records === "object" ? value.records : {};
    Object.entries(recordsInput).forEach(([key, record]) => {
      const normalized = normalizeIdentityRecord(record, key);
      if (!normalized) return;
      registry.records[normalized.key] = normalized;
      normalized.previousUsernames.forEach((alias) => {
        registry.aliases[alias] = normalized.key;
      });
    });
    if (value.aliases && typeof value.aliases === "object") {
      Object.entries(value.aliases).forEach(([alias, key]) => {
        const normalizedAlias = normalizeUsername(alias);
        if (normalizedAlias && registry.records[key]) registry.aliases[normalizedAlias] = key;
      });
    }
    registry.updatedAt = String(value.updatedAt || new Date(0).toISOString());
    return registry;
  }

  function mergeIdentityRecords(primary, secondary, key, observedAt, source) {
    const canonicalUsername = primary && primary.canonicalUsername
      || secondary && secondary.canonicalUsername
      || secondary && secondary.currentUsername;
    const currentUsername = secondary && secondary.currentUsername
      || primary && primary.currentUsername
      || canonicalUsername;
    const aliases = [...new Set([
      ...(primary && primary.previousUsernames || []),
      ...(secondary && secondary.previousUsernames || []),
      canonicalUsername,
      currentUsername,
    ].map(normalizeUsername).filter(Boolean))];
    return {
      key,
      instagramUserId: secondary && secondary.instagramUserId || primary && primary.instagramUserId || "",
      canonicalUsername,
      currentUsername,
      previousUsernames: aliases,
      fullName: secondary && secondary.fullName || primary && primary.fullName || "",
      avatarUrl: secondary && secondary.avatarUrl || primary && primary.avatarUrl || "",
      firstSeenAt: primary && primary.firstSeenAt || secondary && secondary.firstSeenAt || observedAt,
      lastSeenAt: observedAt,
      source: source || secondary && secondary.source || primary && primary.source || "unknown",
    };
  }

  function updateIdentityRegistry(existingValue, rows, options) {
    const settings = options && typeof options === "object" ? options : {};
    const observedAt = String(settings.observedAt || new Date().toISOString());
    const profile = safeProfile(settings.profile || existingValue && existingValue.profile);
    const registry = normalizeIdentityRegistry(existingValue, profile);
    const renames = [];
    const resolved = [];

    uniqueUsers(rows, settings.source).forEach((user) => {
      const idKey = user.instagramUserId ? `id:${user.instagramUserId}` : "";
      const aliasKey = registry.aliases[user.username] || "";
      let key = idKey || aliasKey || `username:${user.username}`;
      let current = registry.records[key] || null;

      if (idKey && !current && aliasKey && registry.records[aliasKey]) {
        current = registry.records[aliasKey];
        delete registry.records[aliasKey];
        key = idKey;
      }

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

      if (current && current.currentUsername && current.currentUsername !== user.username) {
        renames.push({
          identityKey: key,
          instagramUserId: merged.instagramUserId,
          from: current.currentUsername,
          to: user.username,
          canonicalUsername: merged.canonicalUsername,
        });
      }

      registry.records[key] = merged;
      merged.previousUsernames.forEach((alias) => {
        registry.aliases[alias] = key;
      });
      registry.aliases[user.username] = key;
      resolved.push({
        ...user,
        identityKey: key,
        canonicalUsername: merged.canonicalUsername,
        currentUsername: merged.currentUsername,
      });
    });

    registry.profile = profile;
    registry.updatedAt = observedAt;
    return { registry, resolved, renames };
  }

  function canonicalizeRelationshipLists(existingRegistry, followersRows, followingRows, options) {
    const combined = uniqueUsers([
      ...(Array.isArray(followersRows) ? followersRows : []),
      ...(Array.isArray(followingRows) ? followingRows : []),
    ], options && options.source);
    const updated = updateIdentityRegistry(existingRegistry, combined, options);
    const byIncoming = new Map();
    updated.resolved.forEach((user) => {
      byIncoming.set(user.username, user);
      if (user.instagramUserId) byIncoming.set(`id:${user.instagramUserId}`, user);
    });

    function resolveList(rows) {
      return uniqueUsers(rows, options && options.source).map((user) => {
        const resolved = user.instagramUserId
          ? byIncoming.get(`id:${user.instagramUserId}`)
          : byIncoming.get(user.username);
        return resolved || { ...user, canonicalUsername: user.username, currentUsername: user.username };
      });
    }

    const followers = resolveList(followersRows);
    const following = resolveList(followingRows);
    return {
      registry: updated.registry,
      renames: updated.renames,
      followers,
      following,
      followerUsernames: [...new Set(followers.map((user) => user.canonicalUsername))].sort(),
      followingUsernames: [...new Set(following.map((user) => user.canonicalUsername))].sort(),
      users: uniqueUsers([...followers, ...following], options && options.source).map((user) => {
        const resolved = user.instagramUserId
          ? byIncoming.get(`id:${user.instagramUserId}`)
          : byIncoming.get(user.username);
        return resolved || user;
      }),
    };
  }

  function normalizeAbsenceState(value, profile) {
    const state = value && typeof value === "object" ? value : {};
    const normalizeBucket = (bucket) => {
      const output = {};
      Object.entries(bucket && typeof bucket === "object" ? bucket : {}).forEach(([username, entry]) => {
        const normalized = normalizeUsername(username);
        if (!normalized) return;
        output[normalized] = {
          count: Math.max(0, Number(entry && entry.count) || 0),
          firstMissingAt: String(entry && entry.firstMissingAt || ""),
          lastMissingAt: String(entry && entry.lastMissingAt || ""),
        };
      });
      return output;
    };
    return {
      schemaVersion: TRUST_SCHEMA_VERSION,
      profile: safeProfile(profile || state.profile),
      followers: normalizeBucket(state.followers),
      following: normalizeBucket(state.following),
      updatedAt: String(state.updatedAt || new Date(0).toISOString()),
    };
  }

  function applyAbsenceBucket(previousValues, currentValues, bucket, capturedAt, confirmAfter) {
    const previous = [...new Set((previousValues || []).map(normalizeUsername).filter(Boolean))];
    const current = new Set((currentValues || []).map(normalizeUsername).filter(Boolean));
    const nextBucket = { ...bucket };
    const pending = [];
    const confirmed = [];

    [...current].forEach((username) => {
      delete nextBucket[username];
    });

    previous.forEach((username) => {
      if (current.has(username)) return;
      const prior = nextBucket[username] || { count: 0, firstMissingAt: capturedAt };
      const count = prior.count + 1;
      const entry = {
        count,
        firstMissingAt: prior.firstMissingAt || capturedAt,
        lastMissingAt: capturedAt,
      };
      if (count < confirmAfter) {
        current.add(username);
        nextBucket[username] = entry;
        pending.push({ username, count, confirmAfter });
      } else {
        delete nextBucket[username];
        confirmed.push({ username, count });
      }
    });

    return {
      values: [...current].sort(),
      bucket: nextBucket,
      pending,
      confirmed,
    };
  }

  function applyAbsencePolicy(previousSnapshot, followerUsernames, followingUsernames, absenceValue, options) {
    const settings = { ...DEFAULT_SETTINGS, ...(options || {}) };
    const capturedAt = String(settings.capturedAt || new Date().toISOString());
    const state = normalizeAbsenceState(absenceValue, settings.profile || previousSnapshot && previousSnapshot.profile);
    const confirmAfter = Math.max(1, Number(settings.confirmRemovalsAfter) || DEFAULT_SETTINGS.confirmRemovalsAfter);
    const previousFollowers = previousSnapshot && Array.isArray(previousSnapshot.followers) ? previousSnapshot.followers : [];
    const previousFollowing = previousSnapshot && Array.isArray(previousSnapshot.following) ? previousSnapshot.following : [];
    const followers = applyAbsenceBucket(previousFollowers, followerUsernames, state.followers, capturedAt, confirmAfter);
    const following = applyAbsenceBucket(previousFollowing, followingUsernames, state.following, capturedAt, confirmAfter);
    return {
      followers: followers.values,
      following: following.values,
      state: {
        ...state,
        followers: followers.bucket,
        following: following.bucket,
        updatedAt: capturedAt,
      },
      pending: {
        followers: followers.pending,
        following: following.pending,
      },
      confirmed: {
        followers: followers.confirmed,
        following: following.confirmed,
      },
    };
  }

  function coverage(actual, expected) {
    const count = Math.max(0, Number(actual) || 0);
    const total = Number(expected);
    if (!Number.isFinite(total) || total < 0) return null;
    if (total === 0) return count === 0 ? 1 : null;
    return count / total;
  }

  function compareStrings(previousValues, currentValues) {
    const previous = new Set((previousValues || []).map(normalizeUsername).filter(Boolean));
    const current = new Set((currentValues || []).map(normalizeUsername).filter(Boolean));
    return {
      added: [...current].filter((value) => !previous.has(value)).sort(),
      removed: [...previous].filter((value) => !current.has(value)).sort(),
    };
  }

  function buildCaptureReview(input) {
    const value = input && typeof input === "object" ? input : {};
    const settings = { ...DEFAULT_SETTINGS, ...(value.settings || {}) };
    const previous = value.previousSnapshot && typeof value.previousSnapshot === "object"
      ? value.previousSnapshot
      : null;
    const followers = [...new Set((value.followers || []).map(normalizeUsername).filter(Boolean))].sort();
    const following = [...new Set((value.following || []).map(normalizeUsername).filter(Boolean))].sort();
    const expectedFollowers = Number.isFinite(Number(value.expectedFollowers)) ? Number(value.expectedFollowers) : null;
    const expectedFollowing = Number.isFinite(Number(value.expectedFollowing)) ? Number(value.expectedFollowing) : null;
    const followersCoverage = coverage(followers.length, expectedFollowers);
    const followingCoverage = coverage(following.length, expectedFollowing);
    const followerChanges = compareStrings(previous && previous.followers, followers);
    const followingChanges = compareStrings(previous && previous.following, following);
    const previousFollowers = previous && Array.isArray(previous.followers) ? previous.followers.length : 0;
    const previousFollowing = previous && Array.isArray(previous.following) ? previous.following.length : 0;
    const followerDropRatio = previousFollowers
      ? Math.max(0, previousFollowers - followers.length) / previousFollowers
      : 0;
    const followingDropRatio = previousFollowing
      ? Math.max(0, previousFollowing - following.length) / previousFollowing
      : 0;
    const warnings = [...new Set((value.warnings || []).map(String).filter(Boolean))];
    const reasons = [];
    let score = 100;
    let status = "trusted";

    const hardCoverageFailure = [followersCoverage, followingCoverage]
      .some((ratio) => ratio != null && ratio < settings.minHardCoverage);
    const trustedCoverageFailure = [followersCoverage, followingCoverage]
      .some((ratio) => ratio != null && ratio < settings.minTrustedCoverage);
    const suspiciousDrop = followerDropRatio > settings.maxTrustedDropRatio
      || followingDropRatio > settings.maxTrustedDropRatio;
    const unexpectedEmpty = (expectedFollowers > 0 && followers.length === 0)
      || (expectedFollowing > 0 && following.length === 0);

    if (unexpectedEmpty || hardCoverageFailure) {
      status = "rejected";
      reasons.push("Instagram entregó una captura demasiado incompleta para usarla como reporte.");
      score -= 60;
    } else if (trustedCoverageFailure || suspiciousDrop || warnings.length) {
      status = "review";
      if (trustedCoverageFailure) reasons.push("La cobertura quedó por debajo del umbral recomendado.");
      if (suspiciousDrop) reasons.push("La caída respecto al reporte anterior es inusualmente grande.");
      if (warnings.length) reasons.push("La captura terminó con advertencias del recolector.");
      score -= trustedCoverageFailure ? 20 : 0;
      score -= suspiciousDrop ? 25 : 0;
      score -= Math.min(20, warnings.length * 4);
    }

    const pendingAbsences = value.pendingAbsences || { followers: [], following: [] };
    const pendingCount = (pendingAbsences.followers || []).length + (pendingAbsences.following || []).length;
    if (pendingCount) {
      reasons.push(`${pendingCount} baja(s) quedaron pendientes de una segunda captura.`);
      score -= Math.min(12, pendingCount);
      if (status === "trusted") status = "review";
    }

    return {
      schemaVersion: TRUST_SCHEMA_VERSION,
      status,
      score: Math.max(0, Math.round(score)),
      reasons,
      source: String(value.source || "unknown"),
      profileId: normalizeInstagramId(value.profileId),
      expectedFollowers,
      collectedFollowers: followers.length,
      followersCoverage,
      expectedFollowing,
      collectedFollowing: following.length,
      followingCoverage,
      previousFollowers,
      previousFollowing,
      followerDropRatio,
      followingDropRatio,
      changes: {
        newFollowers: followerChanges.added,
        lostFollowers: followerChanges.removed,
        newFollowing: followingChanges.added,
        lostFollowing: followingChanges.removed,
      },
      pendingAbsences,
      confirmedAbsences: value.confirmedAbsences || { followers: [], following: [] },
      renames: Array.isArray(value.renames) ? value.renames : [],
      durationMs: Math.max(0, Number(value.durationMs) || 0),
      retries: Math.max(0, Number(value.retries) || 0),
      warnings,
      capturedAt: String(value.capturedAt || new Date().toISOString()),
      acceptedAt: null,
      reviewDecision: null,
    };
  }

  function captureMetaForCommit(review, decision) {
    const normalizedDecision = String(decision || "save");
    return {
      ...(review || {}),
      acceptedAt: new Date().toISOString(),
      reviewDecision: normalizedDecision,
      status: normalizedDecision === "save_suspicious"
        ? "suspicious"
        : review && review.status === "rejected"
          ? "suspicious"
          : review && review.status || "trusted",
    };
  }

  function extractStringListUsers(value, output) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => extractStringListUsers(entry, output));
      return;
    }
    if (typeof value !== "object") return;

    if (Array.isArray(value.string_list_data)) {
      value.string_list_data.forEach((entry) => {
        const user = normalizeUser({
          username: entry && (entry.value || entry.username || entry.href),
          fullName: value.title || "",
        }, "instagram_export");
        if (user) output.push(user);
      });
    }

    const direct = normalizeUser(value, "instagram_export");
    if (direct && (value.username || value.user_name)) output.push(direct);

    Object.values(value).forEach((entry) => {
      if (entry !== value.string_list_data) extractStringListUsers(entry, output);
    });
  }

  function phaseFromExportName(name, payload) {
    const lower = String(name || "").toLowerCase();
    if (/followers?(?:_\d+)?\.(?:json|html)$/.test(lower) || lower.includes("followers_")) return "followers";
    if (lower.includes("following") || lower.includes("following_accounts")) return "following";
    if (payload && typeof payload === "object") {
      if (payload.relationships_followers || payload.followers) return "followers";
      if (payload.relationships_following || payload.following || payload.following_accounts) return "following";
    }
    return "unknown";
  }

  function parseInstagramExportPart(name, payload) {
    const phase = phaseFromExportName(name, payload);
    const users = [];
    let root = payload;
    if (phase === "followers" && payload && payload.relationships_followers) root = payload.relationships_followers;
    if (phase === "following" && payload && payload.relationships_following) root = payload.relationships_following;
    if (phase === "following" && payload && payload.following_accounts) root = payload.following_accounts;
    extractStringListUsers(root, users);
    return {
      phase,
      name: String(name || "archivo"),
      users: uniqueUsers(users, "instagram_export"),
      warning: phase === "unknown" ? `No se pudo clasificar ${name || "un archivo"}.` : "",
    };
  }

  function mergeInstagramExportParts(parts) {
    const followers = [];
    const following = [];
    const warnings = [];
    (Array.isArray(parts) ? parts : []).forEach((part) => {
      if (!part) return;
      if (part.warning) warnings.push(part.warning);
      if (part.phase === "followers") followers.push(...(part.users || []));
      if (part.phase === "following") following.push(...(part.users || []));
    });
    return {
      followers: uniqueUsers(followers, "instagram_export"),
      following: uniqueUsers(following, "instagram_export"),
      warnings,
      complete: followers.length > 0 || following.length > 0,
    };
  }

  function storageKeys(profile) {
    const safe = safeProfile(profile);
    return {
      history: `ft_history_${safe}`,
      timeline: `ft_timeline_${safe}`,
      captureMeta: `ft_capture_meta_${safe}`,
      identities: `ft_identity_${safe}`,
      absences: `ft_absence_${safe}`,
      peopleMeta: `ft_people_meta_${safe}`,
      profileMeta: `ft_profile_meta_${safe}`,
      backupStatus: `ft_backup_status_${safe}`,
      pending: `ft_pending_capture_${safe}`,
      recovery: `ft_recovery_${safe}`,
    };
  }

  function estimateBytes(value) {
    try {
      return new TextEncoder().encode(JSON.stringify(value == null ? null : value)).length;
    } catch (_error) {
      return JSON.stringify(value == null ? null : value).length * 2;
    }
  }

  function backupReminder(status, timelineValue, nowValue, settingsValue) {
    const settings = { ...DEFAULT_SETTINGS, ...(settingsValue || {}) };
    const timeline = timelineValue && typeof timelineValue === "object" ? timelineValue : { reports: [] };
    const reports = Array.isArray(timeline.reports) ? timeline.reports : [];
    const last = reports.length ? reports[reports.length - 1] : null;
    const savedReportId = status && status.reportId ? String(status.reportId) : "";
    const savedIndex = reports.findIndex((report) => report && report.id === savedReportId);
    const reportsSince = savedIndex >= 0 ? reports.length - savedIndex - 1 : reports.length;
    const backedUpAt = status && status.backedUpAt ? new Date(status.backedUpAt).getTime() : 0;
    const now = nowValue ? new Date(nowValue).getTime() : Date.now();
    const days = backedUpAt ? Math.floor((now - backedUpAt) / 86400000) : null;
    const due = !backedUpAt
      || days >= settings.backupReminderDays
      || reportsSince >= settings.backupReminderReports;
    return {
      due,
      days,
      reportsSince,
      latestReportId: last && last.id || "",
      backedUpAt: backedUpAt ? new Date(backedUpAt).toISOString() : null,
    };
  }

  function rebuildTimelineWithoutReport(History, timelineValue, reportId) {
    if (!History || !timelineValue || !reportId) return null;
    const original = History.normalizeTimeline(timelineValue, timelineValue.profile);
    const target = original.reports.find((report) => report.id === reportId);
    if (!target || original.reports.length <= 1) return null;
    const remaining = original.reports.filter((report) => report.id !== reportId);
    const snapshots = remaining.map((report) => History.snapshotForReport(original, report.id));
    if (snapshots.some((snapshot) => !snapshot)) return null;

    let rebuilt = null;
    let previous = null;
    snapshots.forEach((snapshot, index) => {
      const report = remaining[index];
      const current = {
        ...snapshot,
        profile: original.profile,
        updatedAt: report.capturedAt,
        runId: report.runId || report.id,
        reportId: report.id,
      };
      rebuilt = History.appendSnapshot(rebuilt, previous, current);
      previous = current;
    });

    const snapshot = snapshots[snapshots.length - 1];
    const lastReport = remaining[remaining.length - 1];
    return {
      removedReport: target,
      timeline: History.normalizeTimeline(rebuilt, original.profile),
      snapshot: History.normalizeSnapshot({
        ...snapshot,
        profile: original.profile,
        updatedAt: lastReport.capturedAt,
        runId: lastReport.runId || lastReport.id,
        reportId: lastReport.id,
      }),
    };
  }

  function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      ...DEFAULT_SETTINGS,
      ...input,
      minTrustedCoverage: Math.min(1, Math.max(0.5, Number(input.minTrustedCoverage) || DEFAULT_SETTINGS.minTrustedCoverage)),
      minHardCoverage: Math.min(1, Math.max(0.1, Number(input.minHardCoverage) || DEFAULT_SETTINGS.minHardCoverage)),
      maxTrustedDropRatio: Math.min(1, Math.max(0.01, Number(input.maxTrustedDropRatio) || DEFAULT_SETTINGS.maxTrustedDropRatio)),
      confirmRemovalsAfter: Math.min(5, Math.max(1, Number(input.confirmRemovalsAfter) || DEFAULT_SETTINGS.confirmRemovalsAfter)),
      autoAcceptTrusted: input.autoAcceptTrusted === true,
    };
  }

  return {
    TRUST_SCHEMA_VERSION,
    DEFAULT_SETTINGS,
    applyAbsencePolicy,
    backupReminder,
    buildCaptureReview,
    canonicalizeRelationshipLists,
    captureMetaForCommit,
    compareStrings,
    coverage,
    emptyIdentityRegistry,
    estimateBytes,
    mergeInstagramExportParts,
    normalizeAbsenceState,
    normalizeIdentityRegistry,
    normalizeAvatarUrl,
    normalizeInstagramId,
    normalizeSettings,
    normalizeUser,
    normalizeUsername,
    parseInstagramExportPart,
    rebuildTimelineWithoutReport,
    safeProfile,
    storageKeys,
    uniqueUsers,
    updateIdentityRegistry,
    userIdentityKey,
  };
});
