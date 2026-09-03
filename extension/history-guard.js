(function (root, factory) {
  const History = root && root.FollowTrackerHistory
    ? root.FollowTrackerHistory
    : (typeof module === "object" && module.exports ? require("./history.js") : null);
  const Core = root && root.FollowTrackerCore
    ? root.FollowTrackerCore
    : (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(History, Core);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (History) Object.assign(History, api);
  if (root) root.FollowTrackerHistoryGuard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History, Core) {
  "use strict";

  if (!History || !Core) throw new Error("Follow Tracker History y Core deben cargarse antes del guard.");

  const originalAppendSnapshot = History.appendSnapshot.bind(History);
  const originalCompareReports = History.compareReports.bind(History);

  function reportIdFor(snapshot) {
    const normalized = History.normalizeSnapshot(snapshot);
    if (!normalized) return "";
    return normalized.runId || normalized.reportId ||
      `capture-${normalized.updatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  }

  function rowUsername(row) {
    const value = typeof row === "string" ? row : row && row.username;
    return String(value || "").trim().toLowerCase();
  }

  function stableId(row) {
    if (!row || typeof row !== "object") return "";
    return String(row.id || row.pk || row.profileId || row.userId || "").trim();
  }

  function fullName(row) {
    if (!row || typeof row !== "object") return "";
    const value = String(row.fullName || row.full_name || row.name || "").trim().toLowerCase();
    return value === "sin nombre" ? "" : value;
  }

  function countDuplicates(rows) {
    const seen = new Set();
    let duplicates = 0;
    (rows || []).forEach((row) => {
      const username = rowUsername(row);
      if (!username) return;
      if (seen.has(username)) duplicates += 1;
      else seen.add(username);
    });
    return duplicates;
  }

  function snapshotFingerprint(snapshot) {
    const normalized = History.normalizeSnapshot(snapshot);
    if (!normalized) return "";
    return JSON.stringify({
      profile: normalized.profile,
      followers: normalized.followers.map((value) => value.toLowerCase()),
      following: normalized.following.map((value) => value.toLowerCase()),
    });
  }

  function detectLikelyRenames(previousRows, currentRows) {
    const previous = Array.isArray(previousRows) ? previousRows : [];
    const current = Array.isArray(currentRows) ? currentRows : [];
    const currentByStableId = new Map();
    current.forEach((row) => {
      const id = stableId(row);
      if (id) currentByStableId.set(id, row);
    });

    const detected = [];
    previous.forEach((row) => {
      const id = stableId(row);
      const before = rowUsername(row);
      const match = id && currentByStableId.get(id);
      const after = rowUsername(match);
      if (before && after && before !== after) {
        detected.push({ before, after, confidence: "high", reason: "stable_id" });
      }
    });

    const previousNames = new Map();
    const currentNames = new Map();
    previous.forEach((row) => {
      const name = fullName(row);
      if (!name) return;
      const values = previousNames.get(name) || [];
      values.push(rowUsername(row));
      previousNames.set(name, values.filter(Boolean));
    });
    current.forEach((row) => {
      const name = fullName(row);
      if (!name) return;
      const values = currentNames.get(name) || [];
      values.push(rowUsername(row));
      currentNames.set(name, values.filter(Boolean));
    });

    previousNames.forEach((beforeValues, name) => {
      const afterValues = currentNames.get(name) || [];
      if (beforeValues.length !== 1 || afterValues.length !== 1) return;
      const before = beforeValues[0];
      const after = afterValues[0];
      if (!before || !after || before === after) return;
      if (detected.some((item) => item.before === before && item.after === after)) return;
      detected.push({ before, after, confidence: "possible", reason: "unique_full_name" });
    });

    return detected.sort((a, b) => a.before.localeCompare(b.before));
  }

  function auditSnapshotPair(previousValue, currentValue) {
    const previous = History.normalizeSnapshot(previousValue);
    const current = History.normalizeSnapshot(currentValue);
    if (!current) {
      return { valid: false, needsReview: true, issues: ["invalid_current_snapshot"] };
    }

    const previousFollowerCount = previous ? previous.followers.length : 0;
    const previousFollowingCount = previous ? previous.following.length : 0;
    const followerDrop = previous ? previousFollowerCount - current.followers.length : 0;
    const followingDrop = previous ? previousFollowingCount - current.following.length : 0;
    const suspiciousFollowerDrop = previousFollowerCount >= 20 &&
      followerDrop >= Math.max(10, Math.ceil(previousFollowerCount * 0.3));
    const suspiciousFollowingDrop = previousFollowingCount >= 20 &&
      followingDrop >= Math.max(10, Math.ceil(previousFollowingCount * 0.3));
    const reversed = !!previous && new Date(current.updatedAt) < new Date(previous.updatedAt);
    const identical = !!previous && snapshotFingerprint(previous) === snapshotFingerprint(current);
    const duplicateFollowersRemoved = countDuplicates(currentValue && currentValue.followers);
    const duplicateFollowingRemoved = countDuplicates(currentValue && currentValue.following);
    const likelyRenames = previousValue
      ? [
          ...detectLikelyRenames(previousValue.followers, currentValue.followers),
          ...detectLikelyRenames(previousValue.following, currentValue.following),
        ]
      : [];
    const issues = [];
    if (reversed) issues.push("out_of_order");
    if (identical) issues.push("identical_to_previous");
    if (duplicateFollowersRemoved || duplicateFollowingRemoved) issues.push("duplicates_removed");
    if (suspiciousFollowerDrop) issues.push("suspicious_follower_drop");
    if (suspiciousFollowingDrop) issues.push("suspicious_following_drop");

    const previousAll = previous
      ? new Set([...previous.followers, ...previous.following].map((value) => value.toLowerCase()))
      : new Set();
    const currentAll = new Set([...current.followers, ...current.following].map((value) => value.toLowerCase()));
    const disappearedFromBoth = [...previousAll].filter((username) => !currentAll.has(username));

    return {
      valid: true,
      needsReview: suspiciousFollowerDrop || suspiciousFollowingDrop,
      issues,
      reversed,
      identical,
      duplicateFollowersRemoved,
      duplicateFollowingRemoved,
      likelyRenames,
      disappearedFromBoth,
      note: disappearedFromBoth.length
        ? "No se puede distinguir automáticamente entre cuenta eliminada, renombrada, privada o relación removida."
        : "",
    };
  }

  function snapshotsFromTimeline(timelineValue) {
    const timeline = History.normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    return timeline.reports
      .map((report) => History.snapshotForReport(timeline, report.id))
      .filter(Boolean);
  }

  function uniqueChronologicalSnapshots(values) {
    const byReport = new Map();
    (values || []).forEach((value) => {
      const normalized = History.normalizeSnapshot(value);
      if (!normalized) return;
      byReport.set(reportIdFor(normalized), normalized);
    });
    return [...byReport.values()].sort((a, b) =>
      new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() ||
      reportIdFor(a).localeCompare(reportIdFor(b))
    );
  }

  function annotateTimeline(timelineValue, snapshots, importedAudit) {
    const timeline = History.normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    const byId = new Map(snapshots.map((snapshot) => [reportIdFor(snapshot), snapshot]));
    timeline.reports = timeline.reports.map((report, index) => {
      const snapshot = byId.get(report.id);
      const previousReport = index > 0 ? timeline.reports[index - 1] : null;
      const previousSnapshot = previousReport ? byId.get(previousReport.id) : null;
      const quality = auditSnapshotPair(previousSnapshot, snapshot);
      if (importedAudit && report.id === reportIdFor(snapshots[snapshots.length - 1])) {
        quality.importedOutOfOrder = importedAudit.reversed;
      }
      return { ...report, quality };
    });
    timeline.quality = {
      needsReview: timeline.reports.some((report) => report.quality && report.quality.needsReview),
      suspiciousReports: timeline.reports
        .filter((report) => report.quality && report.quality.needsReview)
        .map((report) => report.id),
    };
    return timeline;
  }

  function rebuildTimeline(snapshots, importedAudit) {
    const ordered = uniqueChronologicalSnapshots(snapshots);
    let timeline = null;
    let previous = null;
    ordered.forEach((snapshot) => {
      timeline = originalAppendSnapshot(timeline, previous, snapshot);
      previous = snapshot;
    });
    return annotateTimeline(timeline, ordered, importedAudit);
  }

  function appendSnapshotSafe(existingTimeline, previousSnapshot, currentSnapshot) {
    const current = History.normalizeSnapshot(currentSnapshot);
    if (!current) return History.normalizeTimeline(existingTimeline, "perfil");
    const existing = snapshotsFromTimeline(existingTimeline);
    if (existing.some((snapshot) => reportIdFor(snapshot) === reportIdFor(current))) {
      return annotateTimeline(existingTimeline, existing, null);
    }
    const chronologicalPrevious = existing.length ? existing[existing.length - 1] : previousSnapshot;
    const audit = auditSnapshotPair(chronologicalPrevious, currentSnapshot);
    return rebuildTimeline([...existing, current], audit);
  }

  function compareReportsChronologically(timelineValue, firstId, secondId) {
    const timeline = History.normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    const first = timeline.reports.find((report) => report.id === firstId);
    const second = timeline.reports.find((report) => report.id === secondId);
    if (!first || !second) return null;
    const ordered = new Date(first.capturedAt) <= new Date(second.capturedAt)
      ? [first.id, second.id]
      : [second.id, first.id];
    const comparison = originalCompareReports(timeline, ordered[0], ordered[1]);
    return comparison ? { ...comparison, requestedOrderReversed: ordered[0] !== firstId } : null;
  }

  function buildMultiDateTrend(timelineValue) {
    const timeline = History.normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    return timeline.reports.map((report, index) => {
      const previous = index > 0 ? timeline.reports[index - 1] : null;
      return {
        reportId: report.id,
        capturedAt: report.capturedAt,
        followers: report.followersCount,
        following: report.followingCount,
        mutual: report.mutualCount,
        followerDelta: previous ? report.followersCount - previous.followersCount : 0,
        followingDelta: previous ? report.followingCount - previous.followingCount : 0,
        movement: report.eventCount,
        needsReview: !!(report.quality && report.quality.needsReview),
      };
    });
  }

  return {
    appendSnapshot: appendSnapshotSafe,
    appendSnapshotSafe,
    auditSnapshotPair,
    buildMultiDateTrend,
    compareReportsChronologically,
    detectLikelyRenames,
    snapshotFingerprint,
  };
});
