(function (root) {
  "use strict";
  if (typeof module === "object" && module.exports) { module.exports = require("./core-facade.js"); return; }
  if (root.FollowTrackerCore) return;
  document.write([
    '<script src="follower-identity.js"><\/script>',
    '<script src="follower-imports.js"><\/script>',
    '<script src="follower-relations.js"><\/script>',
    '<script src="core-facade.js"><\/script>',
  ].join(""));
})(typeof globalThis !== "undefined" ? globalThis : this);
