"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Domain = require("./follower-relations.js");

const fixturesRoot = path.resolve(__dirname, "..", "tests", "fixtures", "instagram-export", "connections", "followers_and_following");

test("normaliza las variantes JSON oficiales y mide registros descartados", () => {
  const part = Domain.parseInstagramExportPart("followers_1.json", [
    { string_list_data: [{ value: "Ana" }, { value: "ANA" }, { value: "" }] },
  ]);
  assert.equal(part.format, "instagram-json");
  assert.equal(part.phase, "followers");
  assert.deepEqual(part.users.map((user) => user.username), ["ana"]);
  assert.equal(part.metrics.inputRecords, 3);
  assert.equal(part.metrics.duplicateRecords, 1);
  assert.equal(part.metrics.invalidRecords, 1);
});

test("usa un normalizador HTML separado", () => {
  const part = Domain.parseInstagramExportPart("followers.html", `
    <html><body>
      <a href="https://www.instagram.com/ana/">Ana Persona</a>
      <a href="https://www.instagram.com/beto/">Beto</a>
      <a href="https://example.com/no-es-instagram">Ignorar</a>
    </body></html>`);
  assert.equal(part.format, "instagram-html");
  assert.deepEqual(part.users.map((user) => user.username), ["ana", "beto"]);
  assert.equal(part.users.find((user) => user.username === "ana").fullName, "Ana Persona");
});

test("normaliza CSV sin mezclar su parser con JSON", () => {
  const part = Domain.parseInstagramExportPart("following.csv", "username,full_name,id\nana,Ana Persona,10\nbeto,Beto,11\n");
  assert.equal(part.format, "csv");
  assert.equal(part.phase, "following");
  assert.deepEqual(part.users.map((user) => user.instagramUserId), ["10", "11"]);
});

test("acepta CSV separado por punto y coma", () => {
  const part = Domain.parseInstagramExportPart("following.csv", "username;full_name;id\nana;Ana Persona;10\n");
  assert.equal(part.users[0].username, "ana");
  assert.equal(part.users[0].instagramUserId, "10");
});

test("detecta huecos en partes numeradas y no declara completa la exportación", () => {
  const merged = Domain.mergeInstagramExportParts([
    Domain.parseInstagramExportPart("followers_1.json", [{ string_list_data: [{ value: "ana" }] }]),
    Domain.parseInstagramExportPart("followers_3.json", [{ string_list_data: [{ value: "beto" }] }]),
    Domain.parseInstagramExportPart("following.json", { relationships_following: [{ string_list_data: [{ value: "ana" }] }] }),
  ]);
  assert.equal(merged.complete, false);
  assert.equal(merged.completeness.status, "partial");
  assert.ok(merged.warnings.some((warning) => /falta una parte/i.test(warning)));
});

test("una exportación reconocida conserva formato, métricas y confianza", () => {
  const merged = Domain.mergeInstagramExportParts([
    { name: "followers_1.json", payload: [{ string_list_data: [{ value: "ana" }] }] },
    { name: "following.json", payload: { relationships_following: [{ string_list_data: [{ value: "ana" }] }] } },
  ]);
  assert.equal(merged.complete, true);
  assert.equal(merged.completeness.status, "probably_complete");
  assert.equal(merged.completeness.confidence, 0.95);
  assert.deepEqual(merged.formats, ["instagram-json"]);
  assert.equal(merged.metrics.followers.capturedCount || merged.followers.length, 1);
});

test("importa fixtures de la carpeta oficial followers_and_following", () => {
  const followersPath = path.join(fixturesRoot, "followers_1.json");
  const followingPath = path.join(fixturesRoot, "following.json");
  const merged = Domain.mergeInstagramExportParts([
    {
      name: "followers_1.json",
      relativePath: "connections/followers_and_following/followers_1.json",
      payload: JSON.parse(fs.readFileSync(followersPath, "utf8")),
    },
    {
      name: "following.json",
      relativePath: "connections/followers_and_following/following.json",
      payload: JSON.parse(fs.readFileSync(followingPath, "utf8")),
    },
  ]);
  assert.equal(merged.complete, true);
  assert.deepEqual(merged.followers.map((user) => user.username), ["ana", "beto"]);
  assert.deepEqual(merged.following.map((user) => user.username), ["ana", "diana"]);
  assert.equal(merged.parts[0].sourcePath, "connections/followers_and_following/followers_1.json");
});

test("no confunde recently_unfollowed_profiles con la lista following", () => {
  const part = Domain.normalizeImportPart({
    name: "recently_unfollowed_profiles.json",
    relativePath: "connections/followers_and_following/recently_unfollowed_profiles.json",
    payload: [{ string_list_data: [{ value: "ana" }] }],
  });
  assert.equal(part.phase, "unknown");
  assert.ok(part.warnings.some((warning) => /no se pudo clasificar/i.test(warning)));
});