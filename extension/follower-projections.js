(function (root, factory) {
  const domain = root && root.FollowTrackerFollowerDomain ? root.FollowTrackerFollowerDomain
    : (typeof module === "object" && module.exports ? require("./follower-history-engine.js") : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = Object.assign(domain, api);
  if (root && domain) Object.assign(domain, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain) {
  "use strict";
  if (!Domain) throw new Error("Follow Tracker Follower History Engine no fue cargado.");
  const { EVENT_TYPES, MODEL_SCHEMA_VERSION, RELATIONSHIP_STATES, deriveCategories, normalizeSnapshot, normalizeTimeline,
    normalizeUsername, compareReports, emptyChanges } = Domain;

  function summarizeSnapshot(snapshotValue) {
    const snapshot = normalizeSnapshot(snapshotValue);
    if (!snapshot) {
      return {
        profile: "perfil",
        updatedAt: null,
        followers: 0,
        following: 0,
        mutual: 0,
        followerOnly: 0,
        followingOnly: 0,
        categories: deriveCategories(null),
      };
    }
    const categories = deriveCategories(snapshot);
    return {
      profile: snapshot.profile,
      updatedAt: snapshot.updatedAt,
      followers: snapshot.followers.length,
      following: snapshot.following.length,
      mutual: categories.counts.mutual,
      followerOnly: categories.counts.followersOnly,
      followingOnly: categories.counts.followingOnly,
      categories,
    };
  }

  function latestReport(timelineValue) {
    const timeline = normalizeTimeline(timelineValue, timelineValue && timelineValue.profile);
    return timeline.reports.length ? timeline.reports[timeline.reports.length - 1] : null;
  }

  function buildPeopleIndex(snapshotValue, timelineValue) {
    const snapshot = normalizeSnapshot(snapshotValue);
    if (!snapshot) return [];
    const timeline = normalizeTimeline(timelineValue, snapshot.profile);
    const categories = deriveCategories(snapshot);
    const byUsername = new Map(categories.people.map((person) => [person.username, person]));
    timeline.events.forEach((event) => {
      if (!byUsername.has(event.username)) {
        byUsername.set(event.username, {
          username: event.username,
          normalized: event.username,
          followsYou: false,
          youFollow: false,
          relationship: RELATIONSHIP_STATES.HISTORICAL,
        });
      }
    });

    const eventsByUser = new Map();
    timeline.events.forEach((event) => {
      const current = eventsByUser.get(event.username) || [];
      current.push(event);
      eventsByUser.set(event.username, current);
    });

    return [...byUsername.values()].map((base) => {
      const events = (eventsByUser.get(base.username) || []).sort((a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );
      return {
        ...base,
        events,
        lastEvent: events[0] || null,
        hasUnfollowedYou: events.some((event) => event.type === EVENT_TYPES.UNFOLLOWED_YOU),
        hasFollowedYou: events.some((event) => event.type === EVENT_TYPES.FOLLOWED_YOU),
        hasYouFollowed: events.some((event) => event.type === EVENT_TYPES.YOU_FOLLOWED),
        hasYouUnfollowed: events.some((event) => event.type === EVENT_TYPES.YOU_UNFOLLOWED),
      };
    }).sort((a, b) => {
      const aTime = a.lastEvent ? new Date(a.lastEvent.occurredAt).getTime() : 0;
      const bTime = b.lastEvent ? new Date(b.lastEvent.occurredAt).getTime() : 0;
      return bTime - aTime || a.username.localeCompare(b.username);
    });
  }

  function matchesPeopleFilter(person, filter) {
    switch (filter) {
      case "unfollowed": return person.hasUnfollowedYou;
      case "follows-you": return person.relationship === RELATIONSHIP_STATES.FOLLOWS_YOU;
      case "not-following-back": return person.relationship === RELATIONSHIP_STATES.YOU_FOLLOW;
      case "mutual": return person.relationship === RELATIONSHIP_STATES.MUTUAL;
      case "historical": return person.relationship === RELATIONSHIP_STATES.HISTORICAL;
      default: return true;
    }
  }

  function selectPeople(peopleValue, options) {
    const settings = options && typeof options === "object" ? options : {};
    const filter = String(settings.filter || "all");
    const query = normalizeUsername(settings.query || "");
    const limit = Number.isFinite(Number(settings.limit)) ? Math.max(0, Number(settings.limit)) : Infinity;
    return (Array.isArray(peopleValue) ? peopleValue : [])
      .filter((person) => matchesPeopleFilter(person, filter))
      .filter((person) => !query || person.username.includes(query))
      .slice(0, limit);
  }

  function buildDashboardProjection(snapshotValue, timelineValue, options) {
    const snapshot = normalizeSnapshot(snapshotValue);
    if (!snapshot) return null;
    const timeline = normalizeTimeline(timelineValue, snapshot.profile);
    const settings = options && typeof options === "object" ? options : {};
    const reports = [...timeline.reports].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
    const latest = reports.length ? reports[reports.length - 1] : null;
    const people = buildPeopleIndex(snapshot, timeline);
    const activity = [...timeline.events].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
    const categories = deriveCategories(snapshot);

    let comparison = null;
    if (reports.length >= 2) {
      const fromId = settings.compareFrom && reports.some((report) => report.id === settings.compareFrom)
        ? settings.compareFrom
        : reports[reports.length - 2].id;
      const toId = settings.compareTo && reports.some((report) => report.id === settings.compareTo)
        ? settings.compareTo
        : reports[reports.length - 1].id;
      comparison = compareReports(timeline, fromId, toId);
    }

    return {
      schemaVersion: MODEL_SCHEMA_VERSION,
      profile: snapshot.profile,
      snapshot,
      timeline,
      summary: summarizeSnapshot(snapshot),
      categories,
      reports,
      latestReport: latest,
      latestChanges: latest && latest.changes ? latest.changes : emptyChanges(),
      people,
      activity,
      comparison,
    };
  }

  function eventLabel(type) {
    const labels = {
      [EVENT_TYPES.FOLLOWED_YOU]: "Te siguió",
      [EVENT_TYPES.UNFOLLOWED_YOU]: "Te dejó de seguir",
      [EVENT_TYPES.YOU_FOLLOWED]: "Empezaste a seguir",
      [EVENT_TYPES.YOU_UNFOLLOWED]: "Dejaste de seguir",
    };
    return labels[type] || "Cambio detectado";
  }

  function escapeCsvValue(value) {
    let text = String(value == null ? "" : value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function eventsToCsv(events) {
    const rows = Array.isArray(events) ? events : [];
    return [
      "Usuario,Evento,Fecha,Reporte,Run ID",
      ...rows.map((event) => [
        event.username,
        eventLabel(event.type),
        event.occurredAt,
        event.reportId,
        event.runId,
      ].map(escapeCsvValue).join(",")),
    ].join("\n");
  }

  function relationshipToCsv(snapshotValue) {
    const snapshot = normalizeSnapshot(snapshotValue);
    if (!snapshot) return "Usuario,Te sigue,Lo sigues,Relacion";
    const labels = {
      mutual: "Mutuo",
      follows_you: "Solo te sigue",
      you_follow: "Solo lo seguís",
      historical: "Solo historico",
    };
    return [
      "Usuario,Te sigue,Lo sigues,Relacion",
      ...deriveCategories(snapshot).people.map((person) => [
        person.username,
        person.followsYou ? "Si" : "No",
        person.youFollow ? "Si" : "No",
        labels[person.relationship] || person.relationship,
      ].map(escapeCsvValue).join(",")),
    ].join("\n");
  }

  return { summarizeSnapshot, latestReport, buildPeopleIndex, matchesPeopleFilter, selectPeople,
    buildDashboardProjection, eventLabel, escapeCsvValue, eventsToCsv, relationshipToCsv };
});
