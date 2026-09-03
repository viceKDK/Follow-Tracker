"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("core.js seguido de history.js conserva el dominio completo de historial", () => {
  const previousDomain = globalThis.FollowTrackerFollowerDomain;
  try {
    delete globalThis.FollowTrackerFollowerDomain;
    const Core = require("./core.js");
    assert.equal(typeof Core.compareSnapshots, "function");
    assert.equal(typeof globalThis.FollowTrackerFollowerDomain, "object");

    const History = require("./history.js");
    assert.equal(typeof History.appendSnapshot, "function");
    assert.equal(typeof History.compareReports, "function");
    assert.equal(typeof History.buildDashboardProjection, "function");

    const first = {
      profile: "demo",
      followers: ["ana"],
      following: ["ana"],
      updatedAt: "2026-08-30T10:00:00Z",
      runId: "r1",
    };
    const second = {
      ...first,
      followers: ["ana", "beto"],
      updatedAt: "2026-08-31T10:00:00Z",
      runId: "r2",
    };
    let timeline = History.appendSnapshot(null, null, first);
    timeline = History.appendSnapshot(timeline, first, second);
    assert.deepEqual(timeline.reports.map((report) => report.id), ["r1", "r2"]);
    assert.deepEqual(timeline.reports[1].changes.newFollowers, ["beto"]);
  } finally {
    if (previousDomain === undefined) delete globalThis.FollowTrackerFollowerDomain;
    else globalThis.FollowTrackerFollowerDomain = previousDomain;
  }
});
