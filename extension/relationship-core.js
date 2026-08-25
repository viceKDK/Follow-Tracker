(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerRelationshipCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATE_LABELS = Object.freeze({
    current: Object.freeze({
      mutual: "Se siguen",
      follows_you: "Te sigue; no lo seguís",
      you_follow: "Lo seguís; no te sigue",
      none: "No se siguen",
    }),
    previous: Object.freeze({
      mutual: "Se seguían",
      follows_you: "Te seguía; no lo seguías",
      you_follow: "Lo seguías; no te seguía",
      none: "No se seguían",
    }),
  });

  function username(value) {
    const raw = typeof value === "string" ? value : value && value.username;
    return String(raw || "").trim();
  }

  function usernameMap() {
    const map = new Map();
    Array.from(arguments).forEach((rows) => {
      (rows || []).forEach((value) => {
        const display = username(value);
        if (display) map.set(display.toLowerCase(), display);
      });
    });
    return map;
  }

  function usernameSet(rows) {
    return new Set((rows || []).map((value) => username(value).toLowerCase()).filter(Boolean));
  }

  function stateFor(value, followers, following) {
    const followsYou = followers.has(value);
    const youFollow = following.has(value);
    if (followsYou && youFollow) return "mutual";
    if (followsYou) return "follows_you";
    if (youFollow) return "you_follow";
    return "none";
  }

  function headline(item) {
    const followedYouNow = !item.fromFollowsYou && item.toFollowsYou;
    const unfollowedYou = item.fromFollowsYou && !item.toFollowsYou;
    const youFollowNow = !item.fromYouFollow && item.toYouFollow;
    const youUnfollowed = item.fromYouFollow && !item.toYouFollow;

    if (unfollowedYou && youUnfollowed) return "Se dejaron de seguir";
    if (followedYouNow && youFollowNow) return "Se siguen ahora";
    if (unfollowedYou && youFollowNow) return "Te dejó de seguir y ahora lo seguís";
    if (followedYouNow && youUnfollowed) return "Te sigue ahora, pero vos lo dejaste de seguir";
    if (unfollowedYou) return item.toYouFollow ? "Te dejó de seguir; vos todavía lo seguís" : "Te dejó de seguir";
    if (followedYouNow) return item.toYouFollow ? "Te sigue ahora; se siguen" : "Te sigue ahora; vos no lo seguís";
    if (youUnfollowed) return item.toFollowsYou ? "Lo dejaste de seguir; todavía te sigue" : "Lo dejaste de seguir";
    if (youFollowNow) return item.toFollowsYou ? "Lo seguís ahora; se siguen" : "Lo seguís ahora; no te sigue";
    return STATE_LABELS.current[item.toState];
  }

  function tone(item) {
    if (item.fromFollowsYou && !item.toFollowsYou) return "negative";
    if (!item.fromFollowsYou && item.toFollowsYou) return "positive";
    if (!item.fromYouFollow && item.toYouFollow) return "info";
    if (item.fromYouFollow && !item.toYouFollow) return "warning";
    return "neutral";
  }

  function priority(item) {
    if (item.fromFollowsYou && !item.toFollowsYou) return 0;
    if (!item.fromFollowsYou && item.toFollowsYou) return 1;
    if (item.fromYouFollow && !item.toYouFollow) return 2;
    if (!item.fromYouFollow && item.toYouFollow) return 3;
    if (item.toState === "you_follow") return 4;
    if (item.toState === "follows_you") return 5;
    if (item.toState === "mutual") return 6;
    return 7;
  }

  function buildTransitions(comparison) {
    if (!comparison || !comparison.fromSnapshot || !comparison.toSnapshot) return [];
    const names = usernameMap(
      comparison.fromSnapshot.followers,
      comparison.fromSnapshot.following,
      comparison.toSnapshot.followers,
      comparison.toSnapshot.following
    );
    const fromFollowers = usernameSet(comparison.fromSnapshot.followers);
    const fromFollowing = usernameSet(comparison.fromSnapshot.following);
    const toFollowers = usernameSet(comparison.toSnapshot.followers);
    const toFollowing = usernameSet(comparison.toSnapshot.following);

    return [...names.entries()].map(([normalized, display]) => {
      const fromState = stateFor(normalized, fromFollowers, fromFollowing);
      const toState = stateFor(normalized, toFollowers, toFollowing);
      const item = {
        username: display,
        normalized,
        fromState,
        toState,
        fromFollowsYou: fromFollowers.has(normalized),
        fromYouFollow: fromFollowing.has(normalized),
        toFollowsYou: toFollowers.has(normalized),
        toYouFollow: toFollowing.has(normalized),
        changed: fromState !== toState,
      };
      item.headline = headline(item);
      item.tone = tone(item);
      return item;
    }).sort((a, b) =>
      Number(b.changed) - Number(a.changed)
      || priority(a) - priority(b)
      || a.normalized.localeCompare(b.normalized)
    );
  }

  function matchesFilter(item, filter) {
    switch (filter) {
      case "changed": return item.changed;
      case "followed-you": return !item.fromFollowsYou && item.toFollowsYou;
      case "unfollowed-you": return item.fromFollowsYou && !item.toFollowsYou;
      case "you-follow": return item.toState === "you_follow";
      case "follows-you": return item.toState === "follows_you";
      case "mutual": return item.toState === "mutual";
      default: return true;
    }
  }

  function filterCount(items, filter) {
    return (items || []).filter((item) => matchesFilter(item, filter)).length;
  }

  return {
    STATE_LABELS,
    buildTransitions,
    filterCount,
    headline,
    matchesFilter,
    priority,
    stateFor,
    tone,
    usernameMap,
    usernameSet,
  };
});
