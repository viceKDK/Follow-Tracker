"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Domain = require("./follower-relations.js");
const Trust = require("./trust-core.js");
const Adapter = require("./trust-domain-adapter.js");

test("la API histórica de Trust delega la importación y normalización al dominio canónico", () => {
  assert.equal(Trust.parseInstagramExportPart, Domain.parseInstagramExportPart);
  assert.equal(Trust.mergeInstagramExportParts, Domain.mergeInstagramExportParts);
  assert.equal(Adapter.normalizeUsername(" @Ana "), "ana");
  assert.deepEqual(Trust.compareStrings(["Ana"], ["beto"]), {
    added: ["beto"],
    removed: ["ana"],
  });
});
