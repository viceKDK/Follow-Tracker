(function (root) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    const hadDomain = Object.prototype.hasOwnProperty.call(globalThis, "FollowTrackerFollowerDomain");
    const previousDomain = globalThis.FollowTrackerFollowerDomain;
    try {
      delete globalThis.FollowTrackerFollowerDomain;
      module.exports = require("./history-facade.js");
    } finally {
      if (hadDomain) globalThis.FollowTrackerFollowerDomain = previousDomain;
      else delete globalThis.FollowTrackerFollowerDomain;
    }
    return;
  }
  if (root.FollowTrackerHistory) return;
  document.write([
    '<script src="follower-history-model.js"><\/script>',
    '<script src="follower-history-engine.js"><\/script>',
    '<script src="follower-projections.js"><\/script>',
    '<script src="history-facade.js"><\/script>',
  ].join(""));
})(typeof globalThis !== "undefined" ? globalThis : this);
