"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Relationship = require("./relationship-core.js");

test("construye transiciones persona por persona sin distinguir mayúsculas", () => {
  const rows = Relationship.buildTransitions({
    fromSnapshot: { followers: ["Ana", "beto"], following: ["ana", "diana"] },
    toSnapshot: { followers: ["ana", "carla"], following: ["ANA", "beto"] },
  });
  const byName = Object.fromEntries(rows.map((row) => [row.normalized, row]));
  assert.equal(byName.ana.changed, false);
  assert.equal(byName.beto.headline, "Te dejó de seguir y ahora lo seguís");
  assert.equal(byName.carla.headline, "Te sigue ahora; vos no lo seguís");
  assert.equal(byName.diana.headline, "Lo dejaste de seguir");
});

test("los filtros comparten la misma regla que los contadores", () => {
  const rows = Relationship.buildTransitions({
    fromSnapshot: { followers: ["a"], following: [] },
    toSnapshot: { followers: ["b"], following: [] },
  });
  assert.equal(Relationship.filterCount(rows, "changed"), 2);
  assert.equal(Relationship.filterCount(rows, "unfollowed-you"), 1);
  assert.deepEqual(rows.filter((row) => Relationship.matchesFilter(row, "followed-you")).map((row) => row.normalized), ["b"]);
});
