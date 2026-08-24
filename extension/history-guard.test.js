const test = require("node:test");
const assert = require("node:assert/strict");

const History = require("./history.js");
require("./history-guard.js");
require("./history-quality.js");

function snapshot(runId, updatedAt, followers, following = []) {
  return {
    schemaVersion: 2,
    profile: "vicente",
    runId,
    updatedAt,
    followers,
    following,
  };
}

test("dos archivos iguales crean cero eventos y quedan marcados como idénticos", () => {
  const first = snapshot("r1", "2026-08-20T10:00:00.000Z", ["ana", "bob"], ["ana"]);
  const second = snapshot("r2", "2026-08-21T10:00:00.000Z", ["ANA", "bob"], ["ana"]);
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);

  assert.equal(timeline.reports.length, 2);
  assert.equal(timeline.reports[1].eventCount, 0);
  assert.equal(timeline.reports[1].quality.identical, true);
  assert.deepEqual(timeline.events, []);
  assert.deepEqual(timeline.quality.identicalReports, ["r2"]);
});

test("una captura más vieja importada después reconstruye la cronología", () => {
  const older = snapshot("old", "2026-08-20T10:00:00.000Z", ["ana"]);
  const newer = snapshot("new", "2026-08-22T10:00:00.000Z", ["ana", "bob"]);
  let timeline = History.appendSnapshot(null, null, newer);
  timeline = History.appendSnapshot(timeline, newer, older);

  assert.deepEqual(timeline.reports.map((report) => report.id), ["old", "new"]);
  assert.equal(timeline.reports[0].quality.importedOutOfOrder, true);
  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].username, "bob");
  assert.equal(timeline.events[0].type, History.EVENT_TYPES.FOLLOWED_YOU);

  const comparison = History.compareReportsChronologically(timeline, "new", "old");
  assert.equal(comparison.requestedOrderReversed, true);
  assert.deepEqual(comparison.followers.added, ["bob"]);
  assert.deepEqual(comparison.followers.removed, []);
});

test("normaliza duplicados sin inflar los conteos", () => {
  const first = snapshot("r1", "2026-08-20T10:00:00.000Z", ["ana"]);
  const duplicateRows = [
    { username: "ana" },
    { username: "ANA" },
    { username: "bob" },
    { username: "BOB" },
  ];
  const second = snapshot("r2", "2026-08-21T10:00:00.000Z", duplicateRows);
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);

  assert.equal(timeline.reports[1].followersCount, 2);
  assert.equal(timeline.reports[1].quality.duplicateFollowersRemoved, 2);
  assert.deepEqual(
    timeline.reports[1].changes.newFollowers.map((username) => username.toLowerCase()),
    ["bob"]
  );
});

test("una caída masiva queda visible pero marcada para revisión", () => {
  const many = Array.from({ length: 100 }, (_, index) => `user_${index}`);
  const few = many.slice(0, 10);
  const first = snapshot("r1", "2026-08-20T10:00:00.000Z", many);
  const second = snapshot("r2", "2026-08-21T10:00:00.000Z", few);
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);

  assert.equal(timeline.reports[1].changes.lostFollowers.length, 90);
  assert.equal(timeline.reports[1].quality.needsReview, true);
  assert.ok(timeline.reports[1].quality.issues.includes("suspicious_follower_drop"));
  assert.deepEqual(timeline.quality.suspiciousReports, ["r2"]);
});

test("detecta un cambio de usuario por identificador estable", () => {
  const first = snapshot("r1", "2026-08-20T10:00:00.000Z", [
    { id: "ig-42", username: "nombre_viejo", fullName: "Persona Real" },
  ]);
  const second = snapshot("r2", "2026-08-21T10:00:00.000Z", [
    { id: "ig-42", username: "nombre_nuevo", fullName: "Persona Real" },
  ]);
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);

  assert.deepEqual(timeline.reports[1].quality.likelyRenames, [{
    before: "nombre_viejo",
    after: "nombre_nuevo",
    confidence: "high",
    reason: "stable_id",
  }]);
});

test("genera una tendencia de múltiples fechas con deltas por reporte", () => {
  const first = snapshot("r1", "2026-08-20T10:00:00.000Z", ["ana"]);
  const second = snapshot("r2", "2026-08-21T10:00:00.000Z", ["ana", "bob", "cami"]);
  const third = snapshot("r3", "2026-08-22T10:00:00.000Z", ["ana", "cami"]);
  let timeline = History.appendSnapshot(null, null, first);
  timeline = History.appendSnapshot(timeline, first, second);
  timeline = History.appendSnapshot(timeline, second, third);

  const trend = History.buildMultiDateTrend(timeline);
  assert.deepEqual(trend.map((point) => point.followerDelta), [0, 2, -1]);
  assert.deepEqual(trend.map((point) => point.followers), [1, 3, 2]);
});
