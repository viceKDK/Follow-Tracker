(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerRecentCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Instagram list order does not prove chronological follow order.
  function name(value) {
    const text = typeof value === "string" ? value : value && value.username;
    const normalized = String(text || "").trim().replace(/^@+/, "").toLowerCase();
    return /^[a-z0-9._]+$/.test(normalized) ? normalized : "";
  }

  function userSet(values) {
    return new Set((Array.isArray(values) ? values : []).map(name).filter(Boolean));
  }

  function time(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function buildRecentIndex(snapshotValue, timelineValue) {
    const snapshot = snapshotValue && typeof snapshotValue === "object" ? snapshotValue : {};
    const timeline = timelineValue && typeof timelineValue === "object" ? timelineValue : {};
    const reports = (Array.isArray(timeline.reports) ? timeline.reports : [])
      .filter((report) => report && typeof report === "object" && time(report.capturedAt) !== null)
      .slice().sort((a, b) => time(a.capturedAt) - time(b.capturedAt));
    const latest = reports.length ? reports[reports.length - 1] : null;
    const baselineId = timeline.baseline && timeline.baseline.reportId;
    const current = { followers: userSet(snapshot.followers), following: userSet(snapshot.following) };
    const found = { followers: new Map(), following: new Map() };

    for (const report of reports) {
      if (report.isBaseline === true || (baselineId && report.id === baselineId)) continue;
      const changes = report.changes || {};
      for (const [kind, field] of [["followers", "newFollowers"], ["following", "newFollowing"]]) {
        for (const value of Array.isArray(changes[field]) ? changes[field] : []) {
          const username = name(value);
          if (!username || !current[kind].has(username)) continue;
          // A later re-follow is itself a newly observed relationship.
          found[kind].set(username, { observedAt: report.capturedAt, reportId: String(report.id || "") });
        }
      }
    }

    const result = { profile: String(snapshot.profile || timeline.profile || ""), latestReport: latest, reportsCount: reports.length };
    for (const [kind, field] of [["followers", "newFollowers"], ["following", "newFollowing"]]) {
      const latestNames = latest && latest.isBaseline !== true && latest.id !== baselineId
        ? userSet(latest.changes && latest.changes[field])
        : new Set();
      result[kind] = [...current[kind]].map((username) => {
        const detected = found[kind].get(username) || null;
        return {
          username,
          observedAt: detected ? detected.observedAt : null,
          reportId: detected ? detected.reportId : null,
          detected: !!detected,
          inLatest: !!detected && latestNames.has(username) && detected.reportId === String(latest.id),
        };
      });
      result[kind + "Counts"] = {
        total: result[kind].length,
        detected: found[kind].size,
        latest: result[kind].filter((row) => row.inLatest).length,
      };
    }
    return result;
  }

  function selectRecent(indexValue, optionsValue) {
    const index = indexValue && typeof indexValue === "object" ? indexValue : {};
    const options = optionsValue && typeof optionsValue === "object" ? optionsValue : {};
    const kind = options.kind === "following" ? "following" : "followers";
    const scope = ["all", "latest", "detected"].includes(options.scope) ? options.scope : "detected";
    const sort = ["newest", "oldest", "name"].includes(options.sort) ? options.sort : "newest";
    const query = String(options.query || "").trim().toLowerCase().replace(/^@/, "");
    const limit = Number.isSafeInteger(options.limit) ? Math.max(1, Math.min(options.limit, 1000)) : 36;
    const rows = (Array.isArray(index[kind]) ? index[kind] : [])
      .filter((row) => (scope === "all" || (scope === "latest" ? row.inLatest : row.detected))
        && (!query || row.username.includes(query)));

    rows.sort((a, b) => {
      if (sort === "name") return a.username.localeCompare(b.username);
      if (a.detected !== b.detected) return a.detected ? -1 : 1;
      const aTime = time(a.observedAt) || 0;
      const bTime = time(b.observedAt) || 0;
      const chronological = sort === "oldest" ? aTime - bTime : bTime - aTime;
      return chronological || a.username.localeCompare(b.username);
    });
    return {
      kind, scope, sort, total: rows.length,
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
      counts: index[kind + "Counts"] || { total: 0, detected: 0, latest: 0 },
    };
  }
  return { buildRecentIndex, selectRecent };
});
