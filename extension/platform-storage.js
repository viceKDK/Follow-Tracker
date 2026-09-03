(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function chromeApi() {
    const api = typeof globalThis !== "undefined" ? globalThis.chrome : null;
    if (!api || !api.storage || !api.storage.local) {
      throw new Error("El almacenamiento local de la extensión no está disponible.");
    }
    return api;
  }

  function runtimeError(api) {
    const error = api.runtime && api.runtime.lastError;
    return error ? new Error(error.message || String(error)) : null;
  }

  function get(keys) {
    return new Promise((resolve, reject) => {
      const api = chromeApi();
      api.storage.local.get(keys, (items) => {
        const error = runtimeError(api);
        if (error) reject(error);
        else resolve(items || {});
      });
    });
  }

  function getAll() {
    return get(null);
  }

  function set(values) {
    return new Promise((resolve, reject) => {
      const api = chromeApi();
      api.storage.local.set(values || {}, () => {
        const error = runtimeError(api);
        if (error) reject(error);
        else resolve();
      });
    });
  }

  function remove(keys) {
    const values = Array.isArray(keys) ? keys : [keys];
    return new Promise((resolve, reject) => {
      const api = chromeApi();
      api.storage.local.remove(values.filter(Boolean), () => {
        const error = runtimeError(api);
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async function update(keys, updater) {
    if (typeof updater !== "function") throw new TypeError("update requiere una función.");
    const current = await get(keys);
    const next = await updater(current);
    if (next && typeof next === "object" && Object.keys(next).length) await set(next);
    return next;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("subscribe requiere una función.");
    const api = chromeApi();
    const wrapped = (changes, areaName) => {
      if (areaName === "local") listener(changes || {});
    };
    api.storage.onChanged.addListener(wrapped);
    return () => {
      if (api.storage.onChanged.removeListener) api.storage.onChanged.removeListener(wrapped);
    };
  }

  return { get, getAll, remove, set, subscribe, update };
});
