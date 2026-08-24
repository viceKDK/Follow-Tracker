(function (root, factory) {
  const history = root && root.FollowTrackerHistory
    ? root.FollowTrackerHistory
    : (typeof module === "object" && module.exports ? require("./history.js") : null);
  const api = factory(history);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerMaintenance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History) {
  "use strict";

  if (!History) throw new Error("Follow Tracker History no fue cargado.");

  function normalizedTimeline(value) {
    return History.normalizeTimeline(value, value && value.profile);
  }

  function rollbackPreview(timelineValue) {
    const timeline = normalizedTimeline(timelineValue);
    if (timeline.reports.length < 2) return null;
    return {
      current: timeline.reports[timeline.reports.length - 1],
      target: timeline.reports[timeline.reports.length - 2],
      reportCount: timeline.reports.length,
    };
  }

  function truncateToReport(timelineValue, reportId) {
    const timeline = normalizedTimeline(timelineValue);
    const targetIndex = timeline.reports.findIndex((report) => report.id === reportId);
    if (targetIndex < 0) return null;

    const target = timeline.reports[targetIndex];
    const snapshot = History.snapshotForReport(timeline, target.id);
    if (!snapshot) return null;

    const keptReports = timeline.reports.slice(0, targetIndex + 1);
    const keptReportIds = new Set(keptReports.map((report) => report.id));
    const keptEvents = timeline.events.filter((event) => keptReportIds.has(event.reportId));
    const removedReports = timeline.reports.slice(targetIndex + 1);
    const removedEvents = timeline.events.filter((event) => !keptReportIds.has(event.reportId));

    const nextTimeline = History.normalizeTimeline(
      {
        ...timeline,
        updatedAt: target.capturedAt,
        reports: keptReports,
        events: keptEvents,
      },
      timeline.profile
    );

    return {
      snapshot,
      timeline: nextTimeline,
      target,
      removedReports,
      removedEvents,
    };
  }

  function rollbackLatest(timelineValue) {
    const preview = rollbackPreview(timelineValue);
    if (!preview) return null;
    return truncateToReport(timelineValue, preview.target.id);
  }

  function createRecoveryPoint(snapshot, timelineValue, createdAt) {
    const timeline = normalizedTimeline(timelineValue);
    const preview = rollbackPreview(timeline);
    if (!snapshot || !preview) return null;
    return {
      schemaVersion: 1,
      profile: timeline.profile,
      createdAt: new Date(createdAt || Date.now()).toISOString(),
      fromReportId: preview.current.id,
      toReportId: preview.target.id,
      snapshot: History.normalizeSnapshot(snapshot),
      timeline,
    };
  }

  function canRestoreRecovery(recoveryValue, timelineValue) {
    const recovery = recoveryValue && typeof recoveryValue === "object" ? recoveryValue : null;
    if (!recovery || !recovery.snapshot || !recovery.timeline) return false;
    const currentTimeline = normalizedTimeline(timelineValue);
    const latest = currentTimeline.reports[currentTimeline.reports.length - 1] || null;
    return Boolean(
      latest &&
      recovery.profile === currentTimeline.profile &&
      recovery.toReportId === latest.id &&
      recovery.fromReportId
    );
  }

  return {
    canRestoreRecovery,
    createRecoveryPoint,
    rollbackLatest,
    rollbackPreview,
    truncateToReport,
  };
});
