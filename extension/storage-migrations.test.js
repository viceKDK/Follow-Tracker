"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Migrations = require("./storage-migrations.js");

function adapter(seed, failure) {
  const data = { ...(seed || {}) };
  return {
    data,
    async getAll() { return { ...data }; },
    async set(values) {
      if (failure && failure(values, "set")) throw new Error("fallo simulado");
      Object.assign(data, values || {});
    },
    async remove(keys) {
      if (failure && failure(keys, "remove")) throw new Error("fallo simulado");
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete data[key]);
    },
  };
}

test("migra almacenamiento legado con backup verificable y versión raíz", async () => {
  const storage = adapter({
    ft_settings: { confirmRemovalsAfter: 3 },
    ft_cache_demo: { legacy: true },
    ft_history_demo: { profile: "demo", followers: ["ana"], following: [], updatedAt: "2026-08-20T10:00:00Z" },
  });
  const result = await Migrations.migrateStorage(storage, {
    now: "2026-09-01T00:00:00Z",
    appVersion: "3.0.0",
    buildTimeline(snapshot) { return { profile: snapshot.profile, reports: [{ id: "baseline" }] }; },
  });
  assert.equal(result.fromVersion, 0);
  assert.equal(storage.data.ft_storage_meta.schemaVersion, 3);
  assert.equal(storage.data.ft_settings.storageSchemaVersion, 3);
  assert.equal(storage.data.ft_settings.confirmRemovalsAfter, 3);
  assert.equal(storage.data.ft_settings.minRemovalConfidence, 0.95);
  assert.equal(storage.data.ft_cache_demo, undefined);
  assert.ok(storage.data.ft_timeline_demo);
  assert.equal(Migrations.validateBackup(storage.data.ft_storage_migration_backup), true);
});

test("migra identidades legacy por username a una única clave estable por ID", async () => {
  const storage = adapter({
    ft_settings: {},
    ft_storage_meta: { schemaVersion: 2 },
    ft_identity_demo: {
      schemaVersion: 1,
      profile: "demo",
      records: {
        "username:viejo": {
          key: "username:viejo",
          instagramUserId: "77",
          canonicalUsername: "viejo",
          currentUsername: "viejo",
          previousUsernames: ["viejo"],
          firstSeenAt: "2026-08-01T00:00:00Z",
          lastSeenAt: "2026-08-10T00:00:00Z",
        },
        "id:77": {
          key: "id:77",
          instagramUserId: "77",
          canonicalUsername: "viejo",
          currentUsername: "nuevo",
          previousUsernames: ["nuevo"],
          firstSeenAt: "2026-08-01T00:00:00Z",
          lastSeenAt: "2026-08-20T00:00:00Z",
        },
      },
      aliases: { viejo: "username:viejo", nuevo: "id:77" },
    },
  });

  const result = await Migrations.migrateStorage(storage, { now: "2026-09-15T00:00:00Z" });
  assert.equal(result.fromVersion, 2);
  assert.deepEqual(Object.keys(storage.data.ft_identity_demo.records), ["id:77"]);
  assert.equal(storage.data.ft_identity_demo.records["id:77"].currentUsername, "nuevo");
  assert.deepEqual(storage.data.ft_identity_demo.records["id:77"].previousUsernames.sort(), ["nuevo", "viejo"]);
  assert.equal(storage.data.ft_identity_demo.aliases.viejo, "id:77");
  assert.equal(storage.data.ft_identity_demo.aliases.nuevo, "id:77");
});

test("puede restaurar exactamente las claves tocadas por la migración", async () => {
  const originalCache = { legacy: "dato" };
  const storage = adapter({ ft_cache_demo: originalCache, ft_history_demo: { profile: "demo", followers: [], following: [] } });
  await Migrations.migrateStorage(storage, { buildTimeline() { return { reports: [] }; } });
  const restored = await Migrations.restoreMigration(storage);
  assert.equal(restored.restored, true);
  assert.deepEqual(storage.data.ft_cache_demo, originalCache);
  assert.equal(storage.data.ft_timeline_demo, undefined);
  assert.equal(storage.data.ft_storage_meta, undefined);
});

test("rechaza una versión futura en vez de interpretar datos desconocidos", () => {
  assert.throws(() => Migrations.planStorageMigration({ ft_storage_meta: { schemaVersion: 99 } }), /versión futura/i);
});

test("revierte automáticamente si la validación o escritura falla", async () => {
  let failed = false;
  const storage = adapter({ ft_settings: { marker: "original" } }, (values, operation) => {
    if (operation === "set" && values.ft_storage_meta && !failed) { failed = true; return true; }
    return false;
  });
  await assert.rejects(() => Migrations.migrateStorage(storage), /fallo simulado/i);
  assert.equal(storage.data.ft_settings.marker, "original");
  assert.equal(storage.data.ft_storage_meta, undefined);
  assert.ok(storage.data.ft_storage_migration_backup.restoredAt);
});