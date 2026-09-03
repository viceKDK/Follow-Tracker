(function (root, factory) {
  const domain = root && root.FollowTrackerFollowerDomain
    ? root.FollowTrackerFollowerDomain
    : (typeof module === "object" && module.exports ? require("./follower-relations.js") : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.FollowTrackerRelationshipCore = api;
    // Compatibilidad temporal con dashboard 3.1/UX mientras terminamos de
    // migrar todos los consumidores a la fachada explícita.
    root.transitionHeadline = api.headline;
    root.transitionPriority = api.priority;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain) {
  "use strict";

  if (!Domain) throw new Error("Follow Tracker Follower Domain no fue cargado.");

  function stateFor(value, followers, following) {
    return Domain.relationshipStateFor(value, followers, following);
  }

  return {
    STATE_LABELS: Domain.STATE_LABELS,
    buildTransitions: Domain.buildTransitions,
    filterCount: Domain.transitionFilterCount,
    headline: Domain.transitionHeadline,
    matchesFilter: Domain.matchesTransitionFilter,
    priority: Domain.transitionPriority,
    select: Domain.selectTransitions,
    stateFor,
    tone: Domain.transitionTone,
    usernameMap: Domain.usernameMap,
    usernameSet: Domain.usernameSet,
  };
});
