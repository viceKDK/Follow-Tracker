"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const History = require("./history.js");
const Admin = require("./admin-core.js");

test("detecta perfiles sin repetir y calcula espacio", () => {
  const items = {
    ft_history_demo: { profile: "Demo", followers: ["ana"], following: [] },
    ft_history_otro: { profile: "otro", followers: [], following: [] },
    ft_timeline_demo: { reports: [] },
  };
  assert.deepEqual(Admin.profilesFromStorage(items), ["demo", "otro"]);
  assert.ok(Admin.profileBytes("demo", items) > 0);
  assert.match(Admin.formatBytes(2048), /2 KB/);
});

test("fusiona snapshots cronológicamente y deduplica reportes", () => {
  const entries = [
    { report: { id: "r2", capturedAt: "2026-08-22T10:00:00Z" }, snapshot: { profile: "a", followers: ["ana", "beto"], following: [], updatedAt: "2026-08-22T10:00:00Z", runId: "r2" } },
    { report: { id: "r1", capturedAt: "2026-08-20T10:00:00Z" }, snapshot: { profile: "b", followers: ["ana"], following: [], updatedAt: "2026-08-20T10:00:00Z", runId: "r1" } },
    { report: { id: "r2", capturedAt: "2026-08-22T10:00:00Z" }, snapshot: { profile: "b", followers: ["duplicado"], following: [], updatedAt: "2026-08-22T10:00:00Z", runId: "r2" } },
  ];
  const result = Admin.rebuildCombinedTimeline("destino", entries);
  assert.deepEqual(result.timeline.reports.map((report) => report.id), ["r1", "r2"]);
  assert.deepEqual(History.snapshotForReport(result.timeline, "r2").followers, ["ana", "beto"]);
});

test("reemplaza usernames y conserva metadatos útiles", () => {
  assert.deepEqual(Admin.replaceUsername(["viejo", "otro", "VIEJO"], "viejo", "nuevo"), ["nuevo", "otro"]);
  const merged = Admin.mergePeopleMetadata(
    { people: { ana: { pinned: true, tags: ["amistad"], note: "antes" } } },
    { people: { ana: { pinned: false, tags: ["trabajo"], note: "ahora" } } },
    "demo"
  );
  assert.equal(merged.people.ana.pinned, true);
  assert.equal(merged.people.ana.note, "ahora");
  assert.deepEqual(merged.people.ana.tags.sort(), ["amistad", "trabajo"]);
});
