(function (root, factory) {
  const domain = root && root.FollowTrackerFollowerDomain ? root.FollowTrackerFollowerDomain
    : (typeof module === "object" && module.exports ? require("./follower-imports.js") : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = Object.assign(domain, api);
  if (root && domain) Object.assign(domain, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain) {
  "use strict";
  if (!Domain) throw new Error("Follow Tracker Follower Imports no fue cargado.");
  const { MODEL_SCHEMA_VERSION, RELATIONSHIP_STATES, STATE_LABELS, normalizeUsername, normalizeSnapshot,
    createSnapshot, diffLists, usernameMap, usernameSet } = Domain;

  function relationshipStateFor(usernameValue, followersValue, followingValue) {
    const username = normalizeUsername(usernameValue);
    const followers = followersValue instanceof Set ? followersValue : usernameSet(followersValue || []);
    const following = followingValue instanceof Set ? followingValue : usernameSet(followingValue || []);
    const followsYou = followers.has(username);
    const youFollow = following.has(username);
    if (followsYou && youFollow) return RELATIONSHIP_STATES.MUTUAL;
    if (followsYou) return RELATIONSHIP_STATES.FOLLOWS_YOU;
    if (youFollow) return RELATIONSHIP_STATES.YOU_FOLLOW;
    return RELATIONSHIP_STATES.NONE;
  }

  function deriveCategories(snapshotValue) {
    const snapshot = normalizeSnapshot(snapshotValue);
    if (!snapshot) {
      return {
        all: [],
        mutual: [],
        followersOnly: [],
        followingOnly: [],
        none: [],
        people: [],
        counts: { all: 0, mutual: 0, followersOnly: 0, followingOnly: 0, none: 0 },
      };
    }
    const followers = usernameSet(snapshot.followers);
    const following = usernameSet(snapshot.following);
    const all = [...new Set([...followers, ...following])].sort();
    const people = all.map((username) => {
      const state = relationshipStateFor(username, followers, following);
      return {
        username,
        normalized: username,
        followsYou: followers.has(username),
        youFollow: following.has(username),
        relationship: state,
      };
    });
    const mutual = people.filter((person) => person.relationship === RELATIONSHIP_STATES.MUTUAL).map((person) => person.username);
    const followersOnly = people.filter((person) => person.relationship === RELATIONSHIP_STATES.FOLLOWS_YOU).map((person) => person.username);
    const followingOnly = people.filter((person) => person.relationship === RELATIONSHIP_STATES.YOU_FOLLOW).map((person) => person.username);
    const none = people.filter((person) => person.relationship === RELATIONSHIP_STATES.NONE).map((person) => person.username);
    return {
      all,
      mutual,
      followersOnly,
      followingOnly,
      none,
      people,
      counts: {
        all: all.length,
        mutual: mutual.length,
        followersOnly: followersOnly.length,
        followingOnly: followingOnly.length,
        none: none.length,
      },
    };
  }

  function transitionHeadline(item) {
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
    return STATE_LABELS.current[item.toState] || STATE_LABELS.current.none;
  }

  function transitionTone(item) {
    if (item.fromFollowsYou && !item.toFollowsYou) return "negative";
    if (!item.fromFollowsYou && item.toFollowsYou) return "positive";
    if (!item.fromYouFollow && item.toYouFollow) return "info";
    if (item.fromYouFollow && !item.toYouFollow) return "warning";
    return "neutral";
  }

  function transitionPriority(item) {
    if (item.fromFollowsYou && !item.toFollowsYou) return 0;
    if (!item.fromFollowsYou && item.toFollowsYou) return 1;
    if (item.fromYouFollow && !item.toYouFollow) return 2;
    if (!item.fromYouFollow && item.toYouFollow) return 3;
    if (item.toState === RELATIONSHIP_STATES.YOU_FOLLOW) return 4;
    if (item.toState === RELATIONSHIP_STATES.FOLLOWS_YOU) return 5;
    if (item.toState === RELATIONSHIP_STATES.MUTUAL) return 6;
    return 7;
  }

  function buildTransitions(comparison) {
    if (!comparison || !comparison.fromSnapshot || !comparison.toSnapshot) return [];
    const fromSnapshot = normalizeSnapshot(comparison.fromSnapshot);
    const toSnapshot = normalizeSnapshot(comparison.toSnapshot);
    if (!fromSnapshot || !toSnapshot) return [];
    const names = usernameMap(
      fromSnapshot.followers,
      fromSnapshot.following,
      toSnapshot.followers,
      toSnapshot.following
    );
    const fromFollowers = usernameSet(fromSnapshot.followers);
    const fromFollowing = usernameSet(fromSnapshot.following);
    const toFollowers = usernameSet(toSnapshot.followers);
    const toFollowing = usernameSet(toSnapshot.following);

    return [...names.keys()].map((normalized) => {
      const fromState = relationshipStateFor(normalized, fromFollowers, fromFollowing);
      const toState = relationshipStateFor(normalized, toFollowers, toFollowing);
      const item = {
        username: normalized,
        normalized,
        fromState,
        toState,
        fromFollowsYou: fromFollowers.has(normalized),
        fromYouFollow: fromFollowing.has(normalized),
        toFollowsYou: toFollowers.has(normalized),
        toYouFollow: toFollowing.has(normalized),
        changed: fromState !== toState,
      };
      item.headline = transitionHeadline(item);
      item.tone = transitionTone(item);
      return item;
    }).sort((a, b) =>
      Number(b.changed) - Number(a.changed)
      || transitionPriority(a) - transitionPriority(b)
      || a.normalized.localeCompare(b.normalized)
    );
  }

  function matchesTransitionFilter(item, filter) {
    switch (filter) {
      case "changed": return item.changed;
      case "followed-you": return !item.fromFollowsYou && item.toFollowsYou;
      case "unfollowed-you": return item.fromFollowsYou && !item.toFollowsYou;
      case "you-follow": return item.toState === RELATIONSHIP_STATES.YOU_FOLLOW;
      case "follows-you": return item.toState === RELATIONSHIP_STATES.FOLLOWS_YOU;
      case "mutual": return item.toState === RELATIONSHIP_STATES.MUTUAL;
      default: return true;
    }
  }

  function transitionFilterCount(items, filter) {
    return (Array.isArray(items) ? items : []).filter((item) => matchesTransitionFilter(item, filter)).length;
  }

  function selectTransitions(items, options) {
    const settings = options && typeof options === "object" ? options : {};
    const filter = String(settings.filter || "all");
    const query = normalizeUsername(settings.query || "");
    const limit = Number.isFinite(Number(settings.limit)) ? Math.max(0, Number(settings.limit)) : Infinity;
    return (Array.isArray(items) ? items : [])
      .filter((item) => matchesTransitionFilter(item, filter))
      .filter((item) => !query || item.normalized.includes(query))
      .slice(0, limit);
  }

  function diffSnapshots(previousValue, currentValue) {
    const previous = normalizeSnapshot(previousValue) || createSnapshot({ profile: currentValue && currentValue.profile || "perfil", followers: [], following: [] });
    const current = normalizeSnapshot(currentValue) || createSnapshot({ profile: previous.profile, followers: [], following: [] });
    const followers = diffLists(previous.followers, current.followers);
    const following = diffLists(previous.following, current.following);
    const beforeCategories = deriveCategories(previous);
    const afterCategories = deriveCategories(current);
    const comparison = { fromSnapshot: previous, toSnapshot: current };
    const transitions = buildTransitions(comparison);
    return {
      schemaVersion: MODEL_SCHEMA_VERSION,
      fromSnapshot: previous,
      toSnapshot: current,
      followers,
      following,
      changes: {
        newFollowers: followers.added,
        lostFollowers: followers.removed,
        newFollowing: following.added,
        lostFollowing: following.removed,
      },
      beforeCategories,
      afterCategories,
      categoryDelta: {
        mutual: afterCategories.counts.mutual - beforeCategories.counts.mutual,
        followersOnly: afterCategories.counts.followersOnly - beforeCategories.counts.followersOnly,
        followingOnly: afterCategories.counts.followingOnly - beforeCategories.counts.followingOnly,
      },
      transitions,
      transitionCounts: {
        all: transitions.length,
        changed: transitionFilterCount(transitions, "changed"),
        followedYou: transitionFilterCount(transitions, "followed-you"),
        unfollowedYou: transitionFilterCount(transitions, "unfollowed-you"),
        youFollow: transitionFilterCount(transitions, "you-follow"),
        followsYou: transitionFilterCount(transitions, "follows-you"),
        mutual: transitionFilterCount(transitions, "mutual"),
      },
    };
  }

  return { relationshipStateFor, deriveCategories, transitionHeadline, transitionTone,
    transitionPriority, buildTransitions, matchesTransitionFilter, transitionFilterCount, selectTransitions, diffSnapshots };
});
