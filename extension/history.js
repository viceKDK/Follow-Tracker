(function (root, factory) {
  const core = root && root.FollowTrackerCore
    ? root.FollowTrackerCore
    : (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";

  if (!Core) throw new Error("Follow Tracker Core no fue cargado.");

  const SCHEMA_VERSION = 2;
  const MAX_REPORTS = 400;
  const MAX_EVENTS = 100000;
  const EVENT_TYPES = Object.freeze({
    FOLLOWED_YOU: "followed_you",
    UNFOLLOWED_YOU: "unfollowed_you",
    YOU_FOLLOWED: "you_followed",
    YOU_UNFOLLOWED: "you_unfollowed",
  });

  function isoOrNow(value) {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
  }

  function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;
    const profile = Core.safeProfile(snapshot.profile || "perfil");
    return {
      schemaVersion: Number(snapshot.schemaVersion) || 0,
      profile,
      followers: Core.uniqueUsernames(snapshot.followers || []),
      following: Core.uniqueUsernames(snapshot.following || []),
      updatedAt: isoOrNow(snapshot.updatedAt),
      runId: String(snapshot.runId || "").trim(),
      reportId: String(snapshot.reportId || "").trim(),
    };
  }

  function emptyChanges() {
    return {
      newFollowers: [],
      lostFollowers: [],
      newFollowing: [],
      lostFollowing: [],
    };
  }

  function normalizeChanges(value) {
    const changes = value && typeof value === "object" ? value : {};
    return {
      newFollowers: Core.uniqueUsernames(changes.newFollowers || []),
      lostFollowers: Core.uniqueUsernames(changes.lostFollowers || []),
      newFollowing: Core.uniqueUsernames(changes.newFollowing || []),
      lostFollowing: Core.uniqueUsernames(changes.lostFollowing || []),
    };
  }

  function reportIdFor(snapshot) {
    return snapshot.runId || snapshot.reportId || `capture-${snapshot.updatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  }

  function baselineFromSnapshot(snapshot, reportId) {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) return null;
    return {
      reportId: String(reportId || reportIdFor(normalized)),
      runId: normalized.runId,
      capturedAt: normalized.updatedAt,
      followers: normalized.followers,
      following: normalized.following,
    };
  }

  function normalizeBaseline(value, profile) {
    if (!value || typeof value !== "object") return null;
    return {
      reportId: String(value.reportId || "").trim(),
      runId: String(value.runId || "").trim(),
      capturedAt: isoOrNow(value.capturedAt),
      followers: Core.uniqueUsernames(value.followers || []),
      following: Core.uniqueUsernames(value.following || []),
      profile: Core.safeProfile(value.profile || profile || "perfil"),
    };
  }

  function emptyTimeline(profile, createdAt) {
    const now = isoOrNow(createdAt);
    return {
      schemaVersion: SCHEMA_VERSION,
      profile: Core.safeProfile(profile || "perfil"),
      createdAt: now,
      updatedAt: now,
      baseline: null,
      reports: [],
      events: [],
    };
  }

  function normalizeEvent(event, profile) {
    if (!event || !event.username || !event.type) return null;
    const username = String(event.username).trim().toLowerCase();
    if (!username) return null;
    const occurredAt = isoOrNow(event.occurredAt);
    const reportId = String(event.reportId || "").trim();
    return {
      id: String(event.id || `${reportId}:${event.type}:${username}`),
      profile: Core.safeProfile(event.profile || profile || "perfil"),
      username,
      type: String(event.type),
      occurredAt,
      reportId,
      runId: String(event.runId || "").trim(),
    };
  }

  function normalizeReport(report) {
    if (!report || typeof report !== "object") return null;
    const changes = normalizeChanges(report.changes);
    return {
      id: String(report.id || report.runId || "").trim(),
      runId: String(report.runId || "").trim(),
      capturedAt: isoOrNow(report.capturedAt),
      isBaseline: report.isBaseline === true,
      followersCount: Number(report.followersCount) || 0,
      followingCount: Number(report.followingCount) || 0,
      mutualCount: Number(report.mutualCount) || 0,
      followerOnlyCount: Number(report.followerOnlyCount) || 0,
      followingOnlyCount: Number(report.followingOnlyCount) || 0,
      changes,
      eventCount: Number(report.eventCount) ||
        changes.newFollowers.length + changes.lostFollowers.length +
        changes.newFollowing.length + changes.lostFollowing.length,
    };
  }

  function normalizeTimeline(value, profile) {
    if (!value || typeof value !== "object") return emptyTimeline(profile);
    const normalizedProfile = Core.safeProfile(value.profile || profile || "perfil");
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
      schemaVersion: SCHEMA_VERSION,
      profile: normalizedProfile,
      createdAt: isoOrNow(value.createdAt),
      updatedAt: isoOrNow(value.updatedAt),
      baseline: normalizeBaseline(value.baseline, normalizedProfile),
      reports: uniqueReports,
      events: uniqueEvents,
    };
  }

  function eventFor(snapshot, reportId, type, username) {
    const normalized = String(username || "").trim().toLowerCase();
    return {
      id: `${reportId}:${type}:${normalized}`,
      profile: snapshot.profile,
      username: normalized,
      type,
      occurredAt: snapshot.updatedAt,
      reportId,
      runId: snapshot.runId,
    };
  }

  function applyChanges(snapshot, changes, report) {
    const followers = new Set(snapshot.followers.map((username) => username.toLowerCase()));
    const following = new Set(snapshot.following.map((username) => username.toLowerCase()));
    const normalized = normalizeChanges(changes);

    normalized.lostFollowers.forEach((username) => followers.delete(username.toLowerCase()));
    normalized.newFollowers.forEach((username) => followers.add(username.toLowerCase()));
    normalized.lostFollowing.forEach((username) => following.delete(username.toLowerCase()));
    normalized.newFollowing.forEach((username) => following.add(username.toLowerCase()));

    return {
      schemaVersion: SCHEMA_VERSION,
      profile: snapshot.profile,
      followers: [...followers].sort(),
      following: [...following].sort(),
      updatedAt: report ? report.capturedAt : snapshot.updatedAt,
      runId: report ? report.runId : snapshot.runId,
      reportId: report ? report.id : snapshot.reportId,
    };
  }

  function snapshotForReport(timelineValue, reportId) {
    const timeline = normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    if (!timeline.baseline || !timeline.reports.length) return null;

    const reports = timeline.reports;
    const baselineIndex = reports.findIndex((report) => report.id === timeline.baseline.reportId);
    const targetIndex = reports.findIndex((report) => report.id === reportId);
    if (targetIndex < 0) return null;
    if (baselineIndex >= 0 && targetIndex < baselineIndex) return null;

    let snapshot = {
      schemaVersion: SCHEMA_VERSION,
      profile: timeline.profile,
      followers: [...timeline.baseline.followers],
      following: [...timeline.baseline.following],
      updatedAt: timeline.baseline.capturedAt,
      runId: timeline.baseline.runId,
      reportId: timeline.baseline.reportId,
    };

    const start = baselineIndex >= 0 ? baselineIndex + 1 : 0;
    if (reportId === timeline.baseline.reportId) return normalizeSnapshot(snapshot);

    for (let index = start; index <= targetIndex; index += 1) {
      snapshot = applyChanges(snapshot, reports[index].changes, reports[index]);
    }
    return normalizeSnapshot(snapshot);
  }

  function compactTimeline(timelineValue) {
    const timeline = normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    if (timeline.reports.length <= MAX_REPORTS) return timeline;

    const firstKeptIndex = timeline.reports.length - MAX_REPORTS;
    const firstKept = timeline.reports[firstKeptIndex];
    const firstSnapshot = snapshotForReport(timeline, firstKept.id);
    if (!firstSnapshot) {
      timeline.reports = timeline.reports.slice(-MAX_REPORTS);
      return timeline;
    }

    timeline.baseline = baselineFromSnapshot(firstSnapshot, firstKept.id);
    timeline.reports = timeline.reports.slice(firstKeptIndex);
    timeline.reports[0] = {
      ...timeline.reports[0],
      isBaseline: true,
      changes: emptyChanges(),
      eventCount: 0,
    };
    return timeline;
  }

  function appendSnapshot(existingTimeline, previousSnapshot, currentSnapshot) {
    const current = normalizeSnapshot(currentSnapshot);
    if (!current) return normalizeTimeline(existingTimeline, "perfil");

    let timeline = existingTimeline
      ? normalizeTimeline(existingTimeline, current.profile)
      : emptyTimeline(current.profile, current.updatedAt);
    const reportId = reportIdFor(current);
    if (timeline.reports.some((report) => report.id === reportId)) return timeline;

    const previous = normalizeSnapshot(previousSnapshot);
    const canCompare = !!previous && previous.profile === current.profile;
    const followerChanges = canCompare
      ? Core.compareSnapshots(previous.followers, current.followers)
      : { added: [], removed: [] };
    const followingChanges = canCompare
      ? Core.compareSnapshots(previous.following, current.following)
      : { added: [], removed: [] };
    const relationship = Core.buildRelationshipComparison(current.followers, current.following);

    const changes = {
      newFollowers: followerChanges.added,
      lostFollowers: followerChanges.removed,
      newFollowing: followingChanges.added,
      lostFollowing: followingChanges.removed,
    };

    if (!timeline.baseline) {
      const baselineSnapshot = canCompare && timeline.reports.length > 0 ? previous : current;
      timeline.baseline = baselineFromSnapshot(baselineSnapshot, reportIdFor(baselineSnapshot));
    }

    const report = {
      id: reportId,
      runId: current.runId,
      capturedAt: current.updatedAt,
      isBaseline: !canCompare,
      followersCount: current.followers.length,
      followingCount: current.following.length,
      mutualCount: relationship.nos.length,
      followerOnlyCount: relationship.noLoSigo.length,
      followingOnlyCount: relationship.noMeSigue.length,
      changes,
      eventCount:
        changes.newFollowers.length + changes.lostFollowers.length +
        changes.newFollowing.length + changes.lostFollowing.length,
    };

    const nextEvents = [
      ...changes.newFollowers.map((username) => eventFor(current, reportId, EVENT_TYPES.FOLLOWED_YOU, username)),
      ...changes.lostFollowers.map((username) => eventFor(current, reportId, EVENT_TYPES.UNFOLLOWED_YOU, username)),
      ...changes.newFollowing.map((username) => eventFor(current, reportId, EVENT_TYPES.YOU_FOLLOWED, username)),
      ...changes.lostFollowing.map((username) => eventFor(current, reportId, EVENT_TYPES.YOU_UNFOLLOWED, username)),
    ];

    timeline.profile = current.profile;
    timeline.updatedAt = current.updatedAt;
    timeline.reports = [...timeline.reports, report];
    timeline.events = [...timeline.events, ...nextEvents].slice(-MAX_EVENTS);
    timeline = compactTimeline(timeline);
    return normalizeTimeline(timeline, current.profile);
  }

  function compareReports(timelineValue, fromReportId, toReportId) {
    const timeline = normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    const fromReport = timeline.reports.find((report) => report.id === fromReportId) || null;
    const toReport = timeline.reports.find((report) => report.id === toReportId) || null;
    if (!fromReport || !toReport) return null;

    const fromSnapshot = snapshotForReport(timeline, fromReport.id);
    const toSnapshot = snapshotForReport(timeline, toReport.id);
    if (!fromSnapshot || !toSnapshot) return null;

    const followerChanges = Core.compareSnapshots(fromSnapshot.followers, toSnapshot.followers);
    const followingChanges = Core.compareSnapshots(fromSnapshot.following, toSnapshot.following);
    const fromRelationship = Core.buildRelationshipComparison(fromSnapshot.followers, fromSnapshot.following);
    const toRelationship = Core.buildRelationshipComparison(toSnapshot.followers, toSnapshot.following);

    return {
      fromReport,
      toReport,
      followers: {
        added: followerChanges.added,
        removed: followerChanges.removed,
        delta: toSnapshot.followers.length - fromSnapshot.followers.length,
      },
      following: {
        added: followingChanges.added,
        removed: followingChanges.removed,
        delta: toSnapshot.following.length - fromSnapshot.following.length,
      },
      mutualDelta: toRelationship.nos.length - fromRelationship.nos.length,
      fromSnapshot,
      toSnapshot,
    };
  }

  function summarizeSnapshot(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) {
      return {
        profile: "perfil",
        updatedAt: null,
        followers: 0,
        following: 0,
        mutual: 0,
        followerOnly: 0,
        followingOnly: 0,
      };
    }
    const relationship = Core.buildRelationshipComparison(normalized.followers, normalized.following);
    return {
      profile: normalized.profile,
      updatedAt: normalized.updatedAt,
      followers: normalized.followers.length,
      following: normalized.following.length,
      mutual: relationship.nos.length,
      followerOnly: relationship.noLoSigo.length,
      followingOnly: relationship.noMeSigue.length,
    };
  }

  function latestReport(timeline) {
    const normalized = normalizeTimeline(timeline, timeline && timeline.profile);
    return normalized.reports.length ? normalized.reports[normalized.reports.length - 1] : null;
  }

  function buildPeopleIndex(snapshot, timeline) {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) return [];
    const normalizedTimeline = normalizeTimeline(timeline, normalized.profile);
    const followers = new Set(normalized.followers.map((username) => username.toLowerCase()));
    const following = new Set(normalized.following.map((username) => username.toLowerCase()));
    const usernames = new Set([...followers, ...following]);
    normalizedTimeline.events.forEach((event) => usernames.add(event.username));

    const eventsByUser = new Map();
    normalizedTimeline.events.forEach((event) => {
      const current = eventsByUser.get(event.username) || [];
      current.push(event);
      eventsByUser.set(event.username, current);
    });

    return [...usernames].map((username) => {
      const followsYou = followers.has(username);
      const youFollow = following.has(username);
      const events = (eventsByUser.get(username) || []).sort((a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );
      let relationship = "historical";
      if (followsYou && youFollow) relationship = "mutual";
      else if (followsYou) relationship = "follows_you";
      else if (youFollow) relationship = "you_follow";
      return {
        username,
        followsYou,
        youFollow,
        relationship,
        events,
        lastEvent: events[0] || null,
        hasUnfollowedYou: events.some((event) => event.type === EVENT_TYPES.UNFOLLOWED_YOU),
        hasFollowedYou: events.some((event) => event.type === EVENT_TYPES.FOLLOWED_YOU),
        hasYouUnfollowed: events.some((event) => event.type === EVENT_TYPES.YOU_UNFOLLOWED),
      };
    }).sort((a, b) => {
      const aTime = a.lastEvent ? new Date(a.lastEvent.occurredAt).getTime() : 0;
      const bTime = b.lastEvent ? new Date(b.lastEvent.occurredAt).getTime() : 0;
      return bTime - aTime || a.username.localeCompare(b.username);
    });
  }

  function eventLabel(type) {
    const labels = {
      [EVENT_TYPES.FOLLOWED_YOU]: "Te siguio",
      [EVENT_TYPES.UNFOLLOWED_YOU]: "Te dejo de seguir",
      [EVENT_TYPES.YOU_FOLLOWED]: "Empezaste a seguir",
      [EVENT_TYPES.YOU_UNFOLLOWED]: "Dejaste de seguir",
    };
    return labels[type] || "Cambio detectado";
  }

  function eventsToCsv(events) {
    const rows = Array.isArray(events) ? events : [];
    return [
      "Usuario,Evento,Fecha,Reporte,Run ID",
      ...rows.map((event) => [
        event.username,
        eventLabel(event.type),
        event.occurredAt,
        event.reportId,
        event.runId,
      ].map(Core.escapeCsvValue).join(",")),
    ].join("\n");
  }

  function relationshipToCsv(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) return "Usuario,Te sigue,Lo sigues,Relacion";
    const people = buildPeopleIndex(normalized, emptyTimeline(normalized.profile));
    const labels = {
      mutual: "Mutuo",
      follows_you: "Te sigue; no lo sigues",
      you_follow: "Lo sigues; no te sigue",
      historical: "Solo historico",
    };
    return [
      "Usuario,Te sigue,Lo sigues,Relacion",
      ...people.map((person) => [
        person.username,
        person.followsYou ? "Si" : "No",
        person.youFollow ? "Si" : "No",
        labels[person.relationship] || person.relationship,
      ].map(Core.escapeCsvValue).join(",")),
    ].join("\n");
  }

  return {
    EVENT_TYPES,
    SCHEMA_VERSION,
    appendSnapshot,
    buildPeopleIndex,
    compareReports,
    emptyTimeline,
    eventLabel,
    eventsToCsv,
    latestReport,
    normalizeSnapshot,
    normalizeTimeline,
    relationshipToCsv,
    snapshotForReport,
    summarizeSnapshot,
  };
});
