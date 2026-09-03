(function (root, factory) {
  // In CommonJS always load the complete history/projection chain. A core-only
  // domain may already exist on globalThis after requiring core.js, but it does
  // not expose appendSnapshot/normalizeTimeline and must not shadow this module.
  const domain = typeof module === "object" && module.exports
    ? require("./follower-projections.js")
    : (root && root.FollowTrackerFollowerDomain ? root.FollowTrackerFollowerDomain : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain) {
  "use strict";

  if (!Domain) throw new Error("Follow Tracker Follower Domain no fue cargado.");

  return {
    Domain,
    EVENT_TYPES: Domain.EVENT_TYPES,
    SCHEMA_VERSION: Domain.TIMELINE_SCHEMA_VERSION,
    appendSnapshot: Domain.appendSnapshot,
    buildDashboardProjection: Domain.buildDashboardProjection,
    buildPeopleIndex: Domain.buildPeopleIndex,
    compareReports: Domain.compareReports,
    deriveCategories: Domain.deriveCategories,
    diffSnapshots: Domain.diffSnapshots,
    emptyTimeline: Domain.emptyTimeline,
    eventLabel: Domain.eventLabel,
    eventsToCsv: Domain.eventsToCsv,
    latestReport: Domain.latestReport,
    matchesPeopleFilter: Domain.matchesPeopleFilter,
    normalizeSnapshot: Domain.normalizeSnapshot,
    normalizeTimeline: Domain.normalizeTimeline,
    relationshipToCsv: Domain.relationshipToCsv,
    selectPeople: Domain.selectPeople,
    snapshotForReport: Domain.snapshotForReport,
    summarizeSnapshot: Domain.summarizeSnapshot,
  };
});
