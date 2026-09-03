"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Trust = require("./trust-domain-adapter.js");
const CaptureStore = require("./capture-store.js");

function installStorage(seed) {
  const data = { ...(seed || {}) };
  global.chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(keys, callback) {
          if (keys == null) { callback({ ...data }); return; }
          const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
          const output = {};
          list.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(data, key)) output[key] = data[key];
          });
          callback(output);
        },
        set(values, callback) {
          Object.assign(data, values);
          callback && callback();
        },
        remove(keys, callback) {
          (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete data[key]);
          callback && callback();
        },
      },
    },
  };
  return data;
}

test("carga el adaptador de integridad usado por capture-store", () => {
  assert.equal(typeof Trust.normalizeCaptureMetrics, "function");
  assert.equal(typeof Trust.assessCaptureCompleteness, "function");
  assert.equal(typeof Trust.applyAbsencePolicy, "function");
});

test("un cambio de username con el mismo ID no inventa una baja", async () => {
  const profile = "demo";
  const keys = Trust.storageKeys(profile);
  const firstRegistry = Trust.updateIdentityRegistry(null, [
    { id: "123", username: "nombre_viejo" },
  ], { profile, source: "api", observedAt: "2026-08-20T10:00:00Z" }).registry;
  const data = installStorage({
    [keys.history]: {
      schemaVersion: 3,
      profile,
      followers: ["nombre_viejo"],
      following: ["nombre_viejo"],
      updatedAt: "2026-08-20T10:00:00Z",
      runId: "r1",
    },
    [keys.identities]: firstRegistry,
    ft_settings: { confirmRemovalsAfter: 2 },
  });

  const stage = await CaptureStore.stageCapture({
    profile,
    profileId: "999",
    source: "api",
    followers: [{ id: "123", username: "nombre_nuevo" }],
    following: [{ id: "123", username: "nombre_nuevo" }],
    expectedFollowers: 1,
    expectedFollowing: 1,
    capturedAt: "2026-08-21T10:00:00Z",
    runId: "r2",
  });

  assert.deepEqual(stage.snapshot.followers, ["nombre_viejo"]);
  assert.deepEqual(stage.review.changes.lostFollowers, []);
  assert.equal(stage.review.renames.length, 1);
  await CaptureStore.commitStage(stage, "save");
  assert.deepEqual(data[keys.history].followers, ["nombre_viejo"]);
  assert.equal(data[keys.identities].records["id:123"].currentUsername, "nombre_nuevo");
  assert.equal(data[keys.captureMeta].reports.r2.status, "trusted");
  assert.equal(data[keys.pending], undefined);
});

test("la captura pendiente no modifica el historial hasta aceptar", async () => {
  const profile = "demo";
  const keys = Trust.storageKeys(profile);
  const data = installStorage({
    [keys.history]: {
      profile,
      followers: ["ana", "beto"],
      following: ["ana"],
      updatedAt: "2026-08-20T10:00:00Z",
      runId: "r1",
    },
    ft_settings: { confirmRemovalsAfter: 2 },
  });

  const stage = await CaptureStore.stageCapture({
    profile,
    source: "api",
    followers: [{ username: "ana" }],
    following: [{ username: "ana" }],
    expectedFollowers: 1,
    expectedFollowing: 1,
    capturedAt: "2026-08-21T10:00:00Z",
    runId: "r2",
  });

  assert.deepEqual(data[keys.history].followers, ["ana", "beto"]);
  assert.ok(data[keys.pending]);
  assert.deepEqual(stage.snapshot.followers, ["ana", "beto"]);
  assert.equal(stage.review.pendingAbsences.followers.length, 1);
  await CaptureStore.discardStage(stage);
  assert.deepEqual(data[keys.history].followers, ["ana", "beto"]);
  assert.equal(data[keys.pending], undefined);
});

test("una captura rechazada exige guardado explícito como sospechosa", async () => {
  const profile = "demo";
  const keys = Trust.storageKeys(profile);
  installStorage({
    [keys.history]: {
      profile,
      followers: Array.from({ length: 100 }, (_, index) => `u${index}`),
      following: [],
      updatedAt: "2026-08-20T10:00:00Z",
      runId: "r1",
    },
    ft_settings: { confirmRemovalsAfter: 1 },
  });
  const stage = await CaptureStore.stageCapture({
    profile,
    source: "api",
    followers: [{ username: "u1" }],
    following: [],
    expectedFollowers: 100,
    expectedFollowing: 0,
    capturedAt: "2026-08-21T10:00:00Z",
    runId: "r2",
  });
  assert.equal(stage.review.status, "rejected");
  await assert.rejects(() => CaptureStore.commitStage(stage, "save"), /rechazada/i);
  const committed = await CaptureStore.commitStage(stage, "save_suspicious");
  assert.equal(committed.captureMeta.status, "suspicious");
});

test("importa las dos listas oficiales como una captura revisada", async () => {
  const profile = "demo";
  const keys = Trust.storageKeys(profile);
  const data = installStorage({ ft_settings: { confirmRemovalsAfter: 1 } });
  const parts = [
    Trust.parseInstagramExportPart("followers_1.json", [
      { string_list_data: [{ value: "ana" }, { value: "beto" }] },
    ]),
    Trust.parseInstagramExportPart("following.json", {
      relationships_following: [
        { string_list_data: [{ value: "ana" }] },
      ],
    }),
  ];
  const stage = await CaptureStore.importOfficialExport(profile, parts, {
    capturedAt: "2026-08-24T12:00:00Z",
    runId: "official-r1",
  });
  assert.equal(stage.source, "instagram_export");
  assert.deepEqual(stage.snapshot.followers, ["ana", "beto"]);
  await CaptureStore.commitStage(stage, "save");
  assert.equal(data[keys.history].runId, "official-r1");
  assert.equal(data[keys.captureMeta].reports["official-r1"].source, "instagram_export");
});
