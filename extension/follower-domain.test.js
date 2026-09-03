"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Domain = require("./history.js").Domain;

function snapshot(overrides) {
  return Domain.createSnapshot({
    profile: "Demo Profile",
    followers: ["Ana", "beto"],
    following: ["ana", "diana"],
    updatedAt: "2026-08-20T10:00:00.000Z",
    runId: "run-1",
    ...overrides,
  });
}

test("normaliza usernames, URLs y duplicados antes de crear un snapshot", () => {
  const value = Domain.createSnapshot({
    profile: "Mi Perfil",
    followers: [" @Ana ", "https://www.instagram.com/ANA/", { username: "beto" }, "in válido"],
    following: [{ value: "CARLA" }, "@carla"],
    updatedAt: "2026-08-20T10:00:00Z",
  });
  assert.equal(value.profile, "mi_perfil");
  assert.deepEqual(value.followers, ["ana", "beto", "invlido"]);
  assert.deepEqual(value.following, ["carla"]);
});

test("normaliza y combina partes oficiales divididas", () => {
  const merged = Domain.mergeInstagramExportParts([
    {
      name: "followers_1.json",
      payload: [
        { string_list_data: [{ value: "Ana" }, { href: "https://instagram.com/beto/" }] },
      ],
    },
    {
      name: "followers_2.json",
      payload: [{ string_list_data: [{ value: "ANA" }, { value: "carla" }] }],
    },
    {
      name: "following.json",
      payload: {
        relationships_following: [
          { title: "Ana", string_list_data: [{ value: "ana" }] },
          { title: "Diana", string_list_data: [{ value: "diana" }] },
        ],
      },
    },
  ]);
  assert.equal(merged.complete, true);
  assert.deepEqual(merged.followers.map((user) => user.username), ["ana", "beto", "carla"]);
  assert.deepEqual(merged.following.map((user) => user.username), ["ana", "diana"]);
});

test("el motor de diff entrega movimientos, deltas y categorías desde una sola regla", () => {
  const before = snapshot();
  const after = snapshot({
    followers: ["ana", "carla"],
    following: ["ana", "beto"],
    updatedAt: "2026-08-21T10:00:00Z",
    runId: "run-2",
  });
  const diff = Domain.diffSnapshots(before, after);
  assert.deepEqual(diff.changes, {
    newFollowers: ["carla"],
    lostFollowers: ["beto"],
    newFollowing: ["beto"],
    lostFollowing: ["diana"],
  });
  assert.equal(diff.followers.delta, 0);
  assert.deepEqual(diff.afterCategories.mutual, ["ana"]);
  assert.deepEqual(diff.afterCategories.followingOnly, ["beto"]);
  assert.deepEqual(diff.afterCategories.followersOnly, ["carla"]);
  const beto = diff.transitions.find((item) => item.username === "beto");
  assert.equal(beto.headline, "Te dejó de seguir y ahora lo seguís");
});

test("la primera captura crea baseline y la segunda eventos idempotentes", () => {
  const first = snapshot();
  const second = snapshot({
    followers: ["ana", "carla"],
    following: ["ana", "elena"],
    updatedAt: "2026-08-21T15:30:00Z",
    runId: "run-2",
  });
  let timeline = Domain.appendSnapshot(null, null, first);
  timeline = Domain.appendSnapshot(timeline, first, second);
  assert.equal(timeline.reports.length, 2);
  assert.deepEqual(timeline.reports[1].changes.lostFollowers, ["beto"]);
  assert.equal(timeline.events.find((event) => event.username === "beto").type, Domain.EVENT_TYPES.UNFOLLOWED_YOU);
  const once = JSON.stringify(timeline);
  timeline = Domain.appendSnapshot(timeline, first, second);
  assert.equal(JSON.stringify(timeline), once);
});

test("reconstruye reportes no consecutivos y genera una proyección lista para UI", () => {
  const first = snapshot();
  const second = snapshot({
    followers: ["ana", "carla"],
    following: ["ana", "diana", "elena"],
    updatedAt: "2026-08-21T10:00:00Z",
    runId: "run-2",
  });
  const third = snapshot({
    followers: ["ana", "carla", "dora"],
    following: ["ana", "elena"],
    updatedAt: "2026-08-22T10:00:00Z",
    runId: "run-3",
  });
  let timeline = Domain.appendSnapshot(null, null, first);
  timeline = Domain.appendSnapshot(timeline, first, second);
  timeline = Domain.appendSnapshot(timeline, second, third);
  const comparison = Domain.compareReports(timeline, "run-1", "run-3");
  assert.deepEqual(comparison.followers.added, ["carla", "dora"]);
  assert.deepEqual(comparison.followers.removed, ["beto"]);
  assert.equal(comparison.transitionCounts.changed > 0, true);

  const projection = Domain.buildDashboardProjection(third, timeline);
  assert.equal(projection.summary.followers, 3);
  assert.equal(projection.latestReport.id, "run-3");
  assert.equal(projection.people.some((person) => person.username === "beto" && person.relationship === "historical"), true);
  assert.equal(projection.comparison.toReport.id, "run-3");
});

test("los selectores filtran proyecciones sin volver a derivar reglas en la UI", () => {
  const rows = Domain.buildTransitions({
    fromSnapshot: snapshot(),
    toSnapshot: snapshot({ followers: ["ana", "carla"], following: ["ana", "beto"] }),
  });
  assert.deepEqual(
    Domain.selectTransitions(rows, { filter: "unfollowed-you" }).map((item) => item.username),
    ["beto"]
  );
  assert.equal(Domain.transitionFilterCount(rows, "followed-you"), 1);
});

test("CSV neutraliza fórmulas", () => {
  const csv = Domain.eventsToCsv([{ username: "=HACK", type: "unfollowed_you", occurredAt: "2026-08-21", reportId: "r", runId: "r" }]);
  assert.match(csv, /'=HACK/);
});
