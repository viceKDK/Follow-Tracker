"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const History = require("./history.js");
const Maintenance = require("./maintenance.js");

function fixture() {
  const first = {
    schemaVersion: 2,
    profile: "demo",
    followers: ["ana", "beto"],
    following: ["ana", "diana"],
    updatedAt: "2026-08-20T10:00:00.000Z",
    runId: "r1",
    reportId: "r1",
  };
  const second = {
    ...first,
    followers: ["ana", "carla"],
    following: ["ana", "beto"],
    updatedAt: "2026-08-21T10:00:00.000Z",
    runId: "r2",
    reportId: "r2",
  };
  const third = {
    ...second,
    followers: ["ana", "carla", "eva"],
    following: ["ana", "beto", "eva"],
    updatedAt: "2026-08-24T10:00:00.000Z",
    runId: "r3",
    reportId: "r3",
  };

  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);
  timeline = History.appendSnapshot(timeline, second, third);
  return { first, second, third, timeline };
}

test("deshacer el último reporte reconstruye exactamente la captura anterior", () => {
  const { second, timeline } = fixture();
  const result = Maintenance.rollbackLatest(timeline);

  assert.ok(result);
  assert.equal(result.timeline.reports.length, 2);
  assert.equal(result.timeline.reports.at(-1).id, "r2");
  assert.deepEqual(result.snapshot.followers, second.followers);
  assert.deepEqual(result.snapshot.following, second.following);
  assert.equal(result.snapshot.reportId, "r2");
  assert.equal(result.removedReports.length, 1);
  assert.equal(result.removedReports[0].id, "r3");
  assert.equal(result.removedEvents.every((event) => event.reportId === "r3"), true);
});

test("truncar a la línea base elimina todos los eventos posteriores", () => {
  const { first, timeline } = fixture();
  const result = Maintenance.truncateToReport(timeline, "r1");

  assert.ok(result);
  assert.equal(result.timeline.reports.length, 1);
  assert.equal(result.timeline.events.length, 0);
  assert.deepEqual(result.snapshot.followers, first.followers);
  assert.deepEqual(result.snapshot.following, first.following);
});

test("no permite deshacer cuando solamente existe la línea base", () => {
  const { first } = fixture();
  const timeline = History.appendSnapshot(null, null, first);
  assert.equal(Maintenance.rollbackPreview(timeline), null);
  assert.equal(Maintenance.rollbackLatest(timeline), null);
});

test("no modifica la línea temporal original", () => {
  const { timeline } = fixture();
  const before = JSON.stringify(timeline);
  Maintenance.rollbackLatest(timeline);
  assert.equal(JSON.stringify(timeline), before);
});

test("crea un punto de recuperación y solo lo restaura sobre el reporte objetivo", () => {
  const { third, timeline } = fixture();
  const recovery = Maintenance.createRecoveryPoint(third, timeline, "2026-08-24T11:00:00.000Z");
  const rolledBack = Maintenance.rollbackLatest(timeline);

  assert.equal(recovery.fromReportId, "r3");
  assert.equal(recovery.toReportId, "r2");
  assert.equal(Maintenance.canRestoreRecovery(recovery, rolledBack.timeline), true);
  assert.equal(Maintenance.canRestoreRecovery(recovery, timeline), false);
});

test("devuelve null para un reporte inexistente", () => {
  const { timeline } = fixture();
  assert.equal(Maintenance.truncateToReport(timeline, "no-existe"), null);
});
