(function (root, factory) {
  const domain = root && root.FollowTrackerFollowerDomain ? root.FollowTrackerFollowerDomain
    : (typeof module === "object" && module.exports ? require("./follower-history-model.js") : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = Object.assign(domain, api);
  if (root && domain) Object.assign(domain, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain) {
  "use strict";
  if (!Domain) throw new Error("Follow Tracker Follower History Model no fue cargado.");
  const { EVENT_TYPES, MAX_EVENTS, MAX_REPORTS, MODEL_SCHEMA_VERSION, SNAPSHOT_SCHEMA_VERSION, TIMELINE_SCHEMA_VERSION,
    createSnapshot, deriveCategories, diffSnapshots, normalizeSnapshot, normalizeUsername, usernameSet, normalizeTimeline, emptyTimeline, normalizeChanges,
    reportIdFor, baselineFromSnapshot, emptyChanges, normalizeUsers } = Domain;

  function eventFor(snapshot, reportId, type, username) {
    const normalized = normalizeUsername(username);
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

  function applyChanges(snapshotValue, changesValue, report) {
    const snapshot = normalizeSnapshot(snapshotValue);
    if (!snapshot) return null;
    const followers = usernameSet(snapshot.followers);
    const following = usernameSet(snapshot.following);
    const changes = normalizeChanges(changesValue);
    changes.lostFollowers.forEach((username) => followers.delete(username));
    changes.newFollowers.forEach((username) => followers.add(username));
    changes.lostFollowing.forEach((username) => following.delete(username));
    changes.newFollowing.forEach((username) => following.add(username));
    return createSnapshot({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      profile: snapshot.profile,
      followers: [...followers].sort(),
      following: [...following].sort(),
      updatedAt: report ? report.capturedAt : snapshot.updatedAt,
      runId: report ? report.runId : snapshot.runId,
      reportId: report ? report.id : snapshot.reportId,
      users: normalizeUsers([...(snapshot.users || []), ...(report && report.users || [])]),
    });
  }

  function snapshotForReport(timelineValue, reportId) {
    const timeline = normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    if (!timeline.baseline || !timeline.reports.length) return null;
    const reports = timeline.reports;
    const baselineIndex = reports.findIndex((report) => report.id === timeline.baseline.reportId);
    const targetIndex = reports.findIndex((report) => report.id === reportId);
    if (targetIndex < 0) return null;
    if (baselineIndex >= 0 && targetIndex < baselineIndex) return null;

    let snapshot = createSnapshot({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      profile: timeline.profile,
      followers: timeline.baseline.followers,
      following: timeline.baseline.following,
      updatedAt: timeline.baseline.capturedAt,
      runId: timeline.baseline.runId,
      reportId: timeline.baseline.reportId,
      users: timeline.baseline.users,
    });
    if (reportId === timeline.baseline.reportId) return snapshot;

    const start = baselineIndex >= 0 ? baselineIndex + 1 : 0;
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
    const diff = canCompare ? diffSnapshots(previous, current) : null;
    const categories = deriveCategories(current);
    const changes = diff ? diff.changes : emptyChanges();
    const changedUsernames = new Set([
      ...changes.newFollowers, ...changes.lostFollowers,
      ...changes.newFollowing, ...changes.lostFollowing,
    ]);
    const reportUsers = normalizeUsers([...(previous && previous.users || []), ...(current.users || [])])
      .filter((user) => changedUsernames.has(user.username));

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
      mutualCount: categories.counts.mutual,
      followerOnlyCount: categories.counts.followersOnly,
      followingOnlyCount: categories.counts.followingOnly,
      categoryCounts: {
        mutual: categories.counts.mutual,
        followersOnly: categories.counts.followersOnly,
        followingOnly: categories.counts.followingOnly,
      },
      categoryDelta: diff ? diff.categoryDelta : { mutual: 0, followersOnly: 0, followingOnly: 0 },
      users: reportUsers,
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
    return normalizeTimeline(compactTimeline(timeline), current.profile);
  }

  function compareReports(timelineValue, fromReportId, toReportId) {
    const timeline = normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    const fromReport = timeline.reports.find((report) => report.id === fromReportId) || null;
    const toReport = timeline.reports.find((report) => report.id === toReportId) || null;
    if (!fromReport || !toReport) return null;
    const fromSnapshot = snapshotForReport(timeline, fromReport.id);
    const toSnapshot = snapshotForReport(timeline, toReport.id);
    if (!fromSnapshot || !toSnapshot) return null;
    const diff = diffSnapshots(fromSnapshot, toSnapshot);
    return {
      schemaVersion: MODEL_SCHEMA_VERSION,
      fromReport,
      toReport,
      followers: diff.followers,
      following: diff.following,
      mutualDelta: diff.categoryDelta.mutual,
      categoryDelta: diff.categoryDelta,
      beforeCategories: diff.beforeCategories,
      afterCategories: diff.afterCategories,
      transitions: diff.transitions,
      transitionCounts: diff.transitionCounts,
      changes: diff.changes,
      fromSnapshot,
      toSnapshot,
    };
  }

  return { eventFor, applyChanges, snapshotForReport, compactTimeline, appendSnapshot, compareReports };
});
