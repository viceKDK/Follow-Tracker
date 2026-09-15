"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Trust = require("./identity-registry-adapter.js");

test("migra un registro legacy por username al ID estable cuando cambia el username", () => {
  const existing = {
    schemaVersion: 1,
    profile: "demo",
    records: {
      "username:nombre_viejo": {
        key: "username:nombre_viejo",
        instagramUserId: "77",
        canonicalUsername: "nombre_viejo",
        currentUsername: "nombre_viejo",
        previousUsernames: ["nombre_viejo"],
        firstSeenAt: "2026-08-01T00:00:00Z",
        lastSeenAt: "2026-08-20T00:00:00Z",
      },
    },
    aliases: { nombre_viejo: "username:nombre_viejo" },
  };

  const result = Trust.updateIdentityRegistry(existing, [
    { instagramUserId: "77", username: "nombre_nuevo", fullName: "Persona" },
  ], { profile: "demo", source: "api", observedAt: "2026-09-15T00:00:00Z" });

  assert.deepEqual(Object.keys(result.registry.records), ["id:77"]);
  assert.equal(result.registry.records["id:77"].canonicalUsername, "nombre_viejo");
  assert.equal(result.registry.records["id:77"].currentUsername, "nombre_nuevo");
  assert.deepEqual(result.registry.records["id:77"].previousUsernames.sort(), ["nombre_nuevo", "nombre_viejo"]);
  assert.equal(result.registry.aliases.nombre_viejo, "id:77");
  assert.equal(result.registry.aliases.nombre_nuevo, "id:77");
  assert.equal(result.renames[0].confidence, 1);
  assert.equal(result.renames[0].reason, "stable_instagram_id");
  assert.deepEqual(result.conflicts, []);
});

test("consolida duplicados username/id que representan la misma cuenta", () => {
  const existing = {
    profile: "demo",
    records: {
      "id:88": {
        key: "id:88",
        instagramUserId: "88",
        canonicalUsername: "primero",
        currentUsername: "primero",
        previousUsernames: ["primero"],
        firstSeenAt: "2026-08-01T00:00:00Z",
        lastSeenAt: "2026-08-10T00:00:00Z",
      },
      "username:segundo": {
        key: "username:segundo",
        instagramUserId: "88",
        canonicalUsername: "segundo",
        currentUsername: "segundo",
        previousUsernames: ["segundo"],
        firstSeenAt: "2026-08-11T00:00:00Z",
        lastSeenAt: "2026-08-20T00:00:00Z",
      },
    },
    aliases: { primero: "id:88", segundo: "username:segundo" },
  };

  const result = Trust.updateIdentityRegistry(existing, [
    { instagramUserId: "88", username: "tercero" },
  ], { profile: "demo", observedAt: "2026-09-15T00:00:00Z" });

  assert.deepEqual(Object.keys(result.registry.records), ["id:88"]);
  assert.equal(result.registry.records["id:88"].canonicalUsername, "primero");
  assert.deepEqual(result.registry.records["id:88"].previousUsernames.sort(), ["primero", "segundo", "tercero"]);
  assert.equal(result.registry.aliases.primero, "id:88");
  assert.equal(result.registry.aliases.segundo, "id:88");
  assert.equal(result.registry.aliases.tercero, "id:88");
  assert.deepEqual(result.conflicts, []);
});

test("no fusiona cuentas distintas cuando Instagram reutiliza un username", () => {
  const existing = {
    profile: "demo",
    records: {
      "id:11": {
        key: "id:11",
        instagramUserId: "11",
        canonicalUsername: "compartido",
        currentUsername: "compartido",
        previousUsernames: ["compartido"],
        firstSeenAt: "2026-07-01T00:00:00Z",
        lastSeenAt: "2026-08-01T00:00:00Z",
      },
    },
    aliases: { compartido: "id:11" },
  };

  const result = Trust.updateIdentityRegistry(existing, [
    { instagramUserId: "22", username: "compartido", fullName: "Otra Persona" },
  ], { profile: "demo", source: "api", observedAt: "2026-09-15T00:00:00Z" });

  assert.deepEqual(Object.keys(result.registry.records).sort(), ["id:11", "id:22"]);
  assert.equal(result.registry.records["id:11"].instagramUserId, "11");
  assert.equal(result.registry.records["id:22"].instagramUserId, "22");
  assert.equal(result.registry.aliases.compartido, "id:22");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, "username_reused_by_different_id");
  assert.equal(result.conflicts[0].existingInstagramUserId, "11");
  assert.equal(result.conflicts[0].incomingInstagramUserId, "22");
});

test("canonicalizeRelationshipLists evita altas/bajas falsas tras un rename con ID", () => {
  const existing = {
    profile: "demo",
    records: {
      "id:99": {
        key: "id:99",
        instagramUserId: "99",
        canonicalUsername: "viejo",
        currentUsername: "viejo",
        previousUsernames: ["viejo"],
      },
    },
    aliases: { viejo: "id:99" },
  };
  const result = Trust.canonicalizeRelationshipLists(existing,
    [{ instagramUserId: "99", username: "nuevo" }],
    [{ instagramUserId: "99", username: "nuevo" }],
    { profile: "demo", source: "api", observedAt: "2026-09-15T00:00:00Z" });

  assert.deepEqual(result.followerUsernames, ["viejo"]);
  assert.deepEqual(result.followingUsernames, ["viejo"]);
  assert.equal(result.renames.length, 1);
  assert.equal(result.renames[0].from, "viejo");
  assert.equal(result.renames[0].to, "nuevo");
  assert.deepEqual(result.conflicts, []);
});