"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function freshRuntime() {
  delete require.cache[require.resolve("./dashboard-runtime.js")];
  return require("./dashboard-runtime.js");
}

test("ordena hooks por prioridad sin reemplazar funciones globales", () => {
  const Runtime = freshRuntime();
  const calls = [];
  Runtime.on("render:after", () => calls.push("baja"), { id: "low", priority: -10 });
  Runtime.on("render:after", () => calls.push("alta"), { id: "high", priority: 10 });
  const result = Runtime.emitSync("render:after", {});
  assert.deepEqual(calls, ["alta", "baja"]);
  assert.equal(result.errors.length, 0);
});

test("selecciona renderer por prioridad y conserva fallback", () => {
  const Runtime = freshRuntime();
  assert.equal(Runtime.render("people", () => "base"), "base");
  Runtime.registerRenderer("people", () => "simple", { priority: 1 });
  Runtime.registerRenderer("people", () => "pro", { priority: 20 });
  assert.equal(Runtime.render("people", () => "base"), "pro");
});

test("extiende vistas y filtros mediante contratos explícitos", () => {
  const Runtime = freshRuntime();
  Runtime.registerView("admin");
  Runtime.registerFilter("people", "watchlist", (person) => person.pinned);
  assert.equal(Runtime.resolveView("admin", "overview"), "admin");
  assert.equal(Runtime.resolveView("desconocida", "overview"), "overview");
  assert.equal(Runtime.matchFilter("people", "watchlist", { pinned: true }), true);
  assert.equal(Runtime.matchFilter("people", "watchlist", { pinned: false }), false);
});
