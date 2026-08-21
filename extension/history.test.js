"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const History = require("./history.js");

function snapshot(overrides) {
  return {
    schemaVersion: 2,
    profile: "demo_profile",
    followers: ["ana", "beto"],
    following: ["ana", "diana"],
    updatedAt: "2026-08-20T10:00:00.000Z",
    runId: "run-1",
    ...overrides,
  };
}

test("la primera captura crea una linea base sin inventar eventos", () => {
  const timeline = History.appendSnapshot(null, null, snapshot());
  assert.equal(timeline.reports.length, 1);
  assert.equal(timeline.reports[0].isBaseline, true);
  assert.equal(timeline.events.length, 0);
  assert.equal(timeline.reports[0].followersCount, 2);
  assert.equal(timeline.reports[0].followingOnlyCount, 1);
  assert.deepEqual(timeline.baseline.followers, ["ana", "beto"]);
});

test("una captura posterior registra persona, fecha y reporte exactos", () => {
  const first = snapshot();
  const second = snapshot({
    followers: ["ana", "carla"],
    following: ["ana", "elena"],
    updatedAt: "2026-08-21T15:30:00.000Z",
    runId: "run-2",
  });
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);

  assert.equal(timeline.reports.length, 2);
  assert.deepEqual(timeline.reports[1].changes.lostFollowers, ["beto"]);
  const event = timeline.events.find((item) => item.username === "beto");
  assert.equal(event.type, History.EVENT_TYPES.UNFOLLOWED_YOU);
  assert.equal(event.occurredAt, "2026-08-21T15:30:00.000Z");
  assert.equal(event.reportId, "run-2");
  assert.equal(event.runId, "run-2");
});

test("reprocesar el mismo run_id no duplica reportes ni eventos", () => {
  const first = snapshot();
  const second = snapshot({ followers: ["ana"], runId: "run-2" });
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);
  const once = JSON.stringify(timeline);
  timeline = History.appendSnapshot(timeline, first, second);
  assert.equal(JSON.stringify(timeline), once);
});

test("el indice conserva usuarios historicos aunque ya no esten en las listas", () => {
  const first = snapshot();
  const second = snapshot({ followers: ["ana"], following: ["ana"], runId: "run-2" });
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);
  const people = History.buildPeopleIndex(second, timeline);
  const beto = people.find((person) => person.username === "beto");
  assert.equal(beto.relationship, "historical");
  assert.equal(beto.hasUnfollowedYou, true);
});

test("reconstruye capturas y compara dos reportes no consecutivos", () => {
  const first = snapshot();
  const second = snapshot({
    followers: ["ana", "carla"],
    following: ["ana", "diana", "elena"],
    updatedAt: "2026-08-21T10:00:00.000Z",
    runId: "run-2",
  });
  const third = snapshot({
    followers: ["ana", "carla", "dora"],
    following: ["ana", "elena"],
    updatedAt: "2026-08-22T10:00:00.000Z",
    runId: "run-3",
  });

  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);
  timeline = History.appendSnapshot(timeline, second, third);

  const reconstructed = History.snapshotForReport(timeline, "run-2");
  assert.deepEqual(reconstructed.followers, ["ana", "carla"]);
  assert.deepEqual(reconstructed.following, ["ana", "diana", "elena"]);

  const comparison = History.compareReports(timeline, "run-1", "run-3");
  assert.deepEqual(comparison.followers.added, ["carla", "dora"]);
  assert.deepEqual(comparison.followers.removed, ["beto"]);
  assert.equal(comparison.followers.delta, 1);
  assert.deepEqual(comparison.following.added, ["elena"]);
  assert.deepEqual(comparison.following.removed, ["diana"]);
  assert.equal(comparison.following.delta, 0);
});

test("la exportacion CSV neutraliza formulas", () => {
  const csv = History.eventsToCsv([{ username: "=HACK", type: "unfollowed_you", occurredAt: "2026-08-21", reportId: "r", runId: "r" }]);
  assert.match(csv, /'=HACK/);
});
