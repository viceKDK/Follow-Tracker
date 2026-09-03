(function (root, factory) {
  const History = root && root.FollowTrackerHistory
    ? root.FollowTrackerHistory
    : (typeof module === "object" && module.exports ? require("./history.js") : null);
  const api = factory(History);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerDashboardProjection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History) {
  "use strict";

  if (!History) throw new Error("Follow Tracker Dashboard Projection no pudo cargar History.");

  const BINDING = Symbol("dashboardProjectionBinding");

  function comparisonSelection(reportsValue, compareFrom, compareTo) {
    const reports = Array.isArray(reportsValue) ? reportsValue : [];
    if (reports.length < 2) return { from: null, to: null };

    const ids = reports.map((report) => report.id);
    let fromIndex = ids.indexOf(compareFrom);
    let toIndex = ids.indexOf(compareTo);

    if (fromIndex < 0) fromIndex = Math.max(0, reports.length - 2);
    if (toIndex < 0) toIndex = reports.length - 1;
    if (fromIndex === toIndex) {
      if (toIndex > 0) fromIndex = toIndex - 1;
      else toIndex = 1;
    }
    if (fromIndex > toIndex) [fromIndex, toIndex] = [toIndex, fromIndex];
    return { from: reports[fromIndex].id, to: reports[toIndex].id };
  }

  function installComparisonBinding(state) {
    if (!state || state[BINDING]) return state;
    const binding = {
      from: state.compareFrom == null ? null : state.compareFrom,
      to: state.compareTo == null ? null : state.compareTo,
      syncing: false,
    };
    Object.defineProperty(state, BINDING, { value: binding });
    Object.defineProperties(state, {
      compareFrom: {
        configurable: true,
        enumerable: true,
        get() { return binding.from; },
        set(value) {
          binding.from = value == null ? null : value;
          if (!binding.syncing && state.snapshot && state.timeline && state.projection) projectState(state);
        },
      },
      compareTo: {
        configurable: true,
        enumerable: true,
        get() { return binding.to; },
        set(value) {
          binding.to = value == null ? null : value;
          if (!binding.syncing && state.snapshot && state.timeline && state.projection) projectState(state);
        },
      },
    });
    return state;
  }

  function projectState(state) {
    if (!state || !state.snapshot || !state.timeline) return null;
    installComparisonBinding(state);
    const binding = state[BINDING];
    const reports = [...state.timeline.reports].sort(
      (a, b) => new Date(a.capturedAt) - new Date(b.capturedAt)
    );
    const selection = comparisonSelection(reports, state.compareFrom, state.compareTo);
    const projection = History.buildDashboardProjection(state.snapshot, state.timeline, {
      compareFrom: selection.from,
      compareTo: selection.to,
    });

    binding.syncing = true;
    state.compareFrom = selection.from;
    state.compareTo = selection.to;
    binding.syncing = false;
    state.projection = projection;
    state.people = projection ? projection.people : [];
    state.relationshipTransitions = projection && projection.comparison
      && Array.isArray(projection.comparison.transitions)
      ? projection.comparison.transitions
      : [];
    return projection;
  }

  function selectComparison(state, compareFrom, compareTo) {
    if (!state) return null;
    installComparisonBinding(state);
    const binding = state[BINDING];
    binding.syncing = true;
    if (compareFrom != null) state.compareFrom = compareFrom;
    if (compareTo != null) state.compareTo = compareTo;
    binding.syncing = false;
    return projectState(state);
  }

  return { comparisonSelection, installComparisonBinding, projectState, selectComparison };
});
