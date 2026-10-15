"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRecentIndex, selectRecent } = require("./recent-core.js");

const date = (day) => `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`;
function report(day, changes, baseline = false) {
  return { id: `r${day}`, capturedAt: date(day), isBaseline: baseline, changes: {
    newFollowers: [], newFollowing: [], lostFollowers: [], lostFollowing: [], ...changes,
  } };
}
const timeline = {
  baseline: { reportId: "r1", capturedAt: date(1), followers: ["ana"], following: ["ana"] },
  reports: [
    report(1, {}, true),
    report(2, { newFollowers: ["beto"], newFollowing: ["diana"] }),
    report(3, { newFollowers: ["carla"], newFollowing: ["eva"] }),
  ],
};
const snapshot = {
  profile: "demo", updatedAt: date(3),
  followers: ["ana", "beto", "carla"],
  following: ["ana", "diana", "eva"],
};

test("no inventa fechas para cuentas presentes en la primera captura", () => {
  const index = buildRecentIndex(snapshot, timeline);
  assert.equal(index.followers.find((person) => person.username === "ana").observedAt, null);
  assert.equal(index.followersCounts.detected, 2);
  assert.equal(index.followingCounts.detected, 2);
  assert.deepEqual(selectRecent(index, { kind: "followers" }).items.map((person) => person.username), ["carla", "beto"]);
  assert.deepEqual(selectRecent(index, { kind: "following" }).items.map((person) => person.username), ["eva", "diana"]);
});

test("permite filtrar último reporte, ordenar y buscar", () => {
  const index = buildRecentIndex(snapshot, timeline);
  assert.deepEqual(selectRecent(index, { scope: "latest" }).items.map((person) => person.username), ["carla"]);
  assert.deepEqual(selectRecent(index, { scope: "all" }).items.map((person) => person.username), ["carla", "beto", "ana"]);
  assert.deepEqual(selectRecent(index, { scope: "all", sort: "name" }).items.map((person) => person.username), ["ana", "beto", "carla"]);
  assert.deepEqual(selectRecent(index, { sort: "oldest" }).items.map((person) => person.username), ["beto", "carla"]);
  assert.equal(selectRecent(index, { query: "@CAR" }).total, 1);
  assert.equal(selectRecent(index, { query: "@nada" }).total, 0);
});

test("no incluye cuentas que ya no pertenecen a la lista actual", () => {
  const index = buildRecentIndex({ ...snapshot, followers: ["ana", "carla"] }, timeline);
  assert.deepEqual(selectRecent(index).items.map((person) => person.username), ["carla"]);
  assert.equal(index.followersCounts.total, 2);
});

test("un refollow posterior se presenta como nueva detección y admite paginación", () => {
  const reports = [...timeline.reports, report(4, { newFollowers: ["beto"] })];
  const index = buildRecentIndex(snapshot, { ...timeline, reports });
  assert.deepEqual(selectRecent(index).items.map((person) => person.username), ["beto", "carla"]);
  const page = selectRecent(index, { limit: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.hasMore, true);
});

test("primera captura sin diferencias no afirma un orden inexistente", () => {
  const index = buildRecentIndex({ followers: ["ana", "incorrecto!"], following: ["ana"] }, { reports: [report(1, {}, true)] });
  assert.equal(selectRecent(index).total, 0);
  assert.equal(selectRecent(index, { scope: "all" }).total, 1);
  assert.equal(index.followersCounts.latest, 0);
});
