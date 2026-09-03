(function (root, factory) {
  const domain = root && root.FollowTrackerFollowerDomain ? root.FollowTrackerFollowerDomain
    : (typeof module === "object" && module.exports ? require("./follower-relations.js") : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = Object.assign(domain, api);
  if (root && domain) Object.assign(domain, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain) {
  "use strict";
  if (!Domain) throw new Error("Follow Tracker Follower Relations no fue cargado.");
  const { TIMELINE_SCHEMA_VERSION, SNAPSHOT_SCHEMA_VERSION, MAX_EVENTS, MAX_REPORTS, safeProfile, isoOrNow,
    normalizeSnapshot, normalizeUsername, uniqueUsernames, uniqueUsers } = Domain;

  function normalizeUsers(rows) {
    return uniqueUsers((Array.isArray(rows) ? rows : []).map((user) => ({
      ...user,
      username: user && (user.currentUsername || user.username || user.canonicalUsername),
    })));
  }

  function emptyChanges() {
    return { newFollowers: [], lostFollowers: [], newFollowing: [], lostFollowing: [] };
  }

  function normalizeChanges(value) {
    const changes = value && typeof value === "object" ? value : {};
    return {
      newFollowers: uniqueUsernames(changes.newFollowers || []),
      lostFollowers: uniqueUsernames(changes.lostFollowers || []),
      newFollowing: uniqueUsernames(changes.newFollowing || []),
      lostFollowing: uniqueUsernames(changes.lostFollowing || []),
    };
  }

  function reportIdFor(snapshot) {
    return snapshot.runId || snapshot.reportId || `capture-${snapshot.updatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  }

  function baselineFromSnapshot(snapshot, reportId) {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) return null;
    return {
      profile: normalized.profile,
      reportId: String(reportId || reportIdFor(normalized)),
      runId: normalized.runId,
      capturedAt: normalized.updatedAt,
      followers: normalized.followers,
      following: normalized.following,
      users: normalizeUsers(normalized.users),
    };
  }

  function normalizeBaseline(value, profile) {
    if (!value || typeof value !== "object") return null;
    return {
      profile: safeProfile(value.profile || profile || "perfil"),
      reportId: String(value.reportId || "").trim(),
      runId: String(value.runId || "").trim(),
      capturedAt: isoOrNow(value.capturedAt),
      followers: uniqueUsernames(value.followers || []),
      following: uniqueUsernames(value.following || []),
      users: normalizeUsers(value.users),
    };
  }

  function emptyTimeline(profile, createdAt) {
    const now = isoOrNow(createdAt);
    return {
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      profile: safeProfile(profile || "perfil"),
      createdAt: now,
      updatedAt: now,
      baseline: null,
      reports: [],
      events: [],
    };
  }

  function normalizeEvent(event, profile) {
    if (!event || !event.username || !event.type) return null;
    const username = normalizeUsername(event.username);
    if (!username) return null;
    const reportId = String(event.reportId || "").trim();
    return {
      id: String(event.id || `${reportId}:${event.type}:${username}`),
      profile: safeProfile(event.profile || profile || "perfil"),
      username,
      type: String(event.type),
      occurredAt: isoOrNow(event.occurredAt),
      reportId,
      runId: String(event.runId || "").trim(),
    };
  }

  function normalizeReport(report) {
    if (!report || typeof report !== "object") return null;
    const changes = normalizeChanges(report.changes);
    const eventCount = Number(report.eventCount) ||
      changes.newFollowers.length + changes.lostFollowers.length +
      changes.newFollowing.length + changes.lostFollowing.length;
    const categoryCounts = report.categoryCounts && typeof report.categoryCounts === "object"
      ? {
          mutual: Math.max(0, Number(report.categoryCounts.mutual) || 0),
          followersOnly: Math.max(0, Number(report.categoryCounts.followersOnly) || 0),
          followingOnly: Math.max(0, Number(report.categoryCounts.followingOnly) || 0),
        }
      : {
          mutual: Math.max(0, Number(report.mutualCount) || 0),
          followersOnly: Math.max(0, Number(report.followerOnlyCount) || 0),
          followingOnly: Math.max(0, Number(report.followingOnlyCount) || 0),
        };
    return {
      ...report,
      id: String(report.id || report.runId || "").trim(),
      runId: String(report.runId || "").trim(),
      capturedAt: isoOrNow(report.capturedAt),
      isBaseline: report.isBaseline === true,
      followersCount: Math.max(0, Number(report.followersCount) || 0),
      followingCount: Math.max(0, Number(report.followingCount) || 0),
      mutualCount: categoryCounts.mutual,
      followerOnlyCount: categoryCounts.followersOnly,
      followingOnlyCount: categoryCounts.followingOnly,
      categoryCounts,
      users: normalizeUsers(report.users),
      changes,
      eventCount,
    };
  }

  function normalizeTimeline(value, profile) {
    if (!value || typeof value !== "object") return emptyTimeline(profile);
    const normalizedProfile = safeProfile(value.profile || profile || "perfil");
    const reports = Array.isArray(value.reports)
      ? value.reports.map(normalizeReport).filter((report) => report && report.id)
      : [];
    reports.sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
    const seenReports = new Set();
    const uniqueReports = reports.filter((report) => {
      if (seenReports.has(report.id)) return false;
      seenReports.add(report.id);
      return true;
    });

    const events = Array.isArray(value.events)
      ? value.events.map((event) => normalizeEvent(event, normalizedProfile)).filter(Boolean)
      : [];
    const seenEvents = new Set();
    const uniqueEvents = events.filter((event) => {
      if (seenEvents.has(event.id)) return false;
      seenEvents.add(event.id);
      return true;
    }).slice(-MAX_EVENTS);

    return {
      ...value,
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      profile: normalizedProfile,
      createdAt: isoOrNow(value.createdAt),
      updatedAt: isoOrNow(value.updatedAt),
      baseline: normalizeBaseline(value.baseline, normalizedProfile),
      reports: uniqueReports,
      events: uniqueEvents,
    };
  }

  return { emptyChanges, normalizeChanges, normalizeUsers, reportIdFor, baselineFromSnapshot, normalizeBaseline,
    emptyTimeline, normalizeEvent, normalizeReport, normalizeTimeline };
});
