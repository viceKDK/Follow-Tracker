(function (root, factory) {
  const History = root && root.FollowTrackerHistory
    ? root.FollowTrackerHistory
    : (typeof module === "object" && module.exports ? require("./history-guard.js") : null);
  const api = factory(History);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (History) Object.assign(History, api);
  if (root) root.FollowTrackerHistoryQuality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History) {
  "use strict";

  if (!History) throw new Error("Follow Tracker History Guard debe cargarse primero.");
  const guardedAppend = History.appendSnapshot.bind(History);

  function reportIdFor(snapshot) {
    const normalized = History.normalizeSnapshot(snapshot);
    if (!normalized) return "";
    return normalized.runId || normalized.reportId ||
      `capture-${normalized.updatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  }

  function summarizeQuality(timeline) {
    const reports = Array.isArray(timeline && timeline.reports) ? timeline.reports : [];
    const suspiciousReports = reports
      .filter((report) => report.quality && report.quality.needsReview)
      .map((report) => report.id);
    const identicalReports = reports
      .filter((report) => report.quality && report.quality.identical)
      .map((report) => report.id);
    const reorderedReports = reports
      .filter((report) => report.quality && report.quality.reversed)
      .map((report) => report.id);
    return {
      needsReview: suspiciousReports.length > 0,
      suspiciousReports,
      identicalReports,
      reorderedReports,
    };
  }

  function appendSnapshotWithQuality(existingTimeline, previousSnapshot, currentSnapshot) {
    const rawAudit = History.auditSnapshotPair(previousSnapshot, currentSnapshot);
    const timeline = guardedAppend(existingTimeline, previousSnapshot, currentSnapshot);
    const currentId = reportIdFor(currentSnapshot);
    const report = Array.isArray(timeline.reports)
      ? timeline.reports.find((item) => item.id === currentId)
      : null;
    if (report) {
      report.quality = {
        ...(report.quality || {}),
        ...rawAudit,
        importedOutOfOrder: rawAudit.reversed === true,
      };
    }
    timeline.quality = summarizeQuality(timeline);
    return timeline;
  }

  return {
    appendSnapshot: appendSnapshotWithQuality,
    appendSnapshotWithQuality,
    summarizeQuality,
  };
});
