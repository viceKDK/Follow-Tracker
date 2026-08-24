"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("./core.js");
const History = require("./history.js");
const Trust = require("./trust-core.js");

test("mantiene una identidad estable cuando cambia el username", () => {
  const first = Trust.updateIdentityRegistry(null, [
    { id: "123", username: "nombre_viejo", full_name: "Persona" },
  ], { profile: "demo", observedAt: "2026-08-20T10:00:00Z", source: "api" });
  const second = Trust.updateIdentityRegistry(first.registry, [
    { id: "123", username: "nombre_nuevo", full_name: "Persona" },
  ], { profile: "demo", observedAt: "2026-08-21T10:00:00Z", source: "api" });

  assert.equal(second.resolved[0].canonicalUsername, "nombre_viejo");
  assert.equal(second.resolved[0].currentUsername, "nombre_nuevo");
  assert.equal(second.renames.length, 1);
  assert.equal(second.registry.aliases.nombre_viejo, "id:123");
  assert.equal(second.registry.aliases.nombre_nuevo, "id:123");
});

test("la primera ausencia queda pendiente y la segunda confirma la baja", () => {
  const previous = { profile: "demo", followers: ["ana", "beto"], following: ["ana"] };
  const first = Trust.applyAbsencePolicy(previous, ["ana"], ["ana"], null, {
    profile: "demo",
    capturedAt: "2026-08-21T10:00:00Z",
    confirmRemovalsAfter: 2,
  });
  assert.deepEqual(first.followers, ["ana", "beto"]);
  assert.equal(first.pending.followers[0].username, "beto");

  const second = Trust.applyAbsencePolicy(previous, ["ana"], ["ana"], first.state, {
    profile: "demo",
    capturedAt: "2026-08-22T10:00:00Z",
    confirmRemovalsAfter: 2,
  });
  assert.deepEqual(second.followers, ["ana"]);
  assert.equal(second.confirmed.followers[0].username, "beto");
});

test("rechaza una captura con cobertura demasiado baja", () => {
  const review = Trust.buildCaptureReview({
    previousSnapshot: { followers: Array.from({ length: 100 }, (_, index) => `u${index}`), following: [] },
    followers: Array.from({ length: 50 }, (_, index) => `u${index}`),
    following: [],
    expectedFollowers: 100,
    expectedFollowing: 0,
    source: "api",
  });
  assert.equal(review.status, "rejected");
  assert.ok(review.score < 50);
});

test("marca para revisión una caída inusual aunque la cobertura sea completa", () => {
  const review = Trust.buildCaptureReview({
    previousSnapshot: { followers: Array.from({ length: 100 }, (_, index) => `u${index}`), following: [] },
    followers: Array.from({ length: 70 }, (_, index) => `u${index}`),
    following: [],
    expectedFollowers: 70,
    expectedFollowing: 0,
    source: "instagram_export",
  });
  assert.equal(review.status, "review");
  assert.ok(review.reasons.some((reason) => /caída/i.test(reason)));
});

test("interpreta los JSON oficiales de seguidores y seguidos", () => {
  const followers = Trust.parseInstagramExportPart("followers_1.json", [
    { string_list_data: [{ value: "Ana", href: "https://instagram.com/ana/" }] },
  ]);
  const following = Trust.parseInstagramExportPart("following.json", {
    relationships_following: [
      { title: "Beto", string_list_data: [{ value: "beto" }] },
    ],
  });
  const merged = Trust.mergeInstagramExportParts([followers, following]);
  assert.deepEqual(merged.followers.map((user) => user.username), ["ana"]);
  assert.deepEqual(merged.following.map((user) => user.username), ["beto"]);
  assert.equal(merged.complete, true);
});

test("elimina un reporte intermedio y recalcula los posteriores", () => {
  const first = {
    profile: "demo",
    followers: ["ana"],
    following: ["ana"],
    updatedAt: "2026-08-20T10:00:00Z",
    runId: "r1",
  };
  const second = {
    ...first,
    followers: ["ana", "beto"],
    updatedAt: "2026-08-21T10:00:00Z",
    runId: "r2",
  };
  const third = {
    ...second,
    followers: ["ana", "carla"],
    updatedAt: "2026-08-22T10:00:00Z",
    runId: "r3",
  };
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);
  timeline = History.appendSnapshot(timeline, second, third);

  const rebuilt = Trust.rebuildTimelineWithoutReport(History, timeline, "r2");
  assert.deepEqual(rebuilt.timeline.reports.map((report) => report.id), ["r1", "r3"]);
  assert.deepEqual(rebuilt.snapshot.followers, ["ana", "carla"]);
  const comparison = History.compareReports(rebuilt.timeline, "r1", "r3");
  assert.deepEqual(comparison.followers.added, ["carla"]);
});

test("recuerda cuándo hace falta un nuevo backup", () => {
  const timeline = {
    reports: [
      { id: "r1" },
      { id: "r2" },
      { id: "r3" },
      { id: "r4" },
      { id: "r5" },
      { id: "r6" },
    ],
  };
  const reminder = Trust.backupReminder(
    { reportId: "r1", backedUpAt: "2026-08-23T10:00:00Z" },
    timeline,
    "2026-08-24T10:00:00Z"
  );
  assert.equal(reminder.due, true);
  assert.equal(reminder.reportsSince, 5);
});

test("calcula claves laterales de almacenamiento sin mezclar perfiles", () => {
  const keys = Trust.storageKeys("Mi Perfil");
  assert.equal(keys.history, "ft_history_mi_perfil");
  assert.equal(keys.identities, "ft_identity_mi_perfil");
  assert.equal(keys.peopleMeta, "ft_people_meta_mi_perfil");
  assert.notEqual(keys.history, keys.timeline);
});
