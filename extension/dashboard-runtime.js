(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerDashboardRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const views = new Set(["overview", "relationships", "people", "activity"]);
  const listeners = new Map();
  const renderers = new Map();
  const filters = new Map();
  let sequence = 0;

  function ordered(entries) {
    return [...entries].sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
  }

  function on(eventName, handler, options) {
    if (!eventName || typeof handler !== "function") throw new TypeError("Evento y handler son obligatorios.");
    const settings = options && typeof options === "object" ? options : {};
    const entry = {
      id: String(settings.id || `${eventName}:${sequence + 1}`),
      handler,
      priority: Number(settings.priority) || 0,
      once: settings.once === true,
      sequence: sequence += 1,
    };
    const bucket = listeners.get(eventName) || [];
    bucket.push(entry);
    listeners.set(eventName, bucket);
    return () => {
      const current = listeners.get(eventName) || [];
      listeners.set(eventName, current.filter((item) => item !== entry));
    };
  }

  function emitSync(eventName, payload) {
    const bucket = ordered(listeners.get(eventName) || []);
    const errors = [];
    bucket.forEach((entry) => {
      try {
        entry.handler(payload);
      } catch (error) {
        errors.push({ id: entry.id, error });
        console.error(`[FollowTrackerRuntime] ${eventName}/${entry.id}`, error);
      }
      if (entry.once) {
        const current = listeners.get(eventName) || [];
        listeners.set(eventName, current.filter((item) => item !== entry));
      }
    });
    return { delivered: bucket.length, errors };
  }

  function registerRenderer(slot, handler, options) {
    if (!slot || typeof handler !== "function") throw new TypeError("Slot y renderer son obligatorios.");
    const settings = options && typeof options === "object" ? options : {};
    const entry = {
      id: String(settings.id || `${slot}:${sequence + 1}`),
      handler,
      priority: Number(settings.priority) || 0,
      sequence: sequence += 1,
    };
    const bucket = renderers.get(slot) || [];
    bucket.push(entry);
    renderers.set(slot, bucket);
    return () => renderers.set(slot, (renderers.get(slot) || []).filter((item) => item !== entry));
  }

  function render(slot, fallback) {
    const args = Array.prototype.slice.call(arguments, 2);
    const selected = ordered(renderers.get(slot) || [])[0];
    return selected ? selected.handler.apply(null, args) : fallback.apply(null, args);
  }

  function registerView(view) {
    const normalized = String(view || "").trim();
    if (!normalized) throw new TypeError("El identificador de vista es obligatorio.");
    views.add(normalized);
    return () => views.delete(normalized);
  }

  function resolveView(value, fallback) {
    const normalized = String(value || "").trim();
    return views.has(normalized) ? normalized : fallback;
  }

  function registerFilter(scope, filterId, predicate, options) {
    if (!scope || !filterId || typeof predicate !== "function") {
      throw new TypeError("Scope, filtro y predicado son obligatorios.");
    }
    const key = `${scope}:${filterId}`;
    const settings = options && typeof options === "object" ? options : {};
    const entry = {
      id: String(settings.id || key),
      predicate,
      priority: Number(settings.priority) || 0,
      sequence: sequence += 1,
    };
    const bucket = filters.get(key) || [];
    bucket.push(entry);
    filters.set(key, bucket);
    return () => filters.set(key, (filters.get(key) || []).filter((item) => item !== entry));
  }

  function matchFilter(scope, filterId, value, context) {
    const bucket = ordered(filters.get(`${scope}:${filterId}`) || []);
    if (!bucket.length) return undefined;
    return bucket.every((entry) => {
      try {
        return entry.predicate(value, context) !== false;
      } catch (error) {
        console.error(`[FollowTrackerRuntime] filter/${entry.id}`, error);
        return false;
      }
    });
  }

  function diagnostics() {
    return {
      views: [...views].sort(),
      events: [...listeners.entries()].reduce((output, [name, entries]) => {
        output[name] = entries.map((entry) => entry.id);
        return output;
      }, {}),
      renderers: [...renderers.entries()].reduce((output, [name, entries]) => {
        output[name] = ordered(entries).map((entry) => entry.id);
        return output;
      }, {}),
      filters: [...filters.keys()].sort(),
    };
  }

  return {
    diagnostics,
    emitSync,
    matchFilter,
    on,
    registerFilter,
    registerRenderer,
    registerView,
    render,
    resolveView,
  };
});
