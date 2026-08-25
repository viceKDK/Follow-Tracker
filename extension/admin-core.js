(function (root, factory) {
  const trust = root && root.FollowTrackerTrust
    ? root.FollowTrackerTrust
    : (typeof module === "object" && module.exports ? require("./trust-core.js") : null);
  const history = root && root.FollowTrackerHistory
    ? root.FollowTrackerHistory
    : (typeof module === "object" && module.exports ? require("./history.js") : null);
  const api = factory(trust, history);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerAdminCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Trust, History) {
  "use strict";

  if (!Trust || !History) throw new Error("Follow Tracker Admin Core no pudo cargar sus dependencias.");

  function profilesFromStorage(items) {
    return Object.keys(items || {})
      .filter((key) => key.startsWith("ft_history_") && items[key])
      .map((key) => Trust.safeProfile(items[key].profile || key.slice("ft_history_".length)))
      .filter((profile, index, list) => list.indexOf(profile) === index)
      .sort();
  }

  function profileBytes(profile, items) {
    const keys = Trust.storageKeys(profile);
    return Object.values(keys).reduce((total, key) => total + Trust.estimateBytes(items && items[key]), 0);
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
  }

  function snapshotsForTimeline(profile, timeline) {
    const normalized = History.normalizeTimeline(timeline, profile);
    return normalized.reports.map((report) => ({
      report,
      snapshot: History.snapshotForReport(normalized, report.id),
    })).filter((entry) => entry.snapshot);
  }

  function rebuildCombinedTimeline(targetProfile, entries) {
    let timeline = null;
    let previous = null;
    const seen = new Set();
    const ordered = [...(entries || [])].sort((a, b) =>
      new Date(a.report && a.report.capturedAt).getTime() - new Date(b.report && b.report.capturedAt).getTime()
    );
    ordered.forEach(({ report, snapshot }) => {
      const id = report && (report.id || report.runId);
      if (!id || !snapshot || seen.has(id)) return;
      seen.add(id);
      const current = {
        ...snapshot,
        profile: targetProfile,
        updatedAt: report.capturedAt,
        runId: report.runId || id,
        reportId: id,
      };
      timeline = History.appendSnapshot(timeline, previous, current);
      previous = current;
    });
    return { timeline, snapshot: previous };
  }

  function replaceUsername(values, fromValue, toValue) {
    const from = Trust.normalizeUsername(fromValue);
    const to = Trust.normalizeUsername(toValue);
    return [...new Set((values || [])
      .map((value) => Trust.normalizeUsername(value) === from ? to : Trust.normalizeUsername(value))
      .filter(Boolean))]
      .sort();
  }

  function mergePeopleMetadata(sourceValue, targetValue, profile) {
    const source = sourceValue && sourceValue.people || {};
    const target = targetValue && targetValue.people || {};
    const people = { ...source, ...target };
    Object.keys(people).forEach((username) => {
      const left = source[username] || {};
      const right = target[username] || {};
      people[username] = {
        ...left,
        ...right,
        pinned: left.pinned === true || right.pinned === true,
        note: String(right.note || left.note || ""),
        tags: [...new Set([...(left.tags || []), ...(right.tags || [])])],
        updatedAt: new Date().toISOString(),
      };
    });
    return { schemaVersion: 1, profile: Trust.safeProfile(profile), people, updatedAt: new Date().toISOString() };
  }

  return {
    formatBytes,
    mergePeopleMetadata,
    profileBytes,
    profilesFromStorage,
    rebuildCombinedTimeline,
    replaceUsername,
    snapshotsForTimeline,
  };
});
