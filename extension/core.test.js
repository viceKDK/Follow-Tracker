"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("./core.js");

test("acepta solo los hostnames oficiales de Instagram", () => {
  assert.equal(Core.isInstagramHostname("instagram.com"), true);
  assert.equal(Core.isInstagramHostname("www.instagram.com"), true);
  assert.equal(Core.isInstagramHostname("falsoinstagram.com"), false);
  assert.equal(Core.isInstagramHostname("instagram.com.evil.test"), false);
});

test("genera el mismo run_id en ambos nombres cuando se lo proporcionamos", () => {
  const followers = Core.buildCsvFilename("Perfil Demo", "followers", "run-abc", 1000);
  const following = Core.buildCsvFilename("Perfil Demo", "following", "run-abc", 1001);
  assert.match(followers, /perfil_demo_followers_run-abc_1000\.csv$/);
  assert.match(following, /perfil_demo_following_run-abc_1001\.csv$/);
});

test("compara altas y bajas sin importar mayusculas", () => {
  const changes = Core.compareSnapshots(["Ana", "beto"], ["ana", "carla"]);
  assert.deepEqual(changes.added, ["carla"]);
  assert.deepEqual(changes.removed, ["beto"]);
});

test("la union de reintentos deduplica usuarios", () => {
  const merged = Core.mergeRows(
    [{ username: "ana", fullName: "Ana" }],
    [{ username: "ANA", fullName: "Ana Actualizada" }, { username: "beto" }]
  );
  assert.deepEqual(merged.map((row) => row.username), ["ana", "beto"]);
  assert.equal(merged[0].fullName, "Ana Actualizada");
});

test("clasifica correctamente la relacion entre seguidores y seguidos", () => {
  const comparison = Core.buildRelationshipComparison(
    [{ username: "ana" }, { username: "beto" }],
    [{ username: "ana" }, { username: "carla" }]
  );
  assert.deepEqual(comparison, {
    nos: ["ana"],
    noLoSigo: ["beto"],
    noMeSigue: ["carla"],
  });
});

test("una captura menor al 95% se considera parcial", () => {
  assert.equal(Core.completeness(94, 100, 0.95).complete, false);
  assert.equal(Core.completeness(95, 100, 0.95).complete, true);
});

test("una cuenta vacia con contador cero es una captura completa", () => {
  assert.deepEqual(Core.completeness(0, 0, 0.95), {
    complete: true,
    ratio: null,
    expectedKnown: true,
  });
});

test("una lista vacia sin contador conocido no reemplaza el historial", () => {
  assert.deepEqual(Core.completeness(0, null, 0.95), {
    complete: false,
    ratio: null,
    expectedKnown: false,
  });
});

test("un perfil pequeno completo no cae innecesariamente al modo UI", () => {
  assert.equal(Core.isApiResultTooLow(3, 3), false);
  assert.equal(Core.isApiResultTooLow(2, 2), false);
  assert.equal(Core.isApiResultTooLow(1, 3), true);
});

test("CSV neutraliza formulas y escapa saltos de linea", () => {
  assert.equal(Core.escapeCsvValue("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(Core.escapeCsvValue('Nombre, "Alias"'), '"Nombre, ""Alias"""');
});
