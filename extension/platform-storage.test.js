"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Storage = require("./platform-storage.js");

function installStorage(seed) {
  const data = { ...(seed || {}) };
  const listeners = [];
  global.chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(keys, callback) {
          if (keys == null) return callback({ ...data });
          const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
          callback(names.reduce((out, key) => {
            if (Object.prototype.hasOwnProperty.call(data, key)) out[key] = data[key];
            return out;
          }, {}));
        },
        set(values, callback) { Object.assign(data, values); callback && callback(); },
        remove(keys, callback) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete data[key]); callback && callback(); },
      },
      onChanged: {
        addListener(listener) { listeners.push(listener); },
        removeListener(listener) { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); },
      },
    },
  };
  return { data, listeners };
}

test("centraliza get set remove y update", async () => {
  const harness = installStorage({ a: 1 });
  assert.deepEqual(await Storage.get("a"), { a: 1 });
  await Storage.set({ b: 2 });
  assert.equal(harness.data.b, 2);
  await Storage.update(["a"], ({ a }) => ({ a: a + 3 }));
  assert.equal(harness.data.a, 4);
  await Storage.remove(["a", "b"]);
  assert.deepEqual(harness.data, {});
});

test("subscribe filtra cambios fuera de local y permite desuscribir", () => {
  const harness = installStorage();
  const seen = [];
  const off = Storage.subscribe((changes) => seen.push(changes));
  harness.listeners[0]({ a: { newValue: 1 } }, "sync");
  harness.listeners[0]({ a: { newValue: 1 } }, "local");
  off();
  assert.equal(seen.length, 1);
  assert.equal(harness.listeners.length, 0);
});
