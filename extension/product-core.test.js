"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Product = require("./product-core.js");

test("pagina colecciones grandes sin perder el total", () => {
  const result = Product.paginate(Array.from({ length: 1001 }, (_, index) => index), 3, 250);
  assert.equal(result.total, 1001);
  assert.equal(result.pages, 5);
  assert.equal(result.page, 3);
  assert.equal(result.start, 501);
  assert.equal(result.end, 750);
  assert.equal(result.items.length, 250);
  assert.equal(result.hasPrevious, true);
  assert.equal(result.hasNext, true);
});

test("corrige pagina y tamanio fuera de rango", () => {
  const result = Product.paginate([1, 2, 3], 99, 5000);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 500);
  assert.deepEqual(result.items, [1, 2, 3]);
});

test("filtra actividad por usuario tipo reporte y fecha", () => {
  const events = [
    { username: "Ana", type: "followed_you", reportId: "r2", occurredAt: "2026-08-22T10:00:00Z" },
    { username: "beto", type: "unfollowed_you", reportId: "r3", occurredAt: "2026-08-23T10:00:00Z" },
    { username: "ana", type: "unfollowed_you", reportId: "r4", occurredAt: "2026-08-24T10:00:00Z" },
  ];
  const result = Product.filterEvents(events, {
    query: "@ana",
    type: "unfollowed_you",
    reportId: "r4",
    from: "2026-08-24",
    to: "2026-08-24",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].reportId, "r4");
});

test("ordena actividad de mas reciente a mas antigua", () => {
  const result = Product.filterEvents([
    { username: "a", type: "followed_you", occurredAt: "2026-01-01T00:00:00Z" },
    { username: "b", type: "followed_you", occurredAt: "2026-02-01T00:00:00Z" },
  ]);
  assert.equal(result[0].username, "b");
});

test("valida backup completo y acepta snapshot heredado", () => {
  const complete = Product.validateBackupPayload({
    snapshot: { profile: "Demo", followers: ["ana"], following: ["ana"] },
    timeline: {
      profile: "demo",
      baseline: { reportId: "r1", capturedAt: "2026-08-20T10:00:00Z", followers: ["ana"], following: ["ana"] },
      reports: [],
      events: [],
    },
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.profile, "demo");

  const legacy = Product.validateBackupPayload({ profile: "demo", followers: [], following: [] });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.timeline, null);
  assert.equal(legacy.warnings.length, 1);
});

test("rechaza backup con perfiles distintos o sin listas", () => {
  const mismatch = Product.validateBackupPayload({
    snapshot: { profile: "uno", followers: [], following: [] },
    timeline: { profile: "dos", baseline: {}, reports: [], events: [] },
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.errors.join(" "), /perfiles distintos/i);

  const invalid = Product.validateBackupPayload({ snapshot: { profile: "demo" } });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /followers/);
});


test("rechaza línea temporal con reportes o eventos corruptos", () => {
  const invalid = Product.validateBackupPayload({
    snapshot: { profile: "demo", followers: ["ana"], following: [], updatedAt: "2026-08-24T10:00:00Z" },
    timeline: {
      profile: "demo",
      baseline: { reportId: "r1", capturedAt: "2026-08-20T10:00:00Z", followers: ["ana"], following: [] },
      reports: [{ id: "", capturedAt: "no-es-fecha" }],
      events: [{ username: "", type: "", occurredAt: "no-es-fecha" }],
    },
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /reporte.*identificador/i);
  assert.match(invalid.errors.join(" "), /evento.*usuario/i);
  assert.match(invalid.errors.join(" "), /fecha válida/i);
});

test("acepta tipos históricos desconocidos con advertencia y no pierde el backup", () => {
  const result = Product.validateBackupPayload({
    snapshot: { profile: "demo", followers: [], following: [], updatedAt: "2026-08-24T10:00:00Z" },
    timeline: {
      profile: "demo",
      baseline: { reportId: "r1", capturedAt: "2026-08-20T10:00:00Z", followers: [], following: [] },
      reports: [{ id: "r1", capturedAt: "2026-08-20T10:00:00Z" }],
      events: [{ id: "e1", username: "ana", type: "legacy_event", occurredAt: "2026-08-21T10:00:00Z" }],
    },
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((message) => /tipo desconocido/i.test(message)));
});

test("diagnostica historial consistente", () => {
  const snapshot = {
    profile: "demo",
    followers: ["ana", "beto"],
    following: ["ana"],
    updatedAt: "2026-08-24T10:00:00Z",
  };
  const timeline = {
    profile: "demo",
    baseline: { reportId: "r1" },
    reports: [{ id: "r1", capturedAt: "2026-08-24T10:00:00Z", followersCount: 2, followingCount: 1 }],
    events: [],
  };
  const result = Product.buildDataHealth(snapshot, timeline);
  assert.equal(result.status, "healthy");
  assert.equal(result.score, 100);
  assert.equal(result.metrics.reports, 1);
});

test("detecta duplicados y totales inconsistentes", () => {
  const result = Product.buildDataHealth(
    { profile: "demo", followers: ["Ana", "ana"], following: [], updatedAt: "2026-08-24T10:00:00Z" },
    {
      profile: "demo",
      baseline: { reportId: "r1" },
      reports: [{ id: "r1", capturedAt: "2026-08-24T10:00:00Z", followersCount: 1, followingCount: 0 }],
      events: [],
    }
  );
  assert.equal(result.status, "warning");
  assert.ok(result.warnings.some((message) => /duplicado/i.test(message)));
  assert.ok(result.warnings.some((message) => /no coincide/i.test(message)));
});

test("protege celdas CSV contra formulas", () => {
  assert.equal(Product.csvCell("=2+2"), "'=2+2");
  assert.equal(Product.csvCell("a,b"), '"a,b"');
});

test("busca actividad con frases humanas en español", () => {
  const events = [
    { username: "beto", type: "unfollowed_you", reportId: "r3", occurredAt: "2026-08-23T10:00:00Z" },
    { username: "ana", type: "followed_you", reportId: "r4", occurredAt: "2026-08-24T10:00:00Z" },
  ];
  assert.deepEqual(
    Product.filterEvents(events, { query: "dejó de seguir" }).map((event) => event.username),
    ["beto"]
  );
  assert.deepEqual(
    Product.filterEvents(events, { query: "nuevo seguidor" }).map((event) => event.username),
    ["ana"]
  );
});

test("el filtro hasta incluye el día completo", () => {
  const result = Product.filterEvents(
    [{ username: "ana", type: "followed_you", occurredAt: "2026-08-24T23:59:59.000" }],
    { from: "2026-08-24", to: "2026-08-24" }
  );
  assert.equal(result.length, 1);
});
