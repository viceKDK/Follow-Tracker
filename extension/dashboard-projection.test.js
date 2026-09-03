"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const History = require("./history.js");
const Projection = require("./dashboard-projection.js");

function fixtureState() {
  const first = {
    profile: "demo",
    followers: ["ana", "beto"],
    following: ["ana"],
    updatedAt: "2026-08-29T10:00:00Z",
    runId: "r1",
  };
  const second = {
    profile: "demo",
    followers: ["ana", "beto", "carla"],
    following: ["ana", "diana"],
    updatedAt: "2026-08-30T10:00:00Z",
    runId: "r2",
  };
  const third = {
    profile: "demo",
    followers: ["ana", "carla"],
    following: ["ana", "diana", "ema"],
    updatedAt: "2026-08-31T10:00:00Z",
    runId: "r3",
  };
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);
  timeline = History.appendSnapshot(timeline, second, third);
  return {
    snapshot: third,
    timeline,
    compareFrom: null,
    compareTo: null,
    people: [],
    relationshipTransitions: [],
  };
}

test("proyecta snapshot, personas y comparación sin reglas nuevas en la UI", () => {
  const state = fixtureState();
  const projection = Projection.projectState(state);

  assert.equal(state.projection, projection);
  assert.equal(state.people, projection.people);
  assert.equal(state.compareFrom, "r2");
  assert.equal(state.compareTo, "r3");
  assert.deepEqual(projection.latestChanges.lostFollowers, ["beto"]);
  assert.deepEqual(projection.latestChanges.newFollowing, ["ema"]);
  assert.equal(projection.summary.mutual, 1);
  assert.equal(projection.summary.followingOnly, 2);
  assert.equal(state.relationshipTransitions, projection.comparison.transitions);
});

test("la selección de comparación se normaliza fuera del render", () => {
  const reports = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
  assert.deepEqual(Projection.comparisonSelection(reports, "r3", "r1"), { from: "r1", to: "r3" });
  assert.deepEqual(Projection.comparisonSelection(reports, "r2", "r2"), { from: "r1", to: "r2" });
  assert.deepEqual(Projection.comparisonSelection(reports, "missing", "missing"), { from: "r2", to: "r3" });
});

test("cambiar reportes reconstruye la proyección autoritativa", () => {
  const state = fixtureState();
  Projection.projectState(state);
  const projection = Projection.selectComparison(state, "r1", "r3");

  assert.equal(projection.comparison.fromReport.id, "r1");
  assert.equal(projection.comparison.toReport.id, "r3");
  assert.equal(state.relationshipTransitions, projection.comparison.transitions);
});

test("callers heredados que asignan compareFrom/compareTo mantienen la proyección sincronizada", () => {
  const state = fixtureState();
  Projection.projectState(state);

  state.compareFrom = "r1";
  state.compareTo = "r3";

  assert.equal(state.compareFrom, "r1");
  assert.equal(state.compareTo, "r3");
  assert.equal(state.projection.comparison.fromReport.id, "r1");
  assert.equal(state.projection.comparison.toReport.id, "r3");
});

test("sin snapshot no inventa una proyección", () => {
  const state = { snapshot: null, timeline: null, people: ["legacy"] };
  assert.equal(Projection.projectState(state), null);
  assert.deepEqual(state.people, ["legacy"]);
});
